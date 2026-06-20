package jp.houlab.mochidsuki.piggleshop;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.logging.LogUtils;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;
import org.slf4j.Logger;

import jp.houlab.mochidsuki.mochi.connector.CommandDispatch;

/**
 * Piggle Shop receiver extension (DEV.md §7.3) — the in-JVM "enclosed backend".
 *
 * <p>The MochiOS connector relays a player's app request (opaque JSON) here as a
 * {@code CMD_INBOUND}; we interpret the verb, mutate the world on the server
 * thread, and reply (toward the requester) with a JSON result. Verbs:
 * <ul>
 *   <li>{@code status}   → {ok, app, version}</li>
 *   <li>{@code catalog}  → the full catalog ({version, currency, cats, rarity, items})</li>
 *   <li>{@code item}     → {ok, item}</li>
 *   <li>{@code checkout} → server re-price + mock payment + inventory delivery to the entered MCID</li>
 *   <li>{@code orders}   → a player's recent orders</li>
 * </ul>
 *
 * <p>Checkout is <b>idempotent by {@code order_id}</b>: a replayed order returns
 * the prior result and never double-grants. World mutation runs on the server
 * thread ({@link MinecraftServer#submit}); {@link #handle} itself runs on the
 * connector IO thread, so blocking on that future is safe (no deadlock).
 *
 * <p>Payment is a <b>mock</b> (auto-approved, no real debit) per the current
 * design — the redirect/approve UX lives in the client.
 */
public final class PiggleShopExtension implements CommandDispatch.Handler {

    private static final Logger LOGGER = LogUtils.getLogger();

    /** Free shipping at or above this エメ subtotal (mirrors the design). */
    private static final double SHIP_FREE_OVER = 50.0;
    private static final double SHIP_FEE = 1.50;

    private final MinecraftServer server;
    private final Catalog catalog;

    /** order_id → completed order result (idempotent replays). */
    private final Map<String, JsonObject> ordersById = new ConcurrentHashMap<>();
    /** mcid (lower-case) → order_ids, newest first. */
    private final Map<String, List<String>> ordersByPlayer = new ConcurrentHashMap<>();

    public PiggleShopExtension(MinecraftServer server, Catalog catalog) {
        this.server = server;
        this.catalog = catalog;
    }

