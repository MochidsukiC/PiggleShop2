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
  - **出品リスト = AEM 権威**（`AutoEconomicAPI.getAllPrices()`）。`CatalogService` が AEM から (itemId, 表示名, 価格) を取得し、**カテゴリ = クリエイティブタブ**（`CatalogMeta` が起動時に走査）/ **レア度 = `Item.getRarity()`**（common/uncommon/rare/epic）/ **説明 = "システムが出品"** を付与。item の `id` は MC リソースid、`tex` は名前空間除去のテクスチャ名。AEM 未導入時は静的 `catalog.json`（デザイン36品）にフォールバック。`AutoEconomicAPIProvider`（リフレクション）で安全取得。
  - `PiggleShopExtension` verb: `status` / `catalog` / `item{id}` / `checkout{order_id,items:[{id,qty}],mcid}` / `orders{mcid}`。
  - checkout: **AEM `getCurrentPrice` で再価格**（権威・client価格は信用しない）→ **モック決済（自動承認・実引落なし）** → `mcid` を `getPlayerByName` 解決 → `server.submit` でインベントリ付与（maxStack 分割・溢れ drop）→ **`addTransaction` で売上記録** → `order_id` 冪等。送料: 小計50エメ以上で無料、それ以外 1.50。
  - 配送先 = 注文時入力 MCID（PiggleShop はプレイヤー認証しない）。
  - **アイテムテクスチャ = バニラ MC テクスチャ**（`tools/extract-textures.ps1` で client-extra.jar から抽出、ベース名。client は `item.tex` 参照）。3D ブロックアイコンの忠実描画は後続課題。
- **依存**: `mochi` コネクタmod。compileOnly で **MochiOS2.0 forge の deobf クラス**（`../../MochiOS2.0/minecraft/forge/build/classes/java/main`、`build.gradle` の `mochi_forge_classes` で上書き可）を参照。MochiOS2.0/minecraft/forge を先にビルドしておく。実行時は同サーバーの `mochi` mod が提供。
- **デプロイ**: 同 MC サーバーに `mochi` + `piggleshop` 両mod。`mochi-server.toml [connector].hosted_app_ids` に `"piggleshop"` 追加。サイドカー `mochi-mc-connector` + PKI（MochiOS2.0 の `tools/mc-connector-dev.ps1`）。

## 問題 / 要検証

1. **transport（最重要）**: Phone の MNN/`https://piggleshop.<UUID>.minecraft.auto.mnn` リクエストが Hub→command-bus→mod `CMD_INBOUND` まで橋渡しされるか。HTTP gateway(:7411) の `.auto.mnn` 解決 + mod IPC への HTTP↔command-bus 変換、及び**返信経路**（reply.reply が phone まで戻るか）を in-world で確認。ギャップ時は MochiOS2.0 側対応（承認ゲート）。
2. **UUID 取得**: Phone がアドレスに入れる自分の MC UUID の取得元。`mochi.phoneState.owner`（account_id）と MC UUID の束縛は §7.3.8 で後続（connector の `EvLogin.account_id` も現状 null）。
3. AEM 価格連携は任意/参考。カタログ価格を MVP 権威。
4. **checkout 冪等性の永続化（設計判断・要承認）**: `order_id` 重複防止は現状プロセス内メモリのみ。サーバ再起動後に同一 `order_id` が再到着すると新規注文として二重付与され得る。完了注文の永続化（`SavedData` 等）を別タスクで検討。
5. **stock / enchants の権威化（任意・要設計）**: catalog の `stock` は checkout で未強制（在庫枯渇セマンティクスは未定義）。`enchants` は表示用日本語文字列で配送に反映されない。在庫上限の強制やエンチャント付与配送を行うなら、catalog スキーマ（enchant registry id + level）と注文セマンティクスの設計が必要。
6. **build.gradle の mochi クラスパス**: `mochi_forge_classes` の既定値は `project.rootDir` 相対（`../../MochiOS2.0/minecraft/forge/build/classes/java/main`）で、`MochiOS2.0` と兄弟配置のチェックアウトを前提とする。worktree や別レイアウトでは解決に失敗するため `-Pmochi_forge_classes=<絶対パス>` 上書きが必要。CI/共有ビルドでは絶対パス指定か配置規約の明文化を検討。

## TODO

- [x] git init + マルチモジュール骨組み
- [x] 本Mod 受信拡張（PiggleShopExtension / DISPATCH 登録）＋ コンパイル確認
- [x] 本Mod 再帰レビュー反映（冪等性・入力検証・配送原子性）
- [x] カタログを AEM ドリブンに改修（getAllPrices / 再価格 / addTransaction / クリエイティブタブ / MC レア度）
- [x] 共有 web UI（client/ デザイン移植 + piggle-sdk.js + MC テクスチャ + dev.html）
- [x] mobile バンドル（manifest + index.html）
- [x] desktop Tauri アプリ骨格（app-desktop/、web=共有 client）
- [ ] **transport 疎通検証（auto-route → mod、mc-connector.md §8）** ← 要 dev 環境（PKI/サイドカー/Hub/mochi+piggleshop mod）
- [ ] ブラウザ実描画確認（client/dev.html を静的サーバーで）／in-world runClient／desktop `cargo tauri dev`
- [ ] AEM 改修コミット `0b77cbc` の CodeX 再帰レビュー（CodeX 上限のため 6/25 以降に再実行）
- [ ] デザインバナー bastion/hoard 取得（低不透明度の装飾、base64 手動取得が困難で保留）
- [ ] 統合 E2E（mobile/desktop → auto-route → mod → 配送）
