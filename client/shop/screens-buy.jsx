/* global React, window, ITEM, CAT, useShop, PriceTag, RarityTag, SectionHead,
   Empty, eme, CrystalCluster, orderTotal */
/* =====================================================================
   Piggle Shop — buy screens: Cart / Checkout (3 flows) / Orders

   Checkout is wired to the server: the player enters their MCID (gamertag), the
   mock MoyMoy redirect plays, then placeOrder() calls the backend which
   delivers items to that MCID's inventory. Payment is a mock (no real debit).
   ===================================================================== */

const SHIP_FREE_OVER = 50;     // エメ
const SHIP_FEE = 1.50;

function cartMath(cart) {
  const subtotal = cart.reduce((s, l) => s + ITEM[l.id].price * l.qty, 0);
  const shipping = subtotal >= SHIP_FREE_OVER || subtotal === 0 ? 0 : SHIP_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

function imgErr(e) { e.currentTarget.style.visibility = "hidden"; }

/* line-item image (small) */
function LineThumb({ id, size = 56 }) {
  return (
    <div className="checker" style={{ width: size, height: size, flexShrink: 0,
      border: "1.5px solid var(--ink)", display: "grid", placeItems: "center", overflow: "hidden" }}>
      <img className="px slot-img" src={PG_IMG(id)} alt="" onError={imgErr}
        style={{ width: "78%", height: "78%", objectFit: "contain" }} />
    </div>
  );
}

/* ────────────────────────── CART ────────────────────────── */
function CartScreen() {
  const { t, go, cart, setQty, removeFromCart } = useShop();
  const m = cartMath(cart);

  if (cart.length === 0) {
    return (
      <div className="fadein" style={{ padding: "20px var(--pad)" }}>
        <h1 className="sec-title" style={{ fontSize: 30, margin: "4px 0 0" }}>{t.cartTitle}</h1>
        <div style={{ textAlign: "center", padding: "46px 16px" }}>
          <img className="px" src="assets/brand/piglin.png" alt="" onError={imgErr}
            style={{ width: 56, height: 56, opacity: 0.55 }} />
          <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 15, fontWeight: 600,
            color: "var(--ink-soft)", margin: "14px 0 18px" }}>{t.cartEmpty}</div>
          <button className="pg-btn gold" onClick={() => go("category", { cat: "all" })}>{t.cartEmptyCta}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fadein" style={{ padding: "20px var(--pad) 28px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 className="sec-title" style={{ fontSize: 30, margin: 0 }}>{t.cartTitle}</h1>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-soft)" }}>
          {cart.reduce((s, l) => s + l.qty, 0)} 点
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cart.map((line) => {
          const item = ITEM[line.id];
          return (
            <div key={line.id} className="p-card" style={{ padding: 12, display: "flex", gap: 12,
              alignItems: "center" }}>
              <div onClick={() => go("detail", { id: item.id })} style={{ cursor: "pointer" }}>
                <LineThumb id={item.id} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div onClick={() => go("detail", { id: item.id })} style={{ cursor: "pointer",
                  fontFamily: "'Noto Sans JP',sans-serif", fontWeight: 700, fontSize: 14, lineHeight: 1.25,
                  marginBottom: 4 }}>{item.name}</div>
                <RarityTag rarity={item.rarity} small />
                <div style={{ marginTop: 7 }}><PriceTag value={item.price} size="sm" /></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <div className="qty">
                  <button onClick={() => setQty(item.id, line.qty - 1)}>−</button>
                  <span>{line.qty}</span>
                  <button onClick={() => setQty(item.id, Math.min(item.stock, line.qty + 1))}>＋</button>
                </div>
                <button onClick={() => removeFromCart(item.id)} style={{ border: "none", background: "transparent",
                  cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--crimson)",
                  letterSpacing: "0.08em", textTransform: "uppercase", padding: 0 }}>削除</button>
              </div>
            </div>
          );
        })}
      </div>

      <CartSummary m={m} />
      <button className="pg-btn gold block" style={{ marginTop: 14, padding: "14px" }}
        onClick={() => go("checkout")}>
        {t.toCheckout}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

