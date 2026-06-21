# PiggleShop2 — DEV

MochiOS の mobile / desktop から使う Minecraft 内 EC アプリ **Piggle Shop**。

## プロジェクト仕様書

- **基盤**: MochiOS2.0（MC 1.20.1 / Forge 47.4.0 / Java 17）。デザイン正本は Claude Design「Piggle Shop」。通貨は **エメ**（小数2桁）。
- **トポロジ（DEV.md §7.3 特権コマンドバス、cs.mnn / mc1 分離）**:
  ```
  [app] ─HTTP─▶ piggleshop.cs.mnn (web backend, サイドカー付き分離プロセス)
                  │ ① catalog 配信 / ③ checkout 受理(再価格・モック決済)
                  │ ④ grant 送信: reliable_send("piggleshop.<UUID>.minecraft.auto.mnn")
                  ▼ mTLS QUIC :7421 (mc-sdk)
                HUB(在席ディレクトリで auto-route → piggleshop.mc1.mnn)
                  ▼ command-bus → connector → in-JVM IPC
                mc1 mod / PiggleShopExtension(付与専用) → ⑥ インベントリ付与
  ```
  アプリは **cs.mnn とのみ HTTP で会話**。cs.mnn が購入を command-bus で mc1 へ中継。mc1 は **付与の実効動作のみ**を担当。
- **モジュール**:
  - `server/piggleshop-cs/` — **cs.mnn web バックエンド**（独立 Rust クレート）。catalog/checkout/モック決済 + mc-sdk で mc1 へ grant 送信 + ipvm-router 自己登録 + TLS。
  - `mod/` — **mc1 受信拡張**（Forge、`mochi` コネクタmod依存）。`PiggleShopExtension`（grant 専用）を `MochiMod.DISPATCH.register("piggleshop", …)`。付与のみ。
  - `client/` — 共有 web UI（デザイン移植、React+Babel、`piggle-sdk.js` は cs.mnn 接続）。
  - `app-mobile/apps/com.mochi.piggleshop/` — mobile バンドル（manifest + index.html、CEF）。`allowed_origins=["https://piggleshop.cs.mnn"]`。
  - `app-desktop/` — desktop（Tauri 2、web=共有client）。
  - `tools/` — dev 補助。

## 現在の仕様

- **cs.mnn バックエンド**（`server/piggleshop-cs/`、実装済）:
  - axum HTTP API: `GET /piggle/{status,catalog,item,orders}` + `POST /piggle/checkout`。webview 向け CORS（rein 踏襲）。
  - **カタログ = 静的 `catalog.json`（デザイン36品、`mc`=MC item id, `tex`=テクスチャ名）**。`catalog.rs` の `Catalog::load` が seam で、**本丸は将来 AEM-over-MNN フェッチ**（失敗時 static フォールバック）。
  - checkout: サーバー側再価格（client価格は信用しない）→ **モック決済（自動承認）** → MCID を **offline UUID**（`nameUUIDFromBytes("OfflinePlayer:<name>")`）に解決 → `reliable_send("piggleshop.<UUID>.minecraft.auto.mnn", grant)` で mc1 へ → `order_id` 冪等。送料: 小計50エメ以上で無料、それ以外 1.50。
  - **command-bus 証明書**: `MOCHI_MC_CERT_DIR`（chain/leaf.key/ca.cert）。未配置時は **catalog-only に degrade**（起動はする、checkout は `backend_cannot_deliver`）。証明書は `mochi-mc-ca issue --mcserver-id piggleshop` で発行。
  - 登録: `register_loop` が `PUT {MOCHI_IPVM_ROUTER_URL}/nodes/{id}` `{kind:service, mochi_domain:piggleshop.cs.mnn, ...}` 25s heartbeat。`PIGGLESHOP_CS_SELF_REGISTER=0` でサイドカー委譲。TLS: dev Mochi CA（`PIGGLESHOP_CS_TLS_DIR`）。
  - mc-sdk/mc-pki は `../../../MochiOS2.0/hub/*` を path 参照（sibling checkout 前提）。
- **mc1 mod**（`mod/`、実装済・付与専用）:
  - `PiggleShopExtension`（`CommandDispatch.Handler`）: 単一 verb `inventory.give` `{order_id, target_uuid|mcid, items:[{item,count}]}`。
  - **src 認可**（cert-asserted な src が `piggleshop` の cs.mnn backend のみ受理。mod は pricing/checkout ガードなしの blind executor のため必須）。
  - `order_id` 冪等（成功時のみ claim、失敗は再試行可）、resolve-all-then-give 原子配送、`server.submit` でサーバースレッド付与、`reply.reply(src, {status,delivered})` ack。
  - 配送先 = grant の `target_uuid`（`getPlayer`）or `mcid`（`getPlayerByName`）。
  - **アイテムテクスチャ = バニラ MC テクスチャ**（`tools/extract-textures.ps1`、client は `item.tex` 参照）。3D ブロックアイコンは後続課題。