    @Override
    public void handle(String src, byte[] data, CommandDispatch.Replier reply) {
        JsonObject req;
        try {
            req = JsonParser.parseString(new String(data, StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (RuntimeException e) {
            LOGGER.warn("piggleshop: malformed request dropped: {}", e.toString());
            return;
        }
        String reqId = optString(req, "req_id");
        String verb = optString(req, "verb");
        JsonObject res;
        try {
            res = switch (verb) {
                case "status"   -> status();
                case "catalog"  -> catalog.root().deepCopy();
                case "item"     -> item(optString(req, "id"));
                case "checkout" -> checkout(req);
                case "orders"   -> ordersFor(optString(req, "mcid"));
                default         -> error("unknown_verb", "verb=" + verb);
            };
        } catch (RuntimeException e) {
            LOGGER.warn("piggleshop: handler error for verb '{}': {}", verb, e.toString());
            res = error("internal", String.valueOf(e.getMessage()));
        }
        res.addProperty("req_id", reqId);
        reply.reply(src, res.toString().getBytes(StandardCharsets.UTF_8));
    }

    // ── verbs ──────────────────────────────────────────────────────────────

    private JsonObject status() {
        JsonObject o = new JsonObject();
        o.addProperty("ok", true);
        o.addProperty("app", "piggleshop");
        o.addProperty("version", catalog.root().get("version").getAsString());
        return o;
    }

    private JsonObject item(String id) {
        JsonObject it = catalog.item(id);
        if (it == null) {
            return error("not_found", "item=" + id);
        }
        JsonObject o = new JsonObject();
        o.addProperty("ok", true);
        o.add("item", it.deepCopy());
        return o;
    }

    private JsonObject ordersFor(String mcid) {
        JsonObject o = new JsonObject();
        o.addProperty("ok", true);
        JsonArray arr = new JsonArray();
        List<String> ids = ordersByPlayer.getOrDefault(key(mcid), List.of());
        for (String id : ids) {
            JsonObject ord = ordersById.get(id);
            if (ord != null) {
                arr.add(ord.deepCopy());
            }
        }
        o.add("orders", arr);
        return o;
    }

    /** {@code checkout {order_id, items:[{id,qty}], mcid, note?}} */
    private JsonObject checkout(JsonObject req) {
        String orderId = optString(req, "order_id");
        if (orderId.isEmpty()) {
            return error("bad_order", "order_id required");
        }
        // Idempotency: a replayed order returns the prior result, no re-grant.
        JsonObject prior = ordersById.get(orderId);
        if (prior != null) {
            JsonObject dup = prior.deepCopy();
            dup.addProperty("duplicate", true);
            return dup;
        }

        String mcid = optString(req, "mcid");
        if (mcid.isEmpty()) {
            return error("bad_mcid", "mcid required");
        }

        // Server-authoritative re-pricing — never trust client-sent prices.
        List<Line> lines = new ArrayList<>();
        double subtotal = 0.0;
        JsonArray items = req.getAsJsonArray("items");
        if (items == null || items.isEmpty()) {
            return error("empty_cart", "items required");
        }
        for (JsonElement el : items) {
            JsonObject line = el.getAsJsonObject();
            String id = optString(line, "id");
            int qty = line.has("qty") ? line.get("qty").getAsInt() : 0;
            if (!catalog.has(id) || qty <= 0) {
                return error("bad_line", "id=" + id + " qty=" + qty);
            }
            double price = catalog.price(id);
            lines.add(new Line(id, catalog.mcId(id), catalog.name(id), qty, price));
            subtotal += price * qty;
        }
        double shipping = (subtotal >= SHIP_FREE_OVER || subtotal == 0.0) ? 0.0 : SHIP_FEE;
        double total = subtotal + shipping;

        // Mock payment: auto-approved, no real debit (current design).

        // Deliver on the server thread (inventory access is not thread-safe
        // off-thread). handle() runs on the connector IO thread, so blocking
        // here does not deadlock the server.
        Delivery delivery = server.submit(() -> deliver(mcid, lines)).join();

        JsonObject order = new JsonObject();
        order.addProperty("ok", true);
        order.addProperty("success", delivery.ok);
        order.addProperty("order_id", orderId);
        order.addProperty("mcid", mcid);
        order.addProperty("status", delivery.ok ? "配送中" : "保留");
        order.addProperty("subtotal", round2(subtotal));
        order.addProperty("shipping", round2(shipping));
        order.addProperty("total", round2(total));
        order.addProperty("delivered", delivery.delivered);
        JsonArray lineArr = new JsonArray();
        for (Line l : lines) {
            JsonObject lo = new JsonObject();
            lo.addProperty("id", l.id);
            lo.addProperty("qty", l.qty);
            lo.addProperty("price", round2(l.price));
            lineArr.add(lo);
        }
        order.add("lines", lineArr);
        if (delivery.error != null) {
            order.addProperty("error", delivery.error);
        }

        // Record for idempotent replays + order history.
        ordersById.put(orderId, order);
        ordersByPlayer.computeIfAbsent(key(mcid), k -> new CopyOnWriteArrayList<>()).add(0, orderId);
        LOGGER.info("piggleshop: order {} for {} — {} item(s), total {} エメ, delivered={}",
                orderId, mcid, lines.size(), round2(total), delivery.ok);
        return order.deepCopy();
    }

    // ── delivery (server thread) ─────────────────────────────────────────────

    private Delivery deliver(String mcid, List<Line> lines) {
        ServerPlayer player = server.getPlayerList().getPlayerByName(mcid);
        if (player == null) {
            return new Delivery(false, 0, "player_offline");
        }
        int delivered = 0;
        for (Line line : lines) {
            ResourceLocation rl = line.mc == null ? null : ResourceLocation.tryParse(line.mc);
            Item item = rl == null ? null : ForgeRegistries.ITEMS.getValue(rl);
            if (item == null) {
                LOGGER.warn("piggleshop: unknown item '{}' (catalog id {})", line.mc, line.id);
                continue;
            }
            int max = Math.max(1, new ItemStack(item).getMaxStackSize());
            int remaining = line.qty;
            while (remaining > 0) {
                int n = Math.min(remaining, max);
                ItemStack stack = new ItemStack(item, n);
                if (!player.getInventory().add(stack)) {
                    player.drop(stack, false); // inventory full → drop at the player
                }
                remaining -= n;
                delivered += n;
            }
        }
        return new Delivery(true, delivered, null);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static JsonObject error(String code, String detail) {
        JsonObject o = new JsonObject();
        o.addProperty("ok", false);
        o.addProperty("error", code);
        if (detail != null) {
            o.addProperty("detail", detail);
        }
        return o;
    }

    private static String optString(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsString() : "";
    }

    private static String key(String mcid) {
        return mcid == null ? "" : mcid.toLowerCase();
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private record Line(String id, String mc, String name, int qty, double price) {}

    private record Delivery(boolean ok, int delivered, String error) {}
}