function CartSummary({ m, compact = false }) {
  const { t } = useShop();
  return (
    <div style={{ marginTop: compact ? 0 : 18, borderTop: "1.5px solid var(--ink)", paddingTop: 14 }}>
      <Row label={t.subtotal} value={<PriceTag value={m.subtotal} size="sm" />} />
      <Row label={t.shipping} value={m.shipping === 0
        ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--emerald-deep)" }}>無料 · ピグリン便</span>
        : <PriceTag value={m.shipping} size="sm" />} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 10, paddingTop: 10, borderTop: "1px dashed rgba(0,0,0,0.2)" }}>
        <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 16 }}>{t.total}</span>
        <PriceTag value={m.total} size="md" />
      </div>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 13, color: "var(--ink-soft)" }}>{label}</span>
      {value}
    </div>
  );
}

/* ────────────────────────── CHECKOUT (router by flow) ────────────────────────── */
function CheckoutScreen() {
  const { cfg, cart, placeOrder, myMcid } = useShop();
  const [done, setDone] = React.useState(null);
  const [paying, setPaying] = React.useState(false);
  const [err, setErr] = React.useState(null);
  // Delivery form (lifted so every flow + placeOrder share the entered MCID).
  // Recipient defaults to the signed-in player's MCID (OS API prefill); the user
  // can still edit it to gift another player.
  const [form, setForm] = React.useState({ name: "", note: "" });
  const [edited, setEdited] = React.useState(false);
  // Prefill once the OS-provided MCID arrives (unless the user already typed).
  React.useEffect(() => {
    if (myMcid && !edited) setForm((p) => ({ ...p, name: myMcid }));
  }, [myMcid, edited]);
  const setFormTracked = React.useCallback((updater) => {
    setEdited(true);
    setForm(updater);
  }, []);

  if (cart.length === 0 && !done) {
    return <div style={{ padding: 40 }}><Empty msg="カートが空です。" /></div>;
  }
  if (done) return <OrderComplete order={done} />;

  const startPay = () => { setErr(null); setPaying(true); };
  const flow = cfg.checkoutFlow === "steps"
    ? <CheckoutSteps form={form} setForm={setFormTracked} onComplete={startPay} />
    : cfg.checkoutFlow === "barter"
      ? <CheckoutBarter form={form} setForm={setFormTracked} onComplete={startPay} />
      : <CheckoutSingle form={form} setForm={setFormTracked} onComplete={startPay} />;

  return (
    <>
      {flow}
      {err && <div style={{ padding: "0 var(--pad) 16px", color: "var(--crimson)",
        fontFamily: "'Noto Sans JP',sans-serif", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
        {err}
      </div>}
      {paying && <MoyMoyRedirect total={cartMath(cart).total}
        onDone={async () => {
          setPaying(false);
          try {
            const order = await placeOrder(form.name, form.note);
            setDone(order);
          } catch (e) {
            setErr("注文に失敗しました: " + (e && e.message ? e.message : e));
          }
        }} />}
    </>
  );
}

/* ---- MoyMoy: the only payment method (external redirect, mock for now) ---- */
function MoyMoyMark({ size = 1 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 * size }}>
      <span style={{ width: 26 * size, height: 26 * size, display: "grid", placeItems: "center",
        background: "linear-gradient(150deg,#2ee0bd,#0e9c80)", border: "1px solid #0a6051",
        color: "#06241d", fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 15 * size,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>₥</span>
      <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 16 * size,
        letterSpacing: "-0.02em", color: "#2ee0bd" }}>MoyMoy</span>
    </span>
  );
}

function MoyMoyMethod() {
  return (
    <div>
      <div className="p-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12,
        borderColor: "var(--gold)" }}>
        <MoyMoyMark />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-soft)",
            letterSpacing: "0.04em" }}>キャッシュレス決済 · 残高 2,480.00 エメ</div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
          color: "#06241d", background: "#2ee0bd", padding: "3px 7px", border: "1px solid #0a6051" }}>連携済み</span>
      </div>
      <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 11, color: "var(--ink-soft)",
        marginTop: 8, lineHeight: 1.5 }}>
        支払いは <b style={{ color: "#2ee0bd" }}>MoyMoy の決済ページ</b> に移動して完了します。共通通貨エメで決済され、完了後この画面に戻ります。
      </div>
    </div>
  );
}

