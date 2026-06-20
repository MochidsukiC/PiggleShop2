package jp.houlab.mochidsuki.piggleshop;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.logging.LogUtils;
import org.slf4j.Logger;

/**
 * The authoritative Piggle Shop catalog, loaded from the bundled resource
 * {@code /piggleshop/catalog.json} (ported from the design data). It is the
 * single source of truth for prices / stock / item metadata so the server can
 * re-price every checkout instead of trusting client-sent values.
 *
 * <p>Exposes the full catalog JSON (served verbatim for the {@code catalog}
 * verb) plus a per-item index for re-pricing, Minecraft item-id resolution, and
 * stock checks.
 */
public final class Catalog {

    private static final Logger LOGGER = LogUtils.getLogger();
    private static final String RESOURCE = "/piggleshop/catalog.json";

    private final JsonObject root;
    private final Map<String, JsonObject> byId = new HashMap<>();

    private Catalog(JsonObject root) {
        this.root = root;
        JsonArray items = root.getAsJsonArray("items");
        if (items != null) {
            for (JsonElement el : items) {
                JsonObject it = el.getAsJsonObject();
                byId.put(it.get("id").getAsString(), it);
            }
        }
    }

    /**
     * Load from the bundled resource. Fails loudly — a missing or malformed
     * catalog is a packaging error, never silently swallowed (user CLAUDE.md
     * bug-fix policy: fix at the source, do not hide).
     */
    public static Catalog load() {
        try (InputStream in = Catalog.class.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("catalog resource not found: " + RESOURCE);
            }
            JsonObject root = JsonParser
                    .parseReader(new InputStreamReader(in, StandardCharsets.UTF_8))
                    .getAsJsonObject();
            Catalog c = new Catalog(root);
            LOGGER.info("Piggle Shop: catalog loaded ({} items)", c.byId.size());
            return c;
        } catch (Exception e) {
            throw new IllegalStateException("failed to load Piggle Shop catalog", e);
        }
    }

    /** The full catalog object: {@code {version, currency, cats, rarity, items}}. */
    public JsonObject root() {
        return root;
    }

    /** The item object for {@code id}, or {@code null} if unknown. */
    public JsonObject item(String id) {
        return byId.get(id);
    }

    public boolean has(String id) {
        return byId.containsKey(id);
    }

    public double price(String id) {
        JsonObject it = byId.get(id);
        return it == null ? 0.0 : it.get("price").getAsDouble();
    }

    public int stock(String id) {
        JsonObject it = byId.get(id);
        return it == null ? 0 : it.get("stock").getAsInt();
    }

    /** The Minecraft item id (e.g. {@code minecraft:diamond}) used for delivery. */
    public String mcId(String id) {
        JsonObject it = byId.get(id);
        return it == null ? null : it.get("mc").getAsString();
    }

    public String name(String id) {
        JsonObject it = byId.get(id);
        return it == null ? id : it.get("name").getAsString();
    }
}
