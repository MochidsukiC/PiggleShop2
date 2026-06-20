/* global React, window, CrystalCluster, CAT, RARITY, ITEM, eme */
/* =====================================================================
   Piggle Shop — shared UI (context + atoms + ItemCard)
   Ported from the design; the <image-slot> custom element is replaced with a
   plain pixelated <img> (we ship the item PNGs in assets/items/).
   ===================================================================== */

window.ShopCtx = React.createContext(null);
const useShop = () => React.useContext(window.ShopCtx);

/** Hide a broken item image instead of showing a broken-image glyph. */
function hideOnError(e) { e.currentTarget.style.visibility = "hidden"; }

/* ---- currency / brand glyphs ---- */
function EmeIcon({ size = 14, style = {} }) {
  return <img className="px" src="assets/items/emerald.png" alt="エメ" onError={hideOnError}
    style={{ width: size, height: size, display: "block", ...style }} />;
}

function PiggleMark({ dark = true, size = 1 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 * size }}>
      <img className="px" src="assets/brand/piglin.png" alt="" onError={hideOnError}
        style={{ width: 34 * size, height: 34 * size, filter: "drop-shadow(2px 2px 0 rgba(0,0,0,0.35))" }} />
      <div style={{ lineHeight: 0.82 }}>
        <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 22 * size,
          letterSpacing: "-0.03em",
          backgroundImage: "var(--gold-sheen)", WebkitBackgroundClip: "text",
          backgroundClip: "text", color: "transparent",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.4))" }}>
          PIGGLE<span style={{ WebkitTextFillColor: "var(--gold)" }}>.</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5 * size, fontWeight: 700,
          letterSpacing: "0.36em", color: dark ? "rgba(255,255,255,0.55)" : "var(--ink-soft)",
          marginTop: 2 }}>
          S H O P
        </div>
      </div>
    </div>
  );
}

/* ---- price ---- */
function PriceTag({ value, size = "md", onDark = false }) {
  const { cfg } = useShop();
  const fs = size === "lg" ? 30 : size === "sm" ? 14 : 19;
  const txt = onDark ? "#fff" : "var(--ink)";

  if (cfg.priceStyle === "badge") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
        backgroundImage: "var(--gold-sheen)", border: "1px solid var(--gold-lo)", color: "#2a1d05",
        padding: size === "lg" ? "5px 11px" : "3px 8px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 3px 8px rgba(0,0,0,0.45)" }}>
        <EmeIcon size={fs * 0.7} />
        <b style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs * 0.82,
          letterSpacing: "0.01em" }}>{eme(value)}</b>
        <span style={{ fontSize: fs * 0.5, fontWeight: 700, opacity: 0.7 }}>エメ</span>
      </span>
    );
  }
  if (cfg.priceStyle === "plain") {
    return (
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs * 0.92,
        color: txt, letterSpacing: "0.01em" }}>
        {eme(value)} <span style={{ fontSize: fs * 0.6, opacity: 0.6 }}>エメ</span>
      </span>
    );
  }
  // emerald (default)
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <EmeIcon size={fs * 0.78} style={{ alignSelf: "center" }} />
      <b style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: fs,
        letterSpacing: "-0.02em", color: txt }}>{eme(value)}</b>
      <span style={{ fontSize: fs * 0.52, fontWeight: 700, color: onDark ? "rgba(255,255,255,0.6)" : "var(--ink-soft)" }}>エメ</span>
    </span>
  );
}

/* ---- rarity + stock tags ---- */
function RarityTag({ rarity, small = false }) {
  const r = RARITY[rarity]; if (!r) return null;
  return (
    <span className="rarity" style={{ color: r.color, fontSize: small ? 8 : 9 }}>
      <span style={{ width: small ? 5 : 6, height: small ? 5 : 6, background: r.color,
        display: "inline-block" }} />
      {r.label}
    </span>
  );
}

function StockTag({ item }) {
  const { t } = useShop();
  if (item.stock <= 0) return <span style={tagS("#7c7c7c")}>{t.soldOut}</span>;
  if (item.stock <= 8)  return <span style={tagS("var(--crimson)")}>{t.lowStock}</span>;
  return <span style={tagS("var(--emerald-deep)")}>{t.inStock} · {item.stock}</span>;
}
function tagS(c) {
  return { fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: c };
}