function MoyMoyRedirect({ total, onDone }) {
  const [phase, setPhase] = React.useState("connecting");
  React.useEffect(() => {
    const a = setTimeout(() => setPhase("approved"), 1500);
    const b = setTimeout(onDone, 2700);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const approved = phase === "approved";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400,
      background: "linear-gradient(180deg,#08130f,#040a08)", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 340, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 26 }}>
          <span style={{ width: 8, height: 8, background: approved ? "#2ee0bd" : "#e7c25e" }} />
          secure.moymoy.pay/checkout
        </div>
        <div style={{ marginBottom: 22, display: "flex", justifyContent: "center" }}><MoyMoyMark size={1.7} /></div>
        <div style={{ width: 56, height: 56, margin: "0 auto 20px", display: "grid", placeItems: "center" }}>
          {approved
            ? <span style={{ width: 54, height: 54, background: "#2ee0bd", display: "grid", placeItems: "center",
                border: "1px solid #0a6051" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#06241d" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>
              </span>
            : <span className="moy-spin" style={{ width: 44, height: 44,
                border: "4px solid rgba(255,255,255,0.15)", borderTopColor: "#2ee0bd" }} />}
        </div>
        <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
          {approved ? "決済が完了しました" : "MoyMoy 決済ページに接続中…"}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          {approved ? "Piggle Shop に戻ります…" : eme(total) + " エメ を支払います"}
        </div>
      </div>
    </div>
  );
}

function DeliveryForm({ data, set }) {
  const field = (k, label, ph) => (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span className="kicker" style={{ display: "block", marginBottom: 5 }}>{label}</span>
      <input value={data[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph}
        style={{ width: "100%", border: "1.5px solid var(--ink)", padding: "10px 12px",
          fontFamily: "'Noto Sans JP',sans-serif", fontSize: 14, outline: "none",
          background: "var(--bg-white)" }} />
    </label>
  );
  return (
    <div>
      {field("name", "受取人 (ゲーマータグ)", "Steve_the_Trader")}
      {field("note", "備考 (任意)", "ギフトラップで")}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4,
        border: "1px solid var(--gold-line)", background: "rgba(231,194,94,0.06)", padding: "11px 13px" }}>
        <img className="px" src="assets/items/gold_ingot.png" alt="" onError={imgErr} style={{ width: 26, height: 26 }} />
        <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 12.5, lineHeight: 1.5,
          color: "var(--ink-soft)" }}>
          商品は購入後、<b style={{ color: "var(--gold)" }}>入力したゲーマータグのインベントリへ直接</b>ねじ込まれます。座標やディメンションの指定は不要です。
        </div>
      </div>
    </div>
  );
}

const SubHead = ({ n, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "0 0 12px" }}>
    {n && <span style={{ width: 22, height: 22, background: "var(--ink)", color: "var(--bg-white)",
      fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, display: "grid", placeItems: "center" }}>{n}</span>}
    <h3 style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 17, margin: 0,
      letterSpacing: "-0.01em" }}>{children}</h3>
  </div>
);

