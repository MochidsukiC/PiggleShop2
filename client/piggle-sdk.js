/* global window, fetch, location, URLSearchParams, mochi */
/* =====================================================================
   Piggle Shop — client SDK (rein-sdk.js pattern)

   Talks to the in-world Piggle Shop mod over the MNN overlay. The mod is the
   "enclosed backend" (DEV.md §7.3): a player's request auto-routes to the
   server they are logged into via
       https://piggleshop.<UUID>.minecraft.auto.mnn
   The Hub presence directory resolves (minecraft, UUID) → that server's
   connector → the piggleshop receiver extension, which replies JSON.

   Transports / endpoint resolution:
     - in-world (mochi-internal:// origin): the auto-route host above, with
       <UUID> = the player's MC UUID (window.__PIGGLE_UUID__ / ?piggle_uuid /
       mochi.phoneState.owner).
     - browser-dev / Tauri: ?piggle_http=<base> or window.__PIGGLE_ENDPOINT__,
       default http://127.0.0.1:7450 (the dev mock server in tools/).

   A request is an opaque JSON command { req_id, verb, ... } POSTed as the body;
   the mod reads the verb from the body (the path is irrelevant) and echoes
   req_id in its reply.
   ===================================================================== */
(function () {
  "use strict";

  const qs = new URLSearchParams(location.search);
  const inWorld = location.protocol.indexOf("mochi-internal") === 0;
  const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);

  const trim = (u) => String(u).replace(/\/+$/, "");

  async function resolveUuid() {
    if (window.__PIGGLE_UUID__) return String(window.__PIGGLE_UUID__);
    const q = qs.get("piggle_uuid");
    if (q) return q;
    // In-world: the player's identity. The MC-UUID binding to the Mochi account
    // is a MochiOS follow-on (§7.3.8); until then phoneState.owner is the best
    // available handle. Tolerate both a bare-UUID string and a { id } wrapper.
    try {
      if (window.mochi && mochi.phoneState && mochi.phoneState.get) {
        const st = await mochi.phoneState.get();
        if (st && st.owner) {
          return typeof st.owner === "string" ? st.owner : (st.owner.id || "");
        }
      }
    } catch (e) { /* fall through to empty */ }
    return "";
  }

  let basePromise = null;
  function base() {
    if (!basePromise) {
      basePromise = (async () => {
        if (window.__PIGGLE_ENDPOINT__) return trim(window.__PIGGLE_ENDPOINT__);
        const httpOverride = qs.get("piggle_http");
        if (httpOverride) return trim(httpOverride);
        if (inWorld) {
          const uuid = await resolveUuid();
          return "https://piggleshop." + uuid + ".minecraft.auto.mnn";
        }
        return "http://127.0.0.1:7450"; // dev mock server
      })();
    }
    return basePromise;
  }

  let seq = 0;
  function reqId() {
    return "r-" + Date.now().toString(36) + "-" + (seq++).toString(36);
  }

  async function call(verb, params) {
    const b = await base();
    const body = Object.assign({ req_id: reqId(), verb: verb }, params || {});
    const res = await fetch(b + "/piggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Surface transport failures (never swallow — the UI shows a clear error).
      throw new Error("piggle " + verb + " → HTTP " + res.status);
    }
    return res.json();
  }

  window.Piggle = {
    inWorld: inWorld,
    isTauri: isTauri,
    base: base,
    call: call,
    status: () => call("status"),
    catalog: () => call("catalog"),
    item: (id) => call("item", { id: id }),
    checkout: (order) => call("checkout", order),
    orders: (mcid) => call("orders", { mcid: mcid }),
  };
})();
