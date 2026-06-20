package jp.houlab.mochidsuki.piggleshop.aem;

import java.lang.reflect.Method;
import java.util.Optional;

import jp.houlab.mochidsuki.autoeconomicmanagementmod.common.api.AutoEconomicAPI;

/**
 * Safe accessor for {@link AutoEconomicAPI} (the AutoEconomicManagementMod, AEM,
 * economy API). AEM is the authoritative source of the shop's <em>listing</em>
 * and <em>prices</em>; this provider obtains the API by reflection so the mod
 * loads and degrades gracefully when AEM is not installed.
 *
 * <p>Ported from the previous PiggleShop's provider (lazy init + availability
 * caching). Package-local to PiggleShop2.
 */
public final class AutoEconomicAPIProvider {

    private static final long CHECK_INTERVAL_MS = 5_000; // re-check availability every 5s

    private static AutoEconomicAPIProvider instance;

    private AutoEconomicAPI api;
    private boolean apiChecked = false;
    private boolean apiAvailable = false;
    private long lastCheckTime = 0;

    private AutoEconomicAPIProvider() {}

    public static synchronized AutoEconomicAPIProvider getInstance() {
        if (instance == null) {
            instance = new AutoEconomicAPIProvider();
        }
        return instance;
    }

    /** Whether the AEM API is available (cached, re-checked every 5s). */
    public boolean isAvailable() {
        long now = System.currentTimeMillis();
        if (!apiChecked || now - lastCheckTime > CHECK_INTERVAL_MS) {
            refreshAPI();
            lastCheckTime = now;
        }
        return apiAvailable;
    }

    /** The AEM API, or {@link Optional#empty()} when AEM is absent/unavailable. */
    public Optional<AutoEconomicAPI> getAPI() {
        if (!isAvailable()) {
            return Optional.empty();
        }
        return Optional.ofNullable(api);
    }

    private void refreshAPI() {
        try {
            Class<?> forgeClass = Class.forName(
                    "jp.houlab.mochidsuki.autoeconomicmanagementmod.forge.AutoEconomicManagementModForge");
            Method getApiMethod = forgeClass.getMethod("getAPI");
            Object result = getApiMethod.invoke(null);
            if (result instanceof AutoEconomicAPI a) {
                api = a;
                apiAvailable = api.isAvailable();
            } else {
                api = null;
                apiAvailable = false;
            }
        } catch (ClassNotFoundException e) {
            api = null;
            apiAvailable = false; // AEM not installed
        } catch (Exception e) {
            api = null;
            apiAvailable = false;
        }
        apiChecked = true;
    }
}