/* ---- item image plate (pixelated img, swappable per-item) ---- */
function ItemImage({ item }) {
  const { cfg } = useShop();
  const cat = CAT[item.cat];
  const style = cfg.itemStyle;

  let plateClass = "thumb";
  let plateStyle = {};
  let facets = null;

  if (style === "flat") {
    plateClass += " flat";
    plateStyle = { background: `linear-gradient(158deg, ${cat.color} 0%, ${cat.color}88 46%, #14101d 100%)` };
    facets = (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", width: "66%", height: "66%", right: "-14%", bottom: "-14%",
          background: "rgba(0,0,0,0.28)", clipPath: "polygon(0 100%, 100% 100%, 100% 0)" }} />
        <div style={{ position: "absolute", width: "46%", height: "46%", left: "-8%", top: "-8%",
          background: "rgba(255,255,255,0.22)", clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
      </div>
    );
  } else if (style === "crystal") {
    plateClass += " crystal ore-glow";
    facets = <CrystalCluster corner="br" size={76} palette={cat.crystal} density={0.7}
      style={{ opacity: 0.95, mixBlendMode: "screen" }} />;
  } else {
    plateClass += " checker";
  }

  return (
    <div className={plateClass} style={{ ...plateStyle,
      border: "1px solid var(--gold-line)", borderBottom: "none" }}>
      {facets}
      <img className="px slot-img" src={"assets/items/" + (item.tex || item.id) + ".png"} alt={item.name}
        onError={hideOnError} />
    </div>
  );
}

/* ---- mini add-to-cart button ---- */
function AddMini({ item }) {
  const { addToCart, t } = useShop();
  const out = item.stock <= 0;
  return (
    <button className="pg-btn gold" disabled={out}
      onClick={(e) => { e.stopPropagation(); addToCart(item.id, 1); }}
      style={{ padding: "7px 10px", fontSize: 12, minWidth: 40 }}
      title={t.addToCart} aria-label={t.addToCart}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}

/* ---- ITEM CARD (grid) ---- */
function ItemCard({ item }) {
  const { go, t } = useShop();
  return (
    <div className="p-card hov" onClick={() => go("detail", { id: item.id })}
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
        <ItemImage item={item} />
        {item.hot && (
          <div style={{ position: "absolute", top: 8, left: 8, zIndex: 3, background: "var(--crimson)",
            color: "#fff", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.1em", padding: "3px 6px", border: "1px solid #000" }}>
            {t.grunt ? t.grunt + "！人気" : "人気"}
          </div>
        )}
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 3 }}>
          <RarityTag rarity={item.rarity} small />
        </div>
      </div>
      <div style={{ padding: "10px var(--pad) calc(var(--pad) - 2px)", display: "flex",
        flexDirection: "column", gap: 7, flex: 1 }}>
        <div style={{ fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 700, fontSize: 14,
          lineHeight: 1.25, letterSpacing: "0.005em", textWrap: "pretty",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          minHeight: "2.5em" }}>
          {item.name}
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end",
          justifyContent: "space-between", gap: 8 }}>
          <PriceTag value={item.price} />
          <AddMini item={item} />
        </div>
      </div>
    </div>
  );
}

/* ---- section header ---- */
function SectionHead({ kicker, title, action, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 12, marginBottom: 14 }}>
      <div>
        {kicker && <div className="kicker" style={{ marginBottom: 5 }}>{kicker}</div>}
        <h2 className="sec-title" style={{ margin: 0, fontSize: 22 }}>{title}</h2>
      </div>
      {action && (
        <button className="pg-btn ghost" onClick={onAction}
          style={{ padding: "6px 8px", fontSize: 12, flexShrink: 0 }}>
          {action}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ---- toast ---- */
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="popin" style={{ position: "absolute", bottom: 92, left: "50%",
      transform: "translateX(-50%)", zIndex: 200,
      background: "var(--blackstone)", color: "var(--bone)", border: "1.5px solid #000",
      boxShadow: "4px 4px 0 rgba(0,0,0,0.5)", padding: "11px 16px",
      display: "flex", alignItems: "center", gap: 9, whiteSpace: "nowrap",
      fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, fontWeight: 600 }}>
      <span style={{ width: 18, height: 18, background: "var(--emerald)", display: "grid",
        placeItems: "center", border: "1px solid #000" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      {msg}
    </div>
  );
}

Object.assign(window, {
  useShop, EmeIcon, PiggleMark, PriceTag, RarityTag, StockTag,
  ItemImage, AddMini, ItemCard, SectionHead, Toast,
});
