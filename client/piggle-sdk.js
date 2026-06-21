/* global window, fetch, location, URLSearchParams */
/* =====================================================================
   Piggle Shop — client SDK (rein-sdk.js pattern)

   Talks to the Piggle Shop web backend at `piggleshop.cs.mnn` over the MNN
   overlay. The backend (a sidecar-attached separate process) owns the catalog /
   checkout and, on a confirmed purchase, forwards the item grant to the in-world
   mod over the command bus (auto-routed to the player's live server). So the app
   talks ONLY to cs.mnn — it does not address the mod or need the player UUID.

   Endpoint resolution:
     - in-world (mochi-internal:// origin): https://piggleshop.cs.mnn
     - browser-dev / Tauri: ?piggle_http=<base> or window.__PIGGLE_ENDPOINT__
       (default http://127.0.0.1:7430, the cs.mnn dev listen addr).

   REST surface (cs.mnn):
     GET  /piggle/status
     GET  /piggle/catalog
     GET  /piggle/item?id=<id>
     GET  /piggle/orders?mcid=<name>
     POST /piggle/checkout   {order_id, mcid, items:[{id,qty}], note?}
   ===================================================================== */
(function () {
  "use strict";

  const qs = new URLSearchParams(location.search);
  const inWorld = location.protocol.indexOf("mochi-internal") === 0;
  const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);

  const trim = (u) => String(u).replace(/\/+$/, "");

  function base() {
    if (window.__PIGGLE_ENDPOINT__) return trim(window.__PIGGLE_ENDPOINT__);
    const httpOverride = qs.get("piggle_http");
    if (httpOverride) return trim(httpOverride);
    if (inWorld) return "https://piggleshop.cs.mnn";
    return "http://127.0.0.1:7430"; // cs.mnn dev listen
  }

  async function getJson(path) {
    const res = await fetch(base() + path, { method: "GET" });
    if (!res.ok) throw new Error("piggle GET " + path + " → HTTP " + res.status);
    return res.json();
  }

  async function postJson(path, body) {
    const res = await fetch(base() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error("piggle POST " + path + " → HTTP " + res.status);
    return res.json();
  }

  const enc = encodeURIComponent;

  window.Piggle = {
    inWorld: inWorld,
    isTauri: isTauri,
    base: base,
    status: () => getJson("/piggle/status"),
    catalog: () => getJson("/piggle/catalog"),
    item: (id) => getJson("/piggle/item?id=" + enc(id)),
    orders: (mcid) => getJson("/piggle/orders?mcid=" + enc(mcid)),
    checkout: (order) => postJson("/piggle/checkout", order),
  };
})();
