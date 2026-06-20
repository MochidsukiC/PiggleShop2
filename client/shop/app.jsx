/* global React, ReactDOM, window, Piggle, applyCatalog,
   CAT, ITEM, TONE, PiggleMark, Toast,
   HomeScreen, CategoryScreen, SearchScreen, DetailScreen, CartScreen, CheckoutScreen, OrdersScreen */
/* =====================================================================
   Piggle Shop — app shell, router, cart state, device frames

   The design's Tweaks panel + scaling Stage are removed: in MochiOS the CEF
   browser (mobile) / the Tauri window (desktop) provides the device frame, so
   the app fills its container. The catalog is loaded from the server
   (Piggle.catalog); checkout calls the backend (placeOrder).
   ===================================================================== */

const { useState, useEffect, useRef, useCallback } = React;

/* Fixed config (the design's defaults; the Tweaks knobs are gone). */
const CFG = { itemStyle: "slot", priceStyle: "emerald", accent: "#38d27a", checkoutFlow: "single" };
const TONE_KEY = "standard";

const GEMS = {
  "#38d27a": { soft: "rgba(56,210,122,0.30)" },
};
const DENSITY = { comfortable: { min: "158px", gap: "13px", pad: "16px" } };

/* ---- persistence (cart / route / orders) ---- */
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function todayJa() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate());
}

/* =====================================================================
   ROOT
   ===================================================================== */
function PiggleApp() {
  const device = window.PIGGLE_DEVICE === "desktop" ? "desktop" : "mobile";
  const t = TONE[TONE_KEY];

  /* catalog load (server-authoritative) */
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const loadCatalog = useCallback(() => {
    setLoadErr(null);
    Piggle.catalog().then((res) => {
      if (res && res.items) { applyCatalog(res); setReady(true); }
      else throw new Error("catalog empty");
    }).catch((e) => {
      // Browser-dev offline fallback: a bundled catalog injected by dev.html.
      if (!Piggle.inWorld && window.__PIGGLE_CATALOG__) {
        applyCatalog(window.__PIGGLE_CATALOG__); setReady(true);
      } else {
        setLoadErr(e && e.message ? e.message : String(e));
      }
    });
  }, []);
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  /* router */
  const [route, setRoute] = useState(() => load("piggle.route", { name: "home", params: {} }));
  const go = useCallback((name, params = {}) => {
    const r = { name, params };
    setRoute(r); save("piggle.route", r);
    requestAnimationFrame(() => {
      document.querySelectorAll(".pg-scroll").forEach((el) => { el.scrollTop = 0; });
    });
  }, []);

  /* cart */
  const [cart, setCart] = useState(() => load("piggle.cart", []));
  useEffect(() => { save("piggle.cart", cart); }, [cart]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const flashToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1700);
  };
  const addToCart = useCallback((id, qty = 1) => {
    setCart((c) => {
      const ex = c.find((l) => l.id === id);
      if (ex) return c.map((l) => l.id === id ? { ...l, qty: Math.min(ITEM[id].stock, l.qty + qty) } : l);
      return [...c, { id, qty: Math.min(ITEM[id].stock, qty) }];
    });
    flashToast(t.added);
  }, [t]);
  const setQty = useCallback((id, qty) => {
    setCart((c) => qty <= 0 ? c.filter((l) => l.id !== id) : c.map((l) => l.id === id ? { ...l, qty } : l));
  }, []);
  const removeFromCart = useCallback((id) => setCart((c) => c.filter((l) => l.id !== id)), []);

  /* orders (local history; the server also records + delivers) */
  const [orders, setOrders] = useState(() => load("piggle.orders", []));
  useEffect(() => { save("piggle.orders", orders); }, [orders]);

  /* checkout → backend. Returns a client-shaped order for OrderComplete. */
  const placeOrder = useCallback(async (mcid, note) => {
    const orderId = "PG-" + Date.now().toString(36).toUpperCase();
    const items = cart.map((l) => ({ id: l.id, qty: l.qty }));
    const res = await Piggle.checkout({ order_id: orderId, items, mcid, note: note || "" });
    const order = {
      id: res.order_id || orderId,
      date: todayJa(),
      status: res.success
        ? (CFG.checkoutFlow === "barter" ? "取引成立" : (res.status || "配送中"))
        : "保留",
      lines: cart.map((l) => [l.id, l.qty]),
      total: res.total,
      success: res.success !== false,
      failed: res.success === false || res.ok === false,
      error: res.error || null,
    };
    if (order.success) {
      setOrders((o) => [order, ...o]);
      setCart([]);
    }
    return order;
  }, [cart]);

  const reorder = useCallback((o) => {
    setCart(o.lines.filter(([id]) => ITEM[id]).map(([id, q]) => ({ id, qty: q })));
    go("cart");
  }, [go]);

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  /* root css vars (ore accent + density) */
  const dens = DENSITY.comfortable;
  const gem = GEMS[CFG.accent] || GEMS["#38d27a"];
  const rootVars = {
    "--gem": CFG.accent, "--gem-soft": gem.soft,
    "--card-min": dens.min, "--grid-gap": dens.gap, "--pad": dens.pad,
  };

  const ctx = { cfg: CFG, t, device, go, route, cart, cartCount, addToCart, setQty, removeFromCart,
    placeOrder, reorder, orders };

  if (loadErr) return <LoadError msg={loadErr} retry={loadCatalog} />;
  if (!ready) return <Splash />;

  const renderScreen = () => {
    const { name, params } = route;
    switch (name) {
      case "home":     return <HomeScreen />;
      case "category": return <CategoryScreen params={params} />;
      case "search":   return <SearchScreen params={params} />;
      case "detail":   return <DetailScreen params={params} />;
      case "cart":     return <CartScreen />;
      case "checkout": return <CheckoutScreen />;
      case "orders":   return <OrdersScreen />;
      default:         return <HomeScreen />;
    }
  };

  return (
    <window.ShopCtx.Provider value={ctx}>
      <div className="shop-root" style={rootVars}>
        {device === "desktop"
          ? <DesktopFrame ctx={ctx} renderScreen={renderScreen} toast={toast} />
          : <MobileFrame ctx={ctx} renderScreen={renderScreen} toast={toast} />}
      </div>
    </window.ShopCtx.Provider>
  );
}

