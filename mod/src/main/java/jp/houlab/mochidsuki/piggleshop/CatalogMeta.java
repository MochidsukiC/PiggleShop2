package jp.houlab.mochidsuki.piggleshop;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.logging.LogUtils;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.DiggerItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.ShieldItem;
import net.minecraft.world.item.SwordItem;
import net.minecraft.world.item.TridentItem;
import net.minecraftforge.registries.ForgeRegistries;
import org.slf4j.Logger;

/**
 * Presentation metadata for catalog items the way the design's UI needs it,
 * derived from Minecraft itself (AEM only supplies id / name / price):
 * <ul>
 *   <li><b>category</b> = the item's Creative-inventory tab (built once at server
 *       start by scanning {@link CreativeModeTabs}); a type-based heuristic is the
 *       fallback if the tab scan is unavailable.</li>
 *   <li><b>rarity</b> = the item's vanilla {@link Rarity} (common/uncommon/rare/epic).</li>
 *   <li><b>tex</b> = a client-asset-safe texture base name (namespace stripped).</li>
 * </ul>
 */
public final class CatalogMeta {

    private static final Logger LOGGER = LogUtils.getLogger();

    /** Creative-tab path → {label(ja), glyph, color} for the UI category chips. */
    private static final Map<String, String[]> TAB_META = new LinkedHashMap<>();
    static {
        TAB_META.put("building_blocks",     new String[]{"建築ブロック", "▦", "#A4C639"});
        TAB_META.put("natural_blocks",      new String[]{"自然ブロック", "⛰", "#7CB342"});
        TAB_META.put("functional_blocks",   new String[]{"機能ブロック", "⚙", "#8D6E63"});
        TAB_META.put("redstone_blocks",     new String[]{"レッドストーン", "⚡", "#E53935"});
        TAB_META.put("colored_blocks",      new String[]{"色付きブロック", "◧", "#AB47BC"});
        TAB_META.put("tools_and_utilities", new String[]{"道具", "⚒", "#3B82F6"});
        TAB_META.put("combat",              new String[]{"戦闘", "⚔", "#E67E22"});
        TAB_META.put("food_and_drinks",     new String[]{"食料", "✦", "#66BB6A"});
        TAB_META.put("ingredients",         new String[]{"素材", "✧", "#FFB300"});
        TAB_META.put("spawn_eggs",          new String[]{"スポーンエッグ", "◓", "#26A69A"});
        TAB_META.put("op_blocks",           new String[]{"管理者", "◈", "#7c7c7c"});
    }
    private static final String[] OTHER_META = {"その他", "●", "#9E9E9E"};
    private static final String OTHER_ID = "other";

    /** Vanilla rarity → {id, label(ja), color}. */
    private static final Map<Rarity, String[]> RARITY_META = new LinkedHashMap<>();
    static {
        RARITY_META.put(Rarity.COMMON,   new String[]{"common", "コモン", "#c8c8c8"});
        RARITY_META.put(Rarity.UNCOMMON, new String[]{"uncommon", "アンコモン", "#FFFF55"});
        RARITY_META.put(Rarity.RARE,     new String[]{"rare", "レア", "#55FFFF"});
        RARITY_META.put(Rarity.EPIC,     new String[]{"epic", "エピック", "#FF55FF"});
    }

    /** mc item id → creative-tab category id (built at server start). */
    private final Map<String, String> itemToCat = new ConcurrentHashMap<>();

    /** Build the item→creative-tab map. Best-effort: falls back to type heuristics. */
    public void build(MinecraftServer server) {
        itemToCat.clear();
        try {
            CreativeModeTab.ItemDisplayParameters params = new CreativeModeTab.ItemDisplayParameters(
                    server.getWorldData().enabledFeatures(), true, server.registryAccess());
            for (CreativeModeTab tab : CreativeModeTabs.allTabs()) {
                if (tab.getType() != CreativeModeTab.Type.CATEGORY) {
                    continue; // skip SEARCH / INVENTORY / HOTBAR
                }
                ResourceLocation tabKey = BuiltInRegistries.CREATIVE_MODE_TAB.getKey(tab);
                if (tabKey == null) {
                    continue;
                }
                String catId = TAB_META.containsKey(tabKey.getPath()) ? tabKey.getPath() : OTHER_ID;
                try {
                    tab.buildContents(params);
                    for (ItemStack stack : tab.getDisplayItems()) {
                        ResourceLocation id = ForgeRegistries.ITEMS.getKey(stack.getItem());
                        if (id != null) {
                            itemToCat.putIfAbsent(id.toString(), catId);
                        }
                    }
                } catch (Exception perTab) {
                    LOGGER.debug("piggleshop: tab {} contents unavailable: {}", tabKey, perTab.toString());
                }
            }
            LOGGER.info("piggleshop: creative-tab category map built ({} items)", itemToCat.size());
        } catch (Exception e) {
            LOGGER.warn("piggleshop: creative-tab scan failed; using type-based categories: {}", e.toString());
        }
    }

    /** The category id for an item — its creative tab, else a type heuristic. */
    public String categoryOf(String mcId, Item item) {
        String cat = itemToCat.get(mcId);
        return cat != null ? cat : typeCategory(item);
    }

    private static String typeCategory(Item item) {
        if (item instanceof BlockItem) return "building_blocks";
        if (item instanceof SwordItem || item instanceof BowItem || item instanceof CrossbowItem
                || item instanceof ArmorItem || item instanceof ShieldItem || item instanceof TridentItem) {
            return "combat";
        }
        if (item instanceof DiggerItem) return "tools_and_utilities"; // pickaxe/axe/shovel/hoe
        if (item.isEdible()) return "food_and_drinks";
        return "ingredients";
    }

    /** The design rarity id (common/uncommon/rare/epic) for an item. */
    public String rarityOf(Item item) {
        Rarity r;
        try {
            r = new ItemStack(item).getRarity();
        } catch (Exception e) {
            r = Rarity.COMMON;
        }
        String[] m = RARITY_META.get(r);
        return m != null ? m[0] : "common";
    }

    /** Client-asset-safe texture base name for an mc id (namespace stripped). */
    public static String texOf(String mcId) {
        String s = mcId;
        int colon = s.indexOf(':');
        if (colon >= 0) {
            String ns = s.substring(0, colon);
            String path = s.substring(colon + 1);
            s = "minecraft".equals(ns) ? path : (ns + "__" + path);
        }
        return s.replaceAll("[^a-z0-9_]", "_");
    }

    /** Build the {@code cats} array (only the category ids actually present). */
    public JsonArray catsJson(java.util.Collection<String> usedCatIds) {
        JsonArray arr = new JsonArray();
        // emit in the canonical TAB_META order, then "other" last
        for (String id : TAB_META.keySet()) {
            if (usedCatIds.contains(id)) {
                arr.add(catJson(id, TAB_META.get(id)));
            }
        }
        if (usedCatIds.contains(OTHER_ID)) {
            arr.add(catJson(OTHER_ID, OTHER_META));
        }
        return arr;
    }

    private static JsonObject catJson(String id, String[] meta) {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        o.addProperty("label", meta[0]);
        o.addProperty("glyph", meta[1]);
        o.addProperty("color", meta[2]);
        o.addProperty("crystal", "orange");
        return o;
    }

    /** Build the {@code rarity} map (all four vanilla rarities). */
    public JsonObject rarityJson() {
        JsonObject o = new JsonObject();
        for (String[] m : RARITY_META.values()) {
            JsonObject r = new JsonObject();
            r.addProperty("label", m[1]);
            r.addProperty("color", m[2]);
            o.add(m[0], r);
        }
        return o;
    }
}