- **依存**: `mochi` コネクタmod。compileOnly で **MochiOS2.0 forge の deobf クラス**（`../../MochiOS2.0/minecraft/forge/build/classes/java/main`、`build.gradle` の `mochi_forge_classes` で上書き可）を参照。実行時は同サーバーの `mochi` mod が提供。**AEM 依存は撤去**（catalog/pricing は cs.mnn の責務、AEM は後日 cs.mnn から MNN 越しに）。
- **デプロイ（サーバー mod）**: 同 MC サーバーに `mochi` + `piggleshop` 両mod。`mochi-server.toml [connector].hosted_app_ids` に `"piggleshop"` 追加。サイドカー `mochi-mc-connector` + PKI（MochiOS2.0 の `tools/mc-connector-dev.ps1`）。
- **デプロイ（mobile クライアント）= 外部アプリローダー §4.6 経由**: MochiOS2.0 には汎用の外部アプリ FG ローダーが実装済（`os.appRegistry.{list,install,uninstall}` + `HostAppInstaller`、参照 `com.mochi.appstore`）。配置はバンドルを **registry(:7405)+repository(:7409) に publish** → in-phone App Store でインストール。`tools/publish-piggleshop.ps1 -Token <session bearer>`（内部で `package.ps1` → MochiOS2.0 `tools/mochi-publish-app.ps1`）。バンドルに `icon.png` 必須（loader が icon.sha256 検証）。バンドル検証済（`mochi-app-pack` で 1499 files / 1.75MB tar、manifest 除外）。

## 問題 / 要検証

1. **transport E2E（最重要）**: app→cs.mnn(HTTP) と cs.mnn→command-bus→mc1 の2経路を in-world で疎通確認。
   - **app→cs.mnn**: app の `fetch("https://piggleshop.cs.mnn/...")` が gateway(:7411)→`resolve_mnn`→cs.mnn ノードに届くか（cs.mnn の `register_loop` 登録 + dev CA 信頼が前提）。
   - **cs.mnn→mc1**: cs.mnn の `reliable_send("piggleshop.<UUID>.minecraft.auto.mnn")` が Hub auto-route→connector→mc1 `CMD_INBOUND` まで届き、付与 + ack が返るか（`docs/operations/mc-connector.md §8`、cs.mnn 用 cert `mochi-mc-ca issue --mcserver-id piggleshop` が前提）。
2. **UUID 整合**: cs.mnn は offline UUID（`OfflinePlayer:<name>`）で auto-route。**dev/offline サーバーでは connector が報告する `player.getUUID()` と一致**。online-mode サーバーでは Mojang UUID 解決が必要（後続）。
3. **checkout 冪等性の永続化（設計判断）**: cs.mnn・mc1 とも `order_id` 重複防止はプロセス内メモリのみ。再起動後の二重付与防止に永続化が要る（cs.mnn 側 DB / mc1 側 SavedData）。本番前に対応。
4. **stock / enchants**: catalog の `stock` は checkout で未強制。`enchants` は表示用日本語で配送非反映。在庫上限/エンチャント付与配送には catalog スキーマ拡張が必要。
5. **build.gradle の mochi クラスパス** / **cs.mnn の path-dep**: いずれも `MochiOS2.0` 兄弟配置を前提（`mochi_forge_classes` / `Cargo.toml` の `../../../MochiOS2.0/hub/*`）。worktree や別レイアウトでは要上書き。
6. **AEM-over-MNN（本丸）**: cs.mnn の `catalog.rs` を AEM から MNN 越しに出品/価格フェッチする実装へ（現状は静的36品フォールバック）。AEM 側を MochiOS の MNN に乗せた後。

## TODO

- [x] git init + マルチモジュール骨組み
- [x] mc1 受信拡張（PiggleShopExtension）＋ 再帰レビュー反映（冪等性・入力検証・配送原子性）
- [x] サーバー構造分離: cs.mnn web バックエンド新設 + mc1 を付与専用にスリム化 + クライアント cs.mnn 接続
- [x] cs.mnn ビルド + 起動スモーク（/healthz, /piggle/catalog=36品, checkout 再価格 + degrade 確認）
- [x] 共有 web UI（client/ デザイン移植 + piggle-sdk.js cs.mnn 接続 + MC テクスチャ + dev.html）
- [x] mobile バンドル（manifest allowed_origins=piggleshop.cs.mnn）／desktop Tauri 骨格
- [ ] **transport E2E**: cs.mnn 用 cert 発行 → cs.mnn 起動（TLS+登録）→ app→cs.mnn→mc1 付与往復 ← 要 dev 環境
- [ ] ブラウザ実描画（`client/dev.html?piggle_http=http://127.0.0.1:7431`）／in-world runClient／desktop `cargo tauri dev`
- [ ] AEM-over-MNN フェッチ（cs.mnn catalog.rs、本丸）
- [ ] デザインバナー bastion/hoard 取得（装飾、保留）
- [ ] 統合 E2E（app → cs.mnn → command-bus → mc1 → 配送）