/* ---- loading / error ---- */
function Splash() {
  return (
    <div className="shop-root" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center",
      background: "var(--stone-0, #0c0913)" }}>
      <div style={{ textAlign: "center" }}>
        <img className="px" src="assets/brand/piglin.png" alt="" style={{ width: 56, height: 56, opacity: 0.8 }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(236,228,212,0.6)", marginTop: 12 }}>
          読み込み中…
        </div>
      </div>
    </div>
  );
}
function LoadError({ msg, retry }) {
  return (
    <div className="shop-root" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center",
      background: "var(--stone-0, #0c0913)", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 15, fontWeight: 700, color: "#ece4d4" }}>
          ストアに接続できませんでした
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(236,228,212,0.5)", margin: "10px 0 18px" }}>
          {msg}
        </div>
        <button className="pg-btn gold" onClick={retry}>再試行</button>
      </div>
    </div>
  );
}

/* =====================================================================
   MOBILE FRAME — fills the phone screen (OS draws the status bar/bezel)
   ===================================================================== */
function MobileFrame({ ctx, renderScreen, toast }) {
  const { go, route, cartCount } = ctx;
  const tabs = [
    { id: "home", label: "ホーム", glyph: <path d="M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5" /> },
    { id: "search", label: "検索", glyph: <g><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></g> },
    { id: "cart", label: "カート", glyph: <g><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.5 12h11l2-8H6" /></g> },
    { id: "orders", label: "履歴", glyph: <g><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h6" /></g> },
  ];
  const active = ({ home: "home", category: "home", detail: "home", search: "search",
    cart: "cart", checkout: "cart", orders: "orders" })[route.name] || "home";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden",
      background: "var(--bg-white)", display: "flex", flexDirection: "column" }}>
      {/* app header */}
      <header className="blackstone" style={{ flexShrink: 0, padding: "10px 16px 12px",
        borderBottom: "2px solid #000", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => go("home")} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
          <PiggleMark dark size={0.92} />
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <HeaderIcon onClick={() => go("search")} label="検索">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </HeaderIcon>
          <HeaderIcon onClick={() => go("cart")} label="カート" badge={cartCount}>
            <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.5 12h11l2-8H6" />
          </HeaderIcon>
        </div>
      </header>

      <main className="pg-scroll scroll-y" style={{ flex: 1, minHeight: 0, paddingBottom: 78 }}>
        {renderScreen()}
      </main>

      <Toast msg={toast} />

      <nav className="tabbar">
        {tabs.map((tb) => (
          <button key={tb.id} className="tab" data-on={active === tb.id ? 1 : 0} onClick={() => go(tb.id)}>
            {tb.id === "cart" && cartCount > 0 && <span className="badge">{cartCount}</span>}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{tb.glyph}</svg>
            {tb.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function HeaderIcon({ children, onClick, label, badge }) {
  return (
    <button onClick={onClick} aria-label={label} style={{ width: 38, height: 38, border: "1.5px solid rgba(255,255,255,0.3)",
      background: "rgba(255,255,255,0.06)", cursor: "pointer", display: "grid", placeItems: "center", position: "relative" }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">{children}</svg>
      {badge > 0 && <span style={{ position: "absolute", top: -7, right: -7, minWidth: 17, height: 17,
        background: "var(--crimson)", color: "#fff", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
        display: "grid", placeItems: "center", padding: "0 3px", border: "1px solid #000" }}>{badge}</span>}
    </button>
  );
}

/* =====================================================================
   DESKTOP FRAME — MochiOS window with sidebar
   ===================================================================== */
function DesktopFrame({ ctx, renderScreen, toast }) {
  const { t, go, route, cartCount } = ctx;
  const active = ({ home: "home", category: "category", detail: "category", search: "search",
    cart: "cart", checkout: "cart", orders: "orders" })[route.name] || "home";

  return (
    <div className="win" style={{ width: "100%", height: "100%" }}>
      <div className="win-bar" data-tauri-drag-region="">
        <img className="px" src="assets/brand/piglin.png" alt="" style={{ width: 16, height: 16 }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em",
          color: "rgba(255,255,255,0.85)" }}>
          Piggle Shop — マインクラフト交易マーケット
        </div>
        <div style={{ flex: 1 }} />
        <div className="mono" style={{ fontSize: 9, opacity: 0.4, letterSpacing: "0.1em" }}>PIGGLE.SHOP</div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <aside className="blackstone" style={{ width: 248, flexShrink: 0, borderRight: "2px solid #000",
          display: "flex", flexDirection: "column", padding: "18px 14px", gap: 4, overflow: "hidden" }}>
          <button onClick={() => go("home")} style={{ border: "none", background: "transparent",
            cursor: "pointer", padding: "0 4px 14px", textAlign: "left" }}>
            <PiggleMark dark size={1.05} />
          </button>

          <button onClick={() => go("search")} style={{ display: "flex", alignItems: "center", gap: 9,
            border: "1.5px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
            padding: "9px 11px", cursor: "pointer", marginBottom: 12, fontFamily: "'Noto Sans JP',sans-serif", fontSize: 13 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            {t.searchPlaceholder}
          </button>

          <NavItem on={active === "home"} onClick={() => go("home")} glyph={<path d="M3 11l9-8 9 8M5 9.5V21h14V9.5" />}>ホーム</NavItem>
          <NavItem on={route.name === "cart" || route.name === "checkout"} onClick={() => go("cart")} badge={cartCount}
            glyph={<g><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.5 12h11l2-8H6" /></g>}>{t.cartTitle}</NavItem>
          <NavItem on={active === "orders"} onClick={() => go("orders")} glyph={<g><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h6" /></g>}>{t.ordersTitle}</NavItem>

          <div className="kicker on-dark" style={{ padding: "16px 6px 8px" }}>{t.secCats}</div>
          <div className="scroll-y no-bar" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <button className="nav-item" data-on={route.name === "category" && (route.params.cat === "all" || !route.params.cat) ? 1 : 0}
              onClick={() => go("category", { cat: "all" })}>
              <span style={{ width: 18, textAlign: "center" }}>✦</span>すべての品
            </button>
            {(window.CATS || []).map((c) => (
              <button key={c.id} className="nav-item" data-on={route.name === "category" && route.params.cat === c.id ? 1 : 0}
                onClick={() => go("category", { cat: c.id })}>
                <span style={{ width: 18, textAlign: "center", color: route.params.cat === c.id ? "inherit" : c.color }}>{c.glyph}</span>
                {c.label}
              </button>
            ))}
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 12, marginTop: 8,
            display: "flex", alignItems: "center", gap: 8 }}>
            <img className="px" src="assets/brand/piglin.png" alt="" style={{ width: 24, height: 24 }}
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
              通貨: エメ (エメラルド)<br />v1.0 · MochiOS
            </div>
          </div>
        </aside>

        <main className="pg-scroll scroll-y" style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            {renderScreen()}
          </div>
          <Toast msg={toast} />
        </main>
      </div>
    </div>
  );
}

function NavItem({ on, onClick, badge, glyph, children }) {
  return (
    <button className="nav-item" data-on={on ? 1 : 0} onClick={onClick}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>
      {children}
      {badge > 0 && <span className="badge">{badge}</span>}
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("piggle-root")).render(<PiggleApp />);
