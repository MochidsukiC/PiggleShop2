package jp.houlab.mochidsuki.piggleshop;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.logging.LogUtils;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.item.Item;
import net.minecraftforge.registries.ForgeRegistries;
import org.slf4j.Logger;

import jp.houlab.mochidsuki.autoeconomicmanagementmod.common.api.AutoEconomicAPI;
import jp.houlab.mochidsuki.autoeconomicmanagementmod.common.api.dto.PriceSearchResult;
import jp.houlab.mochidsuki.piggleshop.aem.AutoEconomicAPIProvider;

/**
 * Builds the shop catalog. The authoritative <b>listing</b> + <b>prices</b> come
 * from AutoEconomicManagementMod (AEM, {@link AutoEconomicAPI#getAllPrices()} /
 * {@link AutoEconomicAPI#getCurrentPrice}); presentation metadata
 * (category = creative tab, rarity = vanilla rarity, texture) is derived from
 * Minecraft via {@link CatalogMeta}, and the description is "システムが出品"
 * (system-listed) until per-user listings exist.
 *
 * <p>When AEM is not installed/available it falls back to the bundled static
 * {@link Catalog} (the design's curated set) so dev / AEM-less servers still
 * function. The built snapshot is cached with a short TTL; checkout always
 * re-prices against the live AEM price.
 */
public final class CatalogService {

    private static final Logger LOGGER = LogUtils.getLogger();
    private static final long TTL_MS = 30_000;
    /** System-listed items are minted on purchase → effectively unlimited stock. */
    private static final int SYSTEM_STOCK = 9999;

    private final MinecraftServer server;
    private final AutoEconomicAPIProvider aem;
    private final CatalogMeta meta;
    private final Catalog fallback;

    private volatile JsonObject cachedRoot;
    private volatile Map<String, Entry> byId = Map.of();
    private volatile boolean fromAem = false;
    private volatile long builtAt = 0;

    /** A catalog row. {@code id} is the client/catalog key; {@code mc} is the
     * Minecraft resource id used for delivery + AEM pricing. In AEM mode id==mc. */
    public record Entry(String id, String mc, String name, String tex, String cat,
                        String rarity, double price) {}

    public CatalogService(MinecraftServer server, AutoEconomicAPIProvider aem,
                          CatalogMeta meta, Catalog fallback) {
        this.server = server;
        this.aem = aem;
        this.meta = meta;
        this.fallback = fallback;
    }

    // ── build / cache ────────────────────────────────────────────────────────

    /** The catalog JSON ({version, currency, source, cats, rarity, items}). */
    public JsonObject root() {
        ensureFresh();
        return cachedRoot;
    }

    public boolean has(String id) { ensureFresh(); return byId.containsKey(id); }
    public String mc(String id)   { ensureFresh(); Entry e = byId.get(id); return e == null ? null : e.mc; }
    public String name(String id) { ensureFresh(); Entry e = byId.get(id); return e == null ? id : e.name; }

    /** Authoritative current price: the live AEM price when available, else the
     * snapshot price. Never trusts a client-sent price. */
    public double priceNow(String id) {
        ensureFresh();
        Entry e = byId.get(id);
        if (e == null) return 0.0;
        Optional<BigDecimal> live = aem.getAPI().flatMap(api -> api.getCurrentPrice(e.mc));
        return live.map(BigDecimal::doubleValue).orElse(e.price);
    }

    public JsonObject item(String id) {
        ensureFresh();
        if (cachedRoot == null) return null;
        for (JsonElement el : cachedRoot.getAsJsonArray("items")) {
            JsonObject it = el.getAsJsonObject();
            if (id.equals(it.get("id").getAsString())) return it.deepCopy();
        }
        return null;
    }

    private void ensureFresh() {
        if (cachedRoot == null || System.currentTimeMillis() - builtAt > TTL_MS) {
            refresh();
        }
    }