function ReviewLines() {
  const { cart } = useShop();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {cart.map((l) => {
        const item = ITEM[l.id];
        return (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <LineThumb id={l.id} size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontWeight: 600, fontSize: 13 }}>{item.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>× {l.qty}</div>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13 }}>{eme(item.price * l.qty)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ===== FLOW 1: SINGLE PAGE ===== */
function CheckoutSingle({ form, setForm, onComplete }) {
  const { t, cart } = useShop();
  const m = cartMath(cart);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const wide = useShop().device === "desktop";

  return (
    <div className="fadein" style={{ padding: "20px var(--pad) 30px" }}>
      <BackToCart />
      <h1 className="sec-title" style={{ fontSize: 28, margin: "6px 0 4px" }}>{t.checkoutTitle}</h1>
      <div className="kicker" style={{ marginBottom: 20 }}>ワンページ・取引</div>

      <div style={{ display: wide ? "grid" : "block", gridTemplateColumns: wide ? "1.3fr 1fr" : "none", gap: 26 }}>
        <div>
          <section style={{ marginBottom: 24 }}>
            <SubHead n="1">受け取り</SubHead>
            <DeliveryForm data={form} set={set} />
          </section>
          <section>
            <SubHead n="2">支払い方法</SubHead>
            <MoyMoyMethod />
          </section>
        </div>
        <div>
          <div className="p-card" style={{ padding: 16, position: wide ? "sticky" : "static", top: 16 }}>
            <SubHead n="3">注文内容</SubHead>
            <ReviewLines />
            <CartSummary m={m} />
            <button className="pg-btn gold block" style={{ marginTop: 16, padding: 14 }} onClick={onComplete}>
              MoyMoyで支払う · {eme(m.total)} エメ
            </button>
            <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 11, color: "var(--ink-soft)",
              textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
              確定するとすぐにインベントリへ届きます
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== FLOW 2: STEPPER ===== */
function CheckoutSteps({ form, setForm, onComplete }) {
  const { t, cart } = useShop();
  const m = cartMath(cart);
  const [step, setStep] = React.useState(0);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const labels = ["受け取り", "支払い", "確認"];

  return (
    <div className="fadein" style={{ padding: "20px var(--pad) 30px", maxWidth: 620, margin: "0 auto" }}>
      <BackToCart />
      <h1 className="sec-title" style={{ fontSize: 28, margin: "6px 0 16px" }}>{t.checkoutTitle}</h1>

      <div className="steps" style={{ marginBottom: 22 }}>
        {labels.map((l, i) => (
          <React.Fragment key={l}>
            {i > 0 && <span className="bar" data-done={i <= step ? 1 : 0} />}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <span className="dot" data-on={i === step ? 1 : 0} data-done={i < step ? 1 : 0}>
                {i < step ? "✓" : i + 1}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11,
        letterSpacing: "0.1em", color: "var(--ink-soft)", marginBottom: 20, textTransform: "uppercase" }}>
        STEP {step + 1} / 3 · {labels[step]}
      </div>

      <div className="p-card" style={{ padding: 18, marginBottom: 16 }}>
        {step === 0 && <DeliveryForm data={form} set={set} />}
        {step === 1 && <MoyMoyMethod />}
        {step === 2 && (
          <div>
            <ReviewLines />
            <CartSummary m={m} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {step > 0 && <button className="pg-btn ghost" onClick={() => setStep((s) => s - 1)} style={{ flex: "0 0 auto" }}>戻る</button>}
        {step < 2
          ? <button className="pg-btn dark block" onClick={() => setStep((s) => s + 1)}>次へ</button>
          : <button className="pg-btn gold block" onClick={onComplete}>MoyMoyで支払う · {eme(m.total)} エメ</button>}
      </div>
    </div>
  );
}

/* ===== FLOW 3: BARTER (piglin trade table) ===== */
function CheckoutBarter({ form, setForm, onComplete }) {
  const { t, cart } = useShop();
  const m = cartMath(cart);
  const [armed, setArmed] = React.useState(false);
  const emeralds = Math.max(1, Math.ceil(m.total));

  return (
    <div className="fadein" style={{ padding: "20px var(--pad) 30px", maxWidth: 640, margin: "0 auto" }}>
      <BackToCart />
      <h1 className="sec-title" style={{ fontSize: 28, margin: "6px 0 4px" }}>取引台</h1>
      <div className="kicker" style={{ marginBottom: 20 }}>ブヒッ…金を見せろ</div>

      <div className="blackstone" style={{ position: "relative", overflow: "hidden",
        border: "1.5px solid #000", boxShadow: "5px 5px 0 rgba(0,0,0,0.4)", padding: "22px 18px" }}>
        <img className="px" src="assets/banners/hoard.png" alt="" aria-hidden="true" onError={imgErr}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            opacity: 0.14, mixBlendMode: "screen" }} />

        <div style={{ position: "relative", display: "grid",
          gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "center" }}>
            <div className="kicker on-dark" style={{ marginBottom: 10 }}>あなたの提示</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center",
              maxHeight: 120, overflow: "hidden" }}>
              {Array.from({ length: Math.min(emeralds, 24) }).map((_, i) => (
                <img key={i} className="px" src="assets/items/emerald.png" alt="" onError={imgErr}
                  style={{ width: 20, height: 20 }} />
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--gold)",
              marginTop: 10, fontWeight: 700 }}>{eme(m.total)} エメ</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            color: "var(--gold)" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 9h16M16 5l4 4-4 4M20 15H4M8 11l-4 4 4 4" />
            </svg>
          </div>

          <div style={{ textAlign: "center" }}>
            <div className="kicker on-dark" style={{ marginBottom: 10 }}>ピグリンの品</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {cart.slice(0, 8).map((l) => (
                <div key={l.id} className="checker" style={{ width: 40, height: 40, border: "1.5px solid #000",
                  display: "grid", placeItems: "center", position: "relative" }}>
                  <img className="px" src={PG_IMG(l.id)} alt="" onError={imgErr} style={{ width: "78%", height: "78%" }} />
                  {l.qty > 1 && <span style={{ position: "absolute", bottom: -7, right: -7, background: "var(--crimson)",
                    color: "#fff", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "1px 4px",
                    border: "1px solid #000" }}>{l.qty}</span>}
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(255,255,255,0.6)",
              marginTop: 10 }}>{cart.reduce((s, l) => s + l.qty, 0)} 点</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span className="kicker" style={{ display: "block", marginBottom: 5 }}>受取人 (ゲーマータグ)</span>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Steve_the_Trader"
            style={{ width: "100%", border: "1.5px solid var(--ink)", padding: "10px 12px",
              fontFamily: "'Noto Sans JP',sans-serif", fontSize: 14, outline: "none", background: "var(--bg-white)" }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
          border: "1.5px solid var(--ink)", cursor: "pointer", marginBottom: 12,
          background: armed ? "var(--gold)" : "var(--bg-white)" }}>
          <span style={{ width: 20, height: 20, border: "1.5px solid var(--ink)", background: "#fff",
            display: "grid", placeItems: "center" }}>{armed && "✓"}</span>
          <input type="checkbox" checked={armed} onChange={(e) => setArmed(e.target.checked)} style={{ display: "none" }} />
          <span style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 13, fontWeight: 600 }}>
            ピグリン便での配達条件に同意する
          </span>
        </label>
        <button className="pg-btn gold block" disabled={!armed} onClick={onComplete} style={{ padding: 15, fontSize: 15 }}>
          🤝 MoyMoyで支払う · {eme(m.total)} エメ
        </button>
      </div>
    </div>
  );
}

function BackToCart() {
  const { go } = useShop();
  return (
    <button onClick={() => go("cart")} style={{ border: "none", background: "transparent", cursor: "pointer",
      display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11,
      fontWeight: 700, letterSpacing: "0.12em", color: "var(--ink-soft)", padding: 0, textTransform: "uppercase" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
      カートに戻る
    </button>
  );
}

/* ────────────────────────── ORDER COMPLETE ────────────────────────── */
function OrderComplete({ order }) {
  const { t, go } = useShop();
  const failed = order.failed || order.success === false;
  return (
    <div className="fadein" style={{ padding: "30px var(--pad)", maxWidth: 460, margin: "0 auto",
      textAlign: "center" }}>
      <div style={{ position: "relative", display: "inline-grid", placeItems: "center", marginBottom: 4 }}>
        <CrystalCluster corner="br" size={120} palette={failed ? "red" : "emerald"} density={0.9} style={{ opacity: 0.5 }} />
        <img className="px" src="assets/items/totem.png" alt="" onError={imgErr} style={{ width: 84, height: 84,
          filter: "drop-shadow(3px 4px 0 rgba(0,0,0,0.25))", position: "relative" }} />
      </div>
      <h1 style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 26, margin: "10px 0 6px",
        letterSpacing: "-0.02em", whiteSpace: "pre-line" }}>{failed ? "配達できませんでした" : t.orderDone}</h1>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink-soft)", marginBottom: 22,
        letterSpacing: "0.06em" }}>注文番号 {order.id}</div>

      {failed && order.error && (
        <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 13, color: "var(--crimson)",
          marginBottom: 16, fontWeight: 600 }}>
          {order.error === "player_offline"
            ? "受取人がオンラインではないため配達できませんでした。MCID とログイン状態を確認してください。"
            : "エラー: " + order.error}
        </div>
      )}

      <div className="p-card" style={{ padding: 16, textAlign: "left", marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {order.lines.map(([id, q]) => (
            <div key={id} className="checker" style={{ width: 44, height: 44, border: "1.5px solid var(--ink)",
              display: "grid", placeItems: "center", position: "relative" }}>
              <img className="px" src={PG_IMG(id)} alt="" onError={imgErr} style={{ width: "78%", height: "78%" }} />
              {q > 1 && <span style={{ position: "absolute", bottom: -6, right: -6, background: "var(--ink)",
                color: "#fff", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "1px 4px" }}>{q}</span>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          borderTop: "1.5px solid var(--ink)", paddingTop: 12 }}>
          <span style={{ fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontSize: 15 }}>{t.total}</span>
          <PriceTag value={orderTotal(order.lines)} size="md" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="pg-btn dark block" onClick={() => go("orders")}>{t.ordersTitle}を見る</button>
        <button className="pg-btn gold block" onClick={() => go("home")}>{t.cartEmptyCta}</button>
      </div>
    </div>
  );
}

/* ────────────────────────── ORDERS / HISTORY ────────────────────────── */
const STATUS_COLOR = { "配達済み": "var(--emerald-deep)", "配送中": "var(--carle-blue)",
  "返金済み": "#7c7c7c", "取引成立": "var(--gold-deep)", "保留": "var(--crimson)" };

function OrdersScreen() {
  const { t, go, orders, reorder } = useShop();

  if (orders.length === 0) {
    return (
      <div className="fadein" style={{ padding: "20px var(--pad)" }}>
        <h1 className="sec-title" style={{ fontSize: 30, margin: "4px 0 0" }}>{t.ordersTitle}</h1>
        <div style={{ textAlign: "center", padding: "46px 16px" }}>
          <img className="px" src="assets/brand/piglin.png" alt="" onError={imgErr} style={{ width: 56, height: 56, opacity: 0.55 }} />
          <div style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 15, fontWeight: 600,
            color: "var(--ink-soft)", margin: "14px 0 18px" }}>{t.ordersEmpty}</div>
          <button className="pg-btn gold" onClick={() => go("category", { cat: "all" })}>{t.cartEmptyCta}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fadein" style={{ padding: "20px var(--pad) 28px" }}>
      <h1 className="sec-title" style={{ fontSize: 30, margin: "4px 0 18px" }}>{t.ordersTitle}</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {orders.map((o) => (
          <div key={o.id} className="p-card" style={{ padding: 15 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em" }}>{o.id}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-soft)", marginTop: 2 }}>{o.date}</div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "#fff", background: STATUS_COLOR[o.status] || "var(--ink)",
                padding: "4px 8px", border: "1px solid #000" }}>{o.status}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
              {o.lines.map(([id, q]) => (
                <div key={id} onClick={() => go("detail", { id })} className="checker"
                  style={{ width: 44, height: 44, border: "1.5px solid var(--ink)", display: "grid",
                    placeItems: "center", position: "relative", cursor: "pointer" }}>
                  <img className="px" src={PG_IMG(id)} alt="" onError={imgErr} style={{ width: "78%", height: "78%" }} />
                  {q > 1 && <span style={{ position: "absolute", bottom: -6, right: -6, background: "var(--ink)",
                    color: "#fff", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, padding: "1px 4px" }}>{q}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              borderTop: "1px dashed rgba(0,0,0,0.2)", paddingTop: 11 }}>
              <PriceTag value={orderTotal(o.lines)} size="sm" />
              <button className="pg-btn ghost" style={{ padding: "6px 10px", fontSize: 12 }}
                onClick={() => reorder(o)}>再注文</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { CartScreen, CheckoutScreen, OrdersScreen, OrderComplete, cartMath });
