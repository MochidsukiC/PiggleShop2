/* global React, window, ITEMS, ITEM, CATS, CAT, RARITY, useShop, ItemCard,
   PriceTag, RarityTag, StockTag, SectionHead, CrystalCluster */
/* =====================================================================
   Piggle Shop — browse screens: Home / Category / Search / Detail
   ===================================================================== */

const FEATURED = ["totem", "netherite_sword", "gold_block", "diamond_pickaxe", "golden_apple", "enchanted_book"];
const NEW_ARR  = ["crossbow", "blackstone", "netherite_ingot", "ancient_debris", "emerald", "diamond_chestplate"];

function imgErr(e) { e.currentTarget.style.visibility = "hidden"; }

/* ────────────────────────── HOME ────────────────────────── */
function HomeScreen() {
  const { t, go, device } = useShop();
  const trending = ITEMS.filter((i) => i.hot);
  const heroLines = t.heroTitle.split("\n");

  return (
    <div className="fadein" style={{ paddingBottom: 28 }}>
      {/* HERO — blackstone bastion */}
      <div className="blackstone" style={{ position: "relative", overflow: "hidden",
        padding: device === "desktop" ? "40px 36px 36px" : "26px var(--pad) 24px",
        borderBottom: "2px solid #000" }}>
        <img className="px" src="assets/banners/bastion.png" alt="" aria-hidden="true" onError={imgErr}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: 0.16, mixBlendMode: "screen" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center",
          gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <div className="kicker on-dark" style={{ color: "var(--gold)", marginBottom: 12 }}>
              ✦ {t.heroKicker}
            </div>
            <h1 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800,
              fontSize: device === "desktop" ? 52 : 38, lineHeight: 0.98,
              letterSpacing: "-0.035em", margin: 0, color: "#fff", whiteSpace: "pre-line" }}>
              {heroLines.map((l, i) => (
                <span key={i}>{i === heroLines.length - 1
                  ? <span>{l.replace("。", "")}<span style={{ color: "var(--gold)" }}>。</span></span>
                  : l}{i < heroLines.length - 1 ? "\n" : ""}</span>
              ))}
            </h1>
            <p style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 14, lineHeight: 1.6,
              color: "rgba(255,255,255,0.72)", maxWidth: 440, margin: "14px 0 20px",
              textWrap: "pretty" }}>{t.heroBody}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="pg-btn gold" onClick={() => go("category", { cat: "all" })}>
                {t.heroCta}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
              </button>
              <button className="pg-btn" onClick={() => go("category", { cat: "rare" })}
                style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}>
                伝説の品を見る
              </button>
            </div>
          </div>
          <div style={{ flex: "0 0 auto", display: "grid", placeItems: "center",
            position: "relative" }}>
            <CrystalCluster corner="br" size={150} palette="orange" density={0.9}
              style={{ opacity: 0.5 }} />
            <img className="px" src="assets/brand/piglin_big.png" alt="ピグリン" onError={imgErr}
              style={{ width: device === "desktop" ? 150 : 110, height: device === "desktop" ? 150 : 110,
                filter: "drop-shadow(5px 6px 0 rgba(0,0,0,0.45))", position: "relative" }} />
          </div>
        </div>
        <div className="lava" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} />
      </div>

      {/* CATEGORIES */}
      <div style={{ padding: "24px var(--pad) 6px" }}>
        <SectionHead kicker="CATEGORY" title={t.secCats} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px,1fr))", gap: 10 }}>
          {CATS.map((c) => {
            const count = ITEMS.filter((i) => i.cat === c.id).length;
            return (
              <button key={c.id} className="p-card hov" onClick={() => go("category", { cat: c.id })}
                style={{ cursor: "pointer", padding: "14px 12px", display: "flex",
                  flexDirection: "column", gap: 8, alignItems: "flex-start", textAlign: "left",
                  background: "var(--bg-white)" }}>
                <span className="gbox" style={{ width: 34, height: 34, background: c.color,
                  border: "1.5px solid #000", color: "#000", fontSize: 18, fontWeight: 700 }}>
                  {c.glyph}
                </span>
                <span style={{ fontFamily: "'Noto Sans JP',sans-serif", fontWeight: 700, fontSize: 13.5 }}>{c.label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-soft)",
                  letterSpacing: "0.06em" }}>{count} 品</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* FEATURED */}
      <div style={{ padding: "20px var(--pad) 6px" }}>
        <SectionHead kicker="PICKED FOR YOU" title={t.secFeatured}
          action="すべて見る" onAction={() => go("category", { cat: "all" })} />
        <div className="item-grid">
          {FEATURED.filter((id) => ITEM[id]).map((id) => <ItemCard key={id} item={ITEM[id]} />)}
        </div>
      </div>

      {/* TRENDING strip */}
      <div style={{ padding: "20px var(--pad) 6px" }}>
        <SectionHead kicker="🔥 HOT" title={t.secTrending} />
        <div className="hscroll" style={{ paddingBottom: 6, margin: "0 calc(var(--pad) * -1)",
          paddingLeft: "var(--pad)", paddingRight: "var(--pad)" }}>
          {trending.map((item) => (
            <div key={item.id} style={{ flex: "0 0 156px" }}>
              <ItemCard item={item} />
            </div>
          ))}
        </div>
      </div>

      {/* NEW ARRIVALS */}
      <div style={{ padding: "20px var(--pad) 6px" }}>
        <SectionHead kicker="JUST IN" title={t.secNew}
          action="もっと" onAction={() => go("category", { cat: "all" })} />
        <div className="item-grid">
          {NEW_ARR.filter((id) => ITEM[id]).map((id) => <ItemCard key={id} item={ITEM[id]} />)}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── CATEGORY / LIST ────────────────────────── */
const SORTS = [
  { id: "rec",      label: "おすすめ順" },
  { id: "price-lo", label: "価格が安い順" },
  { id: "price-hi", label: "価格が高い順" },
  { id: "rarity",   label: "レア度順" },
];
const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };

