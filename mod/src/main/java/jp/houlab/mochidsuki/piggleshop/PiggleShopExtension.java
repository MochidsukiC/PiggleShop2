package jp.houlab.mochidsuki.piggleshop;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
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
 * <p>Checkout is <b>idempotent by {@code order_id}</b>: the id is reserved before
 * delivery (see {@link #ordersById}), so a concurrent or replayed order returns
 * the prior result and never double-grants. This idempotency is <em>process-local
 * only</em> — it does not survive a server restart (persistent dedupe is a tracked
 * follow-up). World mutation runs on the server thread
 * ({@link MinecraftServer#submit}); {@link #handle} itself runs on the connector
 * IO thread, so blocking on that future is safe (no deadlock).
 *
 * <p>Payment is a <b>mock</b> (auto-approved, no real debit) per the current
 * design — the redirect/approve UX lives in the client.
 */
public final class PiggleShopExtension implements CommandDispatch.Handler {

    private static final Logger LOGGER = LogUtils.getLogger();

    /** Free shipping at or above this エメ subtotal (mirrors the design). */
    private static final double SHIP_FREE_OVER = 50.0;
    private static final double SHIP_FEE = 1.50;

    /**
     * Hard upper bound on a single line's quantity. Bounds the server-thread
     * delivery loop and makes the {@code delivered} counter overflow-impossible,
     * so a hostile or buggy client cannot stall the server or wrap the count.
     */
    private static final int MAX_QTY_PER_LINE = 4096;

    private final MinecraftServer server;
    private final Catalog catalog;

    /**
     * order_id → order result future. Inserted (incomplete) at checkout start to
     * reserve the id <em>before</em> delivery, so a concurrent or replayed order
     * with the same id never double-grants — it joins this future and returns the
     * same result instead. Completed exceptionally and removed on failure so a
     * failed attempt can be retried.
     */
    private final Map<String, CompletableFuture<JsonObject>> ordersById = new ConcurrentHashMap<>();
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
            // Fail closed but visibly: reply with an error so the requester fails
            // fast instead of timing out. req_id is unknown (payload unparseable).
            LOGGER.warn("piggleshop: malformed request: {}", e.toString());
            JsonObject err = error("bad_json", "request was not a JSON object");
            reply.reply(src, err.toString().getBytes(StandardCharsets.UTF_8));
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
            CompletableFuture<JsonObject> ord = ordersById.get(id);
            // Only ids that completed delivery are placed in ordersByPlayer, so
            // these futures are already completed; getNow avoids any blocking.
            if (ord != null) {
                JsonObject done = ord.getNow(null);
                if (done != null) {
                    arr.add(done.deepCopy());
                }
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

        // Reserve the order_id atomically *before* any delivery. The first caller
        // installs an incomplete future; any concurrent or replayed checkout with
        // the same id sees the existing future, joins it, and returns the prior
        // result — so a replay or a race can never double-grant. (Idempotency is
        // process-local: it does not survive a server restart — see DEV.md.)
        CompletableFuture<JsonObject> slot = new CompletableFuture<>();
        CompletableFuture<JsonObject> existing = ordersById.putIfAbsent(orderId, slot);
        if (existing != null) {
            JsonObject dup;
            try {
                dup = existing.join().deepCopy();
            } catch (RuntimeException e) {
                // The original attempt failed and abandoned its reservation; the
                // id is now free to retry. Surface a retryable error rather than
                // hanging or masquerading as a success.
                return error("retry", "concurrent checkout failed for order_id=" + orderId);
            }
            dup.addProperty("duplicate", true);
            return dup;
        }

        // From here we own `slot` and MUST resolve it. On any failure we complete
        // it exceptionally (waking any waiter) and remove the reservation so the id
        // can be retried; on success we complete it and keep it for idempotent
        // replays. Errors (e.g. bad_mcid) are *not* grants, so they free the id.
        try {
            JsonObject order = processCheckout(req, orderId);
            if (!order.get("ok").getAsBoolean()) {
                slot.completeExceptionally(new IllegalStateException("checkout rejected"));
                ordersById.remove(orderId, slot);
                return order;
            }
            slot.complete(order);
            ordersByPlayer.computeIfAbsent(key(order.get("mcid").getAsString()),
                    k -> new CopyOnWriteArrayList<>()).add(0, orderId);
            return order.deepCopy();
        } catch (RuntimeException e) {
            slot.completeExceptionally(e);
            ordersById.remove(orderId, slot);
            throw e;
        }
    }

    /**
     * The pure checkout body: validate, server-authoritatively re-price, run the
     * mock payment, and deliver on the server thread. Returns either an
     * {@code error(...)} object (no grant happened) or a completed order object.
     */
    private JsonObject processCheckout(JsonObject req, String orderId) {
        String mcid = optString(req, "mcid");
        if (mcid.isEmpty()) {
            return error("bad_mcid", "mcid required");
        }

        if (!req.has("items") || !req.get("items").isJsonArray()) {
            return error("empty_cart", "items array required");
        }
        JsonArray items = req.getAsJsonArray("items");
        if (items.isEmpty()) {
            return error("empty_cart", "items required");
        }

        // Server-authoritative re-pricing — never trust client-sent prices.
        List<Line> lines = new ArrayList<>();
        double subtotal = 0.0;
        for (JsonElement el : items) {
            if (!el.isJsonObject()) {
                return error("bad_line", "line must be an object");
            }
            JsonObject line = el.getAsJsonObject();
            String id = optString(line, "id");
            int qty = optInt(line, "qty");
            if (!catalog.has(id) || qty <= 0 || qty > MAX_QTY_PER_LINE) {
                return error("bad_line", "id=" + id + " qty=" + qty);
            }
            double price = catalog.price(id);
            lines.add(new Line(id, catalog.mcId(id), catalog.name(id), qty, price));
            subtotal += price * qty;
        }
        double shipping = subtotal >= SHIP_FREE_OVER ? 0.0 : SHIP_FEE;
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

        LOGGER.info("piggleshop: order {} for {} — {} item(s), total {} エメ, delivered={}",
                orderId, mcid, lines.size(), round2(total), delivery.ok);
        return order;
    }

    // ── delivery (server thread) ─────────────────────────────────────────────

    private Delivery deliver(String mcid, List<Line> lines) {
        ServerPlayer player = server.getPlayerList().getPlayerByName(mcid);
        if (player == null) {
            return new Delivery(false, 0, "player_offline");
        }
        // Resolve every catalog item id first. A bad/typo mc id is a packaging
        // error, not a partial-fulfilment case — fail the whole order before
        // granting anything so we never record a missing line as delivered.
        List<Item> resolved = new ArrayList<>(lines.size());
        for (Line line : lines) {
            ResourceLocation rl = line.mc == null ? null : ResourceLocation.tryParse(line.mc);
            Item item = rl == null ? null : ForgeRegistries.ITEMS.getValue(rl);
            if (item == null) {
                LOGGER.warn("piggleshop: unknown item '{}' (catalog id {})", line.mc, line.id);
                return new Delivery(false, 0, "unknown_item:" + line.id);
            }
            resolved.add(item);
        }
        int delivered = 0;
        for (int i = 0; i < lines.size(); i++) {
            Item item = resolved.get(i);
            int max = Math.max(1, new ItemStack(item).getMaxStackSize());
            int remaining = lines.get(i).qty;
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

    /**
     * Reads {@code k} as a string, returning "" for anything that is not a JSON
     * string (absent, null, object/array, or a non-string primitive). Strict: a
     * number/boolean is rejected rather than coerced (e.g. {@code "mcid":123} does
     * not become {@code "123"}). Must not throw — callers read {@code req_id}/
     * {@code verb} outside the verb-dispatch try/catch, so a hostile
     * {@code {"verb":{}}} must degrade to "" (→ unknown_verb) rather than escaping
     * {@link #handle} with no reply.
     */
    private static String optString(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isString()
                ? e.getAsString() : "";
    }

    /**
     * Reads {@code k} as an int, tolerating client type sloppiness: returns 0
     * (rejected by the caller's {@code qty <= 0} guard) when the key is absent or
     * not an exact integer. A non-integral number (e.g. {@code 1.5}) is rejected
     * rather than silently truncated, so quantity validation stays strict.
     */
    private static int optInt(JsonObject o, String k) {
        if (!o.has(k) || !o.get(k).isJsonPrimitive() || !o.getAsJsonPrimitive(k).isNumber()) {
            return 0;
        }
        try {
            return o.get(k).getAsBigDecimal().intValueExact();
        } catch (ArithmeticException e) {
            return 0; // fractional or out-of-int-range → reject as invalid qty
        }
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
