# PiggleShop2 — DEV

MochiOS の mobile / desktop から使う Minecraft 内 EC アプリ **Piggle Shop**。

## プロジェクト仕様書

- **基盤**: MochiOS2.0（MC 1.20.1 / Forge 47.4.0 / Java 17）。デザイン正本は Claude Design「Piggle Shop」。通貨は **エメ**（小数2桁）。
- **トポロジ（DEV.md §7.3 特権コマンドバス）**:
  ```
  Phone ─(MNN: https://piggleshop.<UUID>.minecraft.auto.mnn)─ HUB(在席ディレクトリで auto-route)
        ─(MNN tunnel / command-bus)─ MochiMC connector(サイドカー) ─(in-JVM IPC)─ 本Mod
  ```
  プレイヤーは自分の UUID で auto-route → ログイン中サーバーの本Mod に到達。**別 backend プロセスは無し**。本Mod が in-JVM の「同封バックエンド」。
- **モジュール**:
  - `mod/` — 本Mod（Forge）。`mochi` コネクタmod依存、`PiggleShopExtension implements CommandDispatch.Handler` を `MochiMod.DISPATCH.register("piggleshop", …)`。catalog/checkout/モック決済/配送を処理。
  - `client/` — 共有 web UI（デザイン移植、React+Babel、`piggle-sdk.js`）。
  - `app-mobile/apps/com.mochi.piggleshop/` — mobile バンドル（manifest + index.html、CEF）。
  - `app-desktop/` — desktop（Tauri 2、web=共有client）。
  - `tools/` — dev 補助（`fetch-deps.ps1` 等）。

## 現在の仕様

- **本Mod**（実装済）:
  - `Catalog` が `resources/piggleshop/catalog.json`（デザイン data.jsx 移植、36品 + cats + rarity、各 item に `mc`=MC item id）を読み込み権威データ化。
  - `PiggleShopExtension` verb: `status` / `catalog` / `item{id}` / `checkout{order_id,items:[{id,qty}],mcid}` / `orders{mcid}`。
  - checkout: サーバー側再価格 → **モック決済（自動承認・実引落なし）** → `mcid` を `getPlayerByName` 解決 → `server.submit` でインベントリ付与（maxStack 分割・溢れ drop）→ `order_id` 冪等。送料: 小計50エメ以上 or 0 で無料、それ以外 1.50。
  - 配送先 = 注文時入力 MCID（PiggleShop はプレイヤー認証しない）。
- **依存**: `mochi` コネクタmod。compileOnly で **MochiOS2.0 forge の deobf クラス**（`../../MochiOS2.0/minecraft/forge/build/classes/java/main`、`build.gradle` の `mochi_forge_classes` で上書き可）を参照。MochiOS2.0/minecraft/forge を先にビルドしておく。実行時は同サーバーの `mochi` mod が提供。
- **デプロイ**: 同 MC サーバーに `mochi` + `piggleshop` 両mod。`mochi-server.toml [connector].hosted_app_ids` に `"piggleshop"` 追加。サイドカー `mochi-mc-connector` + PKI（MochiOS2.0 の `tools/mc-connector-dev.ps1`）。

## 問題 / 要検証

1. **transport（最重要）**: Phone の MNN/`https://piggleshop.<UUID>.minecraft.auto.mnn` リクエストが Hub→command-bus→mod `CMD_INBOUND` まで橋渡しされるか。HTTP gateway(:7411) の `.auto.mnn` 解決 + mod IPC への HTTP↔command-bus 変換、及び**返信経路**（reply.reply が phone まで戻るか）を in-world で確認。ギャップ時は MochiOS2.0 側対応（承認ゲート）。
2. **UUID 取得**: Phone がアドレスに入れる自分の MC UUID の取得元。`mochi.phoneState.owner`（account_id）と MC UUID の束縛は §7.3.8 で後続（connector の `EvLogin.account_id` も現状 null）。
3. AEM 価格連携は任意/参考。カタログ価格を MVP 権威。

## TODO

- [x] git init + マルチモジュール骨組み
- [x] 本Mod 受信拡張（catalog.json / PiggleShopExtension / DISPATCH 登録）
- [ ] 本Mod コンパイル確認
- [ ] transport 疎通検証（auto-route → mod、mc-connector.md §8）
- [ ] 共有 web UI（client/ デザイン移植 + piggle-sdk.js + アセット + dev.html）
- [ ] mobile バンドル（manifest + index.html、mods/mochi/apps 配置、runClient 検証）
- [ ] desktop Tauri アプリ
- [ ] 統合 E2E
