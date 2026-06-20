package jp.houlab.mochidsuki.piggleshop;

import com.mojang.logging.LogUtils;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.server.ServerStartingEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import org.slf4j.Logger;

import jp.houlab.mochidsuki.mochi.MochiMod;

/**
 * Piggle Shop — Forge 1.20.1 entry point.
 *
 * <p>A MochiOS connector <b>receiver extension</b> (DEV.md §7.3): the mod is the
 * in-world "enclosed backend" for the {@code piggleshop} app. It depends on the
 * MochiOS connector mod ({@code mochi}) for {@link MochiMod#DISPATCH} and the
 * sidecar wiring; on server start it registers its handler so player requests
 * auto-routed to {@code piggleshop.<UUID>.minecraft.auto.mnn} are dispatched to
 * {@link PiggleShopExtension}.
 *
 * <p>The server admin must add {@code "piggleshop"} to
 * {@code mochi-server.toml [connector].hosted_app_ids} so the connector
 * advertises the app to the Hub.
 */
@Mod(PiggleShopMod.MOD_ID)
public final class PiggleShopMod {

    public static final String MOD_ID = "piggleshop";

    /** The connector app_id this mod hosts (DEV.md §7.3.4). */
    public static final String APP_ID = "piggleshop";

    public static final Logger LOGGER = LogUtils.getLogger();

    public PiggleShopMod() {
        MinecraftForge.EVENT_BUS.register(this);
        LOGGER.info("Piggle Shop mod constructing (app_id={})", APP_ID);
    }

    /**
     * Register the receiver extension into the shared connector dispatch. The
     * {@code mochi} mod loads first (mods.toml {@code ordering=AFTER}) and owns
     * {@link MochiMod#DISPATCH}; we only add our app_id handler. Dispatch is keyed
     * by app_id at command time, so registering here (before any client connects
     * and triggers a command) is sufficient regardless of inter-mod event order.
     */
    @SubscribeEvent
    public void onServerStarting(ServerStartingEvent event) {
        Catalog catalog = Catalog.load();
        MochiMod.DISPATCH.register(APP_ID, new PiggleShopExtension(event.getServer(), catalog));
        LOGGER.info("Piggle Shop: receiver extension registered for app_id '{}'. "
                + "Ensure mochi-server.toml [connector].hosted_app_ids contains \"{}\".",
                APP_ID, APP_ID);
    }
}
