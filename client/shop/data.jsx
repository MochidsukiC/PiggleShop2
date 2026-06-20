/* global window */
/* =====================================================================
   Piggle Shop — client data model.

   Currency + tone copy live on the client; the item catalog / categories /
   rarity come from the server (Piggle.catalog) and are applied with
   applyCatalog() before the app renders. This keeps prices / stock
   server-authoritative while the語調 (tone) copy stays a UI concern.
   ===================================================================== */

const PG_IMG = (id) => "assets/items/" + id + ".png";

/* ---- currency: エメ (エメラルド), 2 decimals ---- */
function eme(n) { return Number(n).toFixed(2); }
function emeInt(n) { return Math.floor(n).toLocaleString("ja-JP"); }

/* ---- live catalog (populated from the server) ---- */
let RARITY = {};
let CATS = [];
let CAT = {};
let ITEMS = [];
let ITEM = {};

function applyCatalog(cat) {
  RARITY = cat.rarity || {};
  CATS = cat.cats || [];
  CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  ITEMS = cat.items || [];
  ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  Object.assign(window, { RARITY, CATS, CAT, ITEMS, ITEM });
}

/* ---- tone copy (語調) ---- */
const TONE = {
  standard: {
    name: "標準",
    tagline: "マインクラフト交易マーケット",
    heroKicker: "本日のおすすめ",
    heroTitle: "ピグリンと、\nいい取引を。",
    heroBody: "ブロックから伝説の装備まで。エメで賢く揃えよう。",
    heroCta: "おすすめを見る",
    secFeatured: "おすすめアイテム",
    secNew: "新着",
    secCats: "カテゴリから探す",
    secTrending: "人気急上昇",
    secRelated: "あわせて探す",
    addToCart: "カートに入れる",
    buyNow: "今すぐ買う",
    added: "カートに追加しました",
    cartTitle: "カート",
    cartEmpty: "カートは空です。",
    cartEmptyCta: "買い物を続ける",
    subtotal: "小計",
    shipping: "配送",
    total: "合計",
    toCheckout: "レジに進む",
    searchPlaceholder: "アイテムを検索…",
    searchEmpty: "見つかりませんでした。",
    ordersTitle: "購入履歴",
    ordersEmpty: "まだ注文がありません。",
    checkoutTitle: "ご注文手続き",
    placeOrder: "注文を確定する",
    orderDone: "ご注文ありがとうございました！",
    inStock: "在庫あり", lowStock: "残りわずか", soldOut: "売り切れ",
    grunt: "",
  },
  merchant: {
    name: "ピグリン商人風",
    tagline: "ブヒッ！黄金と宝の交易所",
    heroKicker: "ブヒ…良い品あるぞ",
    heroTitle: "金を見せろ、\n取引といこう。",
    heroBody: "ピグリン一族が選んだ逸品ばかり。エメでも…まあ受け取ってやる。",
    heroCta: "お宝を漁る",
    secFeatured: "一族のイチオシ",
    secNew: "入荷したてだ",
    secCats: "棚から漁る",
    secTrending: "みんな欲しがる品",
    secRelated: "これもどうだ",
    addToCart: "袋に入れる",
    buyNow: "即・取引だ",
    added: "袋に入れたぞ ブヒ",
    cartTitle: "取引袋",
    cartEmpty: "袋は空っぽだ。何か持ってこい。",
    cartEmptyCta: "棚を見て回る",
    subtotal: "品の値",
    shipping: "運び賃",
    total: "締めて",
    toCheckout: "取引台へ",
    searchPlaceholder: "何が欲しい？ブヒ…",
    searchEmpty: "そんな品は無いな。",
    ordersTitle: "取引の記録",
    ordersEmpty: "まだ取引してないな。",
    checkoutTitle: "取引の確認",
    placeOrder: "取引成立！",
    orderDone: "良い取引だった！ブヒヒッ",
    inStock: "在庫あり", lowStock: "残りわずか…急げ", soldOut: "売り切れだ",
    grunt: "ブヒ",
  },
  minimal: {
    name: "ミニマル",
    tagline: "TRADE MARKET",
    heroKicker: "FEATURED",
    heroTitle: "Piggle\nShop.",
    heroBody: "ブロック・道具・装備。エメで。",
    heroCta: "見る",
    secFeatured: "おすすめ",
    secNew: "新着",
    secCats: "カテゴリ",
    secTrending: "人気",
    secRelated: "関連",
    addToCart: "追加",
    buyNow: "購入",
    added: "追加済み",
    cartTitle: "カート",
    cartEmpty: "空",
    cartEmptyCta: "戻る",
    subtotal: "小計",
    shipping: "配送",
    total: "合計",
    toCheckout: "レジ",
    searchPlaceholder: "検索",
    searchEmpty: "該当なし",
    ordersTitle: "履歴",
    ordersEmpty: "なし",
    checkoutTitle: "決済",
    placeOrder: "確定",
    orderDone: "完了",
    inStock: "在庫", lowStock: "残少", soldOut: "完売",
    grunt: "",
  },
};

function orderTotal(lines) {
  return lines.reduce((s, [id, q]) => s + (window.ITEM[id] ? window.ITEM[id].price * q : 0), 0);
}

Object.assign(window, {
  PG_IMG, eme, emeInt, RARITY, CATS, CAT, ITEMS, ITEM, TONE, orderTotal, applyCatalog,
});
