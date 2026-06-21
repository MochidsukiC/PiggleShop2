package jp.houlab.mochidsuki.piggleshop;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

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
 * Piggle Shop receiver extension (DEV.md §7.3) — <b>grant-only executor</b>.
 *
 * <p>Under the split architecture, the {@code piggleshop.cs.mnn} web backend owns
 * the catalog / pricing / checkout / mock-payment and player-facing HTTP. When a
 * checkout is confirmed, cs.mnn sends a grant command over the MochiOS command bus
 * to {@code piggleshop.<UUID>.minecraft.auto.mnn}; the Hub auto-routes it to the
 * player's live server, the connector relays it here as a {@code CMD_INBOUND}, and
 * this handler delivers the items to the player's inventory. The mod no longer
 * interprets a catalog — it is a blind executor of grants, so it MUST authorize
 * the sender.
 *
 * <p>Command (opaque JSON {@code data}):
 * <pre>{"order_id":"...","verb":"inventory.give",
 *      "target_uuid":"&lt;mc-uuid&gt;" | "mcid":"&lt;name&gt;",
 *      "items":[{"item":"minecraft:diamond","count":1}, ...]}</pre>
 * Ack (CMD_OUTBOUND back to {@code src}):
 * <pre>{"order_id":"...","status":"ok|duplicate|unknown_verb|bad_request|unauthorized|player_offline|unknown_item:&lt;mc&gt;","delivered":N}</pre>
 *
 * <p>Security: {@code src} is the Hub/cert-asserted backend app_id. We only accept
 * grants from the expected cs.mnn backend ({@link #ALLOWED_SRC}); any other app_id
 * is rejected {@code unauthorized} (since the mod now executes grants with no
 * pricing/checkout guard of its own).
 *
 * <p>Idempotency: {@code order_id} is claimed only on a successful delivery, so a
 * transient failure (player offline / unknown item) is retryable with the same id;
 * a replay of a completed order acks {@code duplicate} and never double-grants.
 * Process-local only (lost on restart) — persistent dedup is a tracked follow-up.
 */
public final class PiggleShopExtension implements CommandDispatch.Handler {

    private static final Logger LOGGER = LogUtils.getLogger();

    /** The backend app_id (cert SAN) allowed to issue grants. */
    private static final String ALLOWED_SRC = "piggleshop";

    /** Bounds the server-thread delivery loop against a hostile/buggy backend. */
    private static final int MAX_QTY_PER_LINE = 4096;

    private final MinecraftServer server;

    /** order_ids that have been fully delivered (idempotency, process-local). */
    private final Set<String> processedOrders = ConcurrentHashMap.newKeySet();

    public PiggleShopExtension(MinecraftServer server) {
        this.server = server;
    }

    @Override
    public void handle(String src, byte[] data, CommandDispatch.Replier reply) {
        JsonObject cmd;
        String orderId;
        try {
            cmd = JsonParser.parseString(new String(data, StandardCharsets.UTF_8)).getAsJsonObject();
            orderId = optString(cmd, "order_id");
            if (orderId.isEmpty()) {
                throw new IllegalArgumentException("order_id required");
            }
        } catch (RuntimeException e) {
            // No usable order_id ⇒ cannot ack meaningfully; fail closed (log only).
            LOGGER.warn("piggleshop: malformed grant dropped from src '{}': {}", src, e.toString());
            return;
        }

        // Authorize the sender: only the cs.mnn backend may mint items. src is
        // cert-asserted by the Hub, so this is a real trust boundary.
        if (!ALLOWED_SRC.equals(src)) {
            LOGGER.warn("piggleshop: rejected grant from unauthorized src '{}' (order {})", src, orderId);
            ack(reply, src, orderId, "unauthorized", 0);
            return;
        }

        if (!"inventory.give".equals(optString(cmd, "verb"))) {
            ack(reply, src, orderId, "unknown_verb", 0);
            return;
        }

        // Replayed completed order ⇒ ack duplicate, deliver nothing.
        if (processedOrders.contains(orderId)) {
            ack(reply, src, orderId, "duplicate", 0);
            return;
        }

        Recipient who;
        List<Line> lines;
        try {
            who = parseRecipient(cmd);
            lines = parseItems(cmd);
        } catch (RuntimeException e) {
            ack(reply, src, orderId, "bad_request", 0);
            return;
        }

        // Deliver atomically on the server thread. handle() runs on the connector
        // IO thread, so blocking on the future does not deadlock the server.
        Delivery d = server.submit(() -> deliver(who, lines)).join();
        if (!d.ok) {
            // Nothing was granted ⇒ leave order_id unclaimed so cs.mnn can retry.
            ack(reply, src, orderId, d.error, 0);
            return;
        }

        processedOrders.add(orderId); // claim only on success
        LOGGER.info("piggleshop: granted order {} → {} ({} item(s))", orderId, who, d.delivered);
        ack(reply, src, orderId, "ok", d.delivered);
    }

    // ── delivery (server thread) ─────────────────────────────────────────────

    private Delivery deliver(Recipient who, List<Line> lines) {
        ServerPlayer player = who.uuid != null
                ? server.getPlayerList().getPlayer(who.uuid)
                : server.getPlayerList().getPlayerByName(who.mcid);
        if (player == null) {
            return new Delivery(false, 0, "player_offline");
        }
        // Resolve every item id first — a bad id fails the whole order before any
        // grant, so we never record a partial delivery as success.
        List<Item> resolved = new ArrayList<>(lines.size());
        for (Line line : lines) {
            ResourceLocation rl = ResourceLocation.tryParse(line.mc);
            Item item = rl == null ? null : ForgeRegistries.ITEMS.getValue(rl);
            if (item == null) {
                LOGGER.warn("piggleshop: unknown item '{}'", line.mc);
                return new Delivery(false, 0, "unknown_item:" + line.mc);
            }
            resolved.add(item);
        }
        int delivered = 0;
        for (int i = 0; i < lines.size(); i++) {
            Item item = resolved.get(i);
            int max = Math.max(1, new ItemStack(item).getMaxStackSize());
            int remaining = lines.get(i).count;
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

    // ── parsing ──────────────────────────────────────────────────────────────

    /** {@code target_uuid} (preferred) or {@code mcid}. Throws if neither is valid. */
    private static Recipient parseRecipient(JsonObject cmd) {
        String uuidStr = optString(cmd, "target_uuid");
        if (!uuidStr.isEmpty()) {
            return new Recipient(UUID.fromString(uuidStr), null);
        }
        String mcid = optString(cmd, "mcid");
        if (!mcid.isEmpty()) {
            return new Recipient(null, mcid);
        }
        throw new IllegalArgumentException("target_uuid or mcid required");
    }

    private static List<Line> parseItems(JsonObject cmd) {
        if (!cmd.has("items") || !cmd.get("items").isJsonArray()) {
            throw new IllegalArgumentException("items array required");
        }
        JsonArray arr = cmd.getAsJsonArray("items");
        if (arr.isEmpty()) {
            throw new IllegalArgumentException("items empty");
        }
        List<Line> lines = new ArrayList<>(arr.size());
        for (JsonElement el : arr) {
            if (!el.isJsonObject()) {
                throw new IllegalArgumentException("item line must be an object");
            }
            JsonObject line = el.getAsJsonObject();
            String mc = optString(line, "item");
            int count = optInt(line, "count");
            if (mc.isEmpty() || count <= 0 || count > MAX_QTY_PER_LINE) {
                throw new IllegalArgumentException("bad line item=" + mc + " count=" + count);
            }
            lines.add(new Line(mc, count));
        }
        return lines;
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static void ack(CommandDispatch.Replier reply, String dst, String orderId,
                            String status, int delivered) {
        JsonObject o = new JsonObject();
        o.addProperty("order_id", orderId);
        o.addProperty("status", status);
        o.addProperty("delivered", delivered);
        reply.reply(dst, o.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String optString(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isString()
                ? e.getAsString() : "";
    }

    private static int optInt(JsonObject o, String k) {
        if (!o.has(k) || !o.get(k).isJsonPrimitive() || !o.getAsJsonPrimitive(k).isNumber()) {
            return 0;
        }
        try {
            return o.get(k).getAsBigDecimal().intValueExact();
        } catch (ArithmeticException | NumberFormatException e) {
            return 0;
        }
    }

    private record Recipient(UUID uuid, String mcid) {
        @Override
        public String toString() {
            return uuid != null ? uuid.toString() : mcid;
        }
    }

    private record Line(String mc, int count) {}

    private record Delivery(boolean ok, int delivered, String error) {}
}