function CategoryScreen({ params }) {
  const { t } = useShop();
  const [cat, setCat] = React.useState(params.cat || "all");
  const [sort, setSort] = React.useState("rec");
  const [rarity, setRarity] = React.useState("all");

  React.useEffect(() => { setCat(params.cat || "all"); }, [params.cat]);

  let list = ITEMS.filter((i) => (cat === "all" || i.cat === cat) && (rarity === "all" || i.rarity === rarity));
  list = [...list].sort((a, b) => {
    if (sort === "price-lo") return a.price - b.price;
    if (sort === "price-hi") return b.price - a.price;
    if (sort === "rarity") return RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity];
    return (b.hot ? 1 : 0) - (a.hot ? 1 : 0);
  });

  const curCat = cat === "all" ? null : CAT[cat];

  return (
    <div className="fadein" style={{ paddingBottom: 28 }}>
      <div style={{ padding: "20px var(--pad) 14px", borderBottom: "1.5px solid var(--ink)",
        background: curCat ? curCat.color + "1f" : "var(--bg-white)" }}>
        <div className="kicker" style={{ marginBottom: 6 }}>CATALOG</div>
        <h1 className="sec-title" style={{ margin: 0, fontSize: 30 }}>
          {curCat ? curCat.label : "すべての品"}
        </h1>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)",
          marginTop: 6, letterSpacing: "0.05em" }}>{list.length} 件</div>
      </div>

      <div className="hscroll" style={{ padding: "12px var(--pad)" }}>
        <button className="chip" data-on={cat === "all" ? 1 : 0} onClick={() => setCat("all")}>すべて</button>
        {CATS.map((c) => (
          <button key={c.id} className="chip" data-on={cat === c.id ? 1 : 0} onClick={() => setCat(c.id)}>
            <span style={{ color: cat === c.id ? "inherit" : c.color }}>{c.glyph}</span> {c.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "0 var(--pad) 12px", display: "flex", gap: 8, flexWrap: "wrap",
        alignItems: "center" }}>
        <div className="hscroll" style={{ flex: 1, minWidth: 0 }}>
          <button className="chip" data-on={rarity === "all" ? 1 : 0} onClick={() => setRarity("all")}>全レア度</button>
          {Object.entries(RARITY).map(([k, r]) => (
            <button key={k} className="chip" data-on={rarity === k ? 1 : 0} onClick={() => setRarity(k)}>
              <span style={{ width: 7, height: 7, background: r.color, display: "inline-block" }} /> {r.label}
            </button>
          ))}
        </div>
        <select className="chip" value={sort} onChange={(e) => setSort(e.target.value)}
          style={{ appearance: "auto", paddingRight: 8 }}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div style={{ padding: "0 var(--pad)" }}>
        {list.length === 0
          ? <Empty msg={t.searchEmpty} />
          : <div className="item-grid">{list.map((i) => <ItemCard key={i.id} item={i} />)}</div>}
      </div>
    </div>
  );
}