    /** Rebuild the snapshot from AEM, falling back to the static catalog. */
    public synchronized void refresh() {
        if (cachedRoot != null && System.currentTimeMillis() - builtAt <= TTL_MS) {
            return; // another thread rebuilt while we waited
        }
        Optional<AutoEconomicAPI> apiOpt = aem.getAPI();
        if (apiOpt.isPresent()) {
            try {
                buildFromAem(apiOpt.get());
                builtAt = System.currentTimeMillis();
                return;
            } catch (Exception e) {
                LOGGER.warn("piggleshop: AEM catalog build failed, using static fallback: {}", e.toString());
            }
        }
        buildFromStatic();
        builtAt = System.currentTimeMillis();
    }

    private void buildFromAem(AutoEconomicAPI api) {
        Map<String, Entry> map = new LinkedHashMap<>();
        Set<String> usedCats = new LinkedHashSet<>();
        JsonArray items = new JsonArray();
        for (PriceSearchResult pr : api.getAllPrices()) {
            String id = pr.getItemId();
            if (id == null || "minecraft:air".equals(id)) continue;
            ResourceLocation rl = ResourceLocation.tryParse(id);
            Item item = rl == null ? null : ForgeRegistries.ITEMS.getValue(rl);
            if (item == null) continue; // not present on this server
            String name = pr.getDisplayName() != null && !pr.getDisplayName().isEmpty()
                    ? pr.getDisplayName() : id;
            double price = pr.getPrice() != null ? pr.getPrice().doubleValue() : 0.0;
            String cat = meta.categoryOf(id, item);
            String rarity = meta.rarityOf(item);
            String tex = CatalogMeta.texOf(id);
            usedCats.add(cat);
            map.put(id, new Entry(id, id, name, tex, cat, rarity, price));
            items.add(itemJson(id, name, tex, cat, rarity, price, "システムが出品"));
        }
        JsonObject root = new JsonObject();
        root.addProperty("version", safeApiVersion(api));
        root.addProperty("currency", "eme");
        root.addProperty("source", "aem");
        root.add("cats", meta.catsJson(usedCats));
        root.add("rarity", meta.rarityJson());
        root.add("items", items);
        this.cachedRoot = root;
        this.byId = map;
        this.fromAem = true;
        LOGGER.info("piggleshop: catalog built from AEM ({} items)", map.size());
    }

    /** Dev / AEM-absent fallback: the bundled design catalog, enriched with a
     * {@code tex} (= catalog id) and a system-listed marker. */
    private void buildFromStatic() {
        JsonObject root = fallback.root().deepCopy();
        Map<String, Entry> map = new LinkedHashMap<>();
        for (JsonElement el : root.getAsJsonArray("items")) {
            JsonObject it = el.getAsJsonObject();
            String id = it.get("id").getAsString();
            String mc = it.has("mc") ? it.get("mc").getAsString() : id;
            String tex = it.has("tex") ? it.get("tex").getAsString() : id;
            it.addProperty("tex", tex);
            map.put(id, new Entry(id, mc, it.get("name").getAsString(), tex,
                    it.has("cat") ? it.get("cat").getAsString() : "other",
                    it.has("rarity") ? it.get("rarity").getAsString() : "common",
                    it.has("price") ? it.get("price").getAsDouble() : 0.0));
        }
        root.addProperty("source", "static");
        this.cachedRoot = root;
        this.byId = map;
        this.fromAem = false;
        LOGGER.info("piggleshop: catalog built from static fallback ({} items, AEM unavailable)", map.size());
    }

    private static JsonObject itemJson(String id, String name, String tex, String cat,
                                       String rarity, double price, String blurb) {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        o.addProperty("name", name);
        o.addProperty("tex", tex);
        o.addProperty("cat", cat);
        o.addProperty("price", Math.round(price * 100.0) / 100.0);
        o.addProperty("rarity", rarity);
        o.addProperty("stock", SYSTEM_STOCK);
        o.addProperty("hot", false);
        o.addProperty("blurb", blurb);
        return o;
    }

    private static String safeApiVersion(AutoEconomicAPI api) {
        try {
            String v = api.getAPIVersion();
            return v != null ? v : "aem";
        } catch (Exception e) {
            return "aem";
        }
    }
}