/* ────────────────────────── SEARCH ────────────────────────── */
function SearchScreen({ params }) {
  const { t } = useShop();
  const [q, setQ] = React.useState(params.q || "");
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.focus(); }, []);

  const ql = q.trim().toLowerCase();
  const results = ql
    ? ITEMS.filter((i) => i.name.toLowerCase().includes(ql)
        || (i.blurb || "").toLowerCase().includes(ql)
        || CAT[i.cat].label.includes(ql)
        || RARITY[i.rarity].label.includes(ql))
    : [];
  const suggestions = ["金", "ダイヤ", "ネザライト", "剣", "防具", "食料", "伝説", "ブロック"];

  return (
    <div className="fadein" style={{ paddingBottom: 28 }}>
      <div style={{ padding: "18px var(--pad) 14px", borderBottom: "1.5px solid var(--ink)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--gold-line)",
          background: "rgba(0,0,0,0.3)", padding: "0 12px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2.5">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPlaceholder}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent",
              padding: "13px 0", fontFamily: "'Noto Sans JP',sans-serif", fontSize: 15, fontWeight: 600 }} />
          {q && <button onClick={() => setQ("")} style={{ border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--ink-soft)" }}>✕</button>}
        </div>
      </div>

      {!ql && (
        <div style={{ padding: "18px var(--pad)" }}>
          <div className="kicker" style={{ marginBottom: 12 }}>人気のキーワード</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {ql && (
        <div style={{ padding: "16px var(--pad)" }}>
          <div className="kicker" style={{ marginBottom: 12 }}>
            「{q}」の結果 · {results.length} 件
          </div>
          {results.length === 0
            ? <Empty msg={t.searchEmpty} />
            : <div className="item-grid">{results.map((i) => <ItemCard key={i.id} item={i} />)}</div>}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── DETAIL ────────────────────────── */
function DetailScreen({ params }) {
  const { t, go, addToCart, device } = useShop();
  const item = ITEM[params.id];
  const [qty, setQty] = React.useState(1);
  React.useEffect(() => { setQty(1); }, [params.id]);
  if (!item) return <Empty msg="アイテムが見つかりません。" />;

  const cat = CAT[item.cat];
  const related = ITEMS.filter((i) => i.cat === item.cat && i.id !== item.id).slice(0, 6);
  const out = item.stock <= 0;
  const wide = device === "desktop";

  return (
    <div className="fadein" style={{ paddingBottom: 30 }}>
      <div style={{ padding: "14px var(--pad) 0", display: "flex", alignItems: "center", gap: 7,
        fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)", letterSpacing: "0.04em" }}>
        <button onClick={() => go("home")} style={crumbBtn}>HOME</button>
        <span>/</span>
        <button onClick={() => go("category", { cat: item.cat })} style={crumbBtn}>{cat.label}</button>
      </div>

      <div style={{ padding: "12px var(--pad) 0", display: wide ? "grid" : "block",
        gridTemplateColumns: wide ? "minmax(0,1fr) minmax(0,1.1fr)" : "none", gap: 28 }}>
        <div>
          <div className="checker" style={{ position: "relative", border: "1.5px solid var(--ink)",
            boxShadow: "5px 5px 0 var(--ink)", aspectRatio: wide ? "1/1" : "1.3/1",
            display: "grid", placeItems: "center", overflow: "hidden" }}>
            <CrystalCluster corner="br" size={120} palette={cat.crystal} density={0.8} style={{ opacity: 0.7 }} />
            <CrystalCluster corner="tl" size={64} palette={cat.crystal} density={0.7} style={{ opacity: 0.4 }} />
            <img className="px slot-img" src={"assets/items/" + item.id + ".png"} alt={item.name}
              onError={imgErr}
              style={{ width: "62%", height: "62%", position: "relative", zIndex: 1, objectFit: "contain" }} />
            <div style={{ position: "absolute", top: 12, left: 12, zIndex: 3 }}>
              <RarityTag rarity={item.rarity} />
            </div>
          </div>
        </div>

        <div style={{ paddingTop: wide ? 0 : 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span className="gbox" style={{ width: 22, height: 22, background: cat.color,
              border: "1.5px solid #000", fontSize: 12, fontWeight: 700 }}>{cat.glyph}</span>
            <span className="kicker">{cat.label}</span>
            {item.hot && <span style={{ background: "var(--crimson)", color: "#fff",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "2px 6px",
              border: "1px solid #000", letterSpacing: "0.08em" }}>人気</span>}
          </div>
          <h1 style={{ fontFamily: "'Noto Sans JP',sans-serif", fontWeight: 700, fontSize: 27,
            letterSpacing: "-0.01em", margin: "0 0 12px", lineHeight: 1.15, textWrap: "pretty" }}>
            {item.name}
          </h1>
          <p style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 14, lineHeight: 1.7,
            color: "var(--ink-soft)", margin: "0 0 16px", textWrap: "pretty" }}>{item.blurb}</p>

          {item.enchants && (
            <div style={{ marginBottom: 16 }}>
              <div className="kicker" style={{ marginBottom: 7 }}>付与エンチャント</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {item.enchants.map((e) => (
                  <span key={e} style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 12,
                    fontWeight: 600, padding: "5px 10px", border: "1.5px solid var(--carle-purple)",
                    color: "var(--carle-purple)", background: "#8E44AD12" }}>✦ {e}</span>
                ))}
              </div>
            </div>
          )}

          <div className="blackstone" style={{ padding: "16px 18px", border: "1.5px solid #000",
            boxShadow: "4px 4px 0 rgba(0,0,0,0.4)", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
              gap: 12, flexWrap: "wrap" }}>
              <PriceTag value={item.price} size="lg" onDark />
              <StockTag item={item} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div className="kicker">数量</div>
            <div className="qty">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => Math.min(item.stock, q + 1))}>＋</button>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-soft)" }}>
              小計 {(item.price * qty).toFixed(2)} エメ
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="pg-btn gold" disabled={out} onClick={() => addToCart(item.id, qty)}
              style={{ flex: "1 1 160px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5">
                <circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" />
                <path d="M2 3h3l2.5 12h11l2-8H6" />
              </svg>
              {t.addToCart}
            </button>
            <button className="pg-btn dark" disabled={out}
              onClick={() => { addToCart(item.id, qty); go("checkout"); }}
              style={{ flex: "1 1 120px" }}>{t.buyNow}</button>
          </div>
        </div>
      </div>

      <div style={{ padding: "30px var(--pad) 0" }}>
        <SectionHead kicker="MORE" title={t.secRelated} />
        <div className="item-grid">{related.map((i) => <ItemCard key={i.id} item={i} />)}</div>
      </div>
    </div>
  );
}

const crumbBtn = { border: "none", background: "transparent", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)", letterSpacing: "0.04em",
  textTransform: "uppercase", padding: 0 };

function Empty({ msg }) {
  return (
    <div style={{ padding: "50px 20px", textAlign: "center" }}>
      <img className="px" src="assets/brand/piglin.png" alt="" onError={imgErr}
        style={{ width: 48, height: 48, opacity: 0.5 }} />
      <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 14, color: "var(--ink-soft)",
        marginTop: 12, fontWeight: 600 }}>{msg}</div>
    </div>
  );
}

Object.assign(window, { HomeScreen, CategoryScreen, SearchScreen, DetailScreen, Empty });
