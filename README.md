# Piggle Shop

MochiOS の mobile / desktop から使う **Minecraft 内 EC アプリ**。ブロック・道具・装備をエメ（エメラルド）で取引し、購入アイテムはプレイヤーのインベントリへ直接届く。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `mod/` | 本Mod（Forge 1.20.1）。MochiOS コネクタ受信拡張＋内蔵バックエンド（catalog / checkout / 配送） |
| `client/` | 共有 web UI（デザイン移植、React+Babel、`piggle-sdk.js`） |
| `app-mobile/apps/com.mochi.piggleshop/` | MochiOS mobile アプリバンドル（CEF） |
| `app-desktop/` | MochiOS desktop アプリ（Tauri 2、web=共有 client） |
| `tools/` | dev 補助スクリプト |

アーキテクチャ・現状・TODO は [DEV.md](DEV.md) を参照。

## サーバー mod のビルド前提

`mod/` は 2 つの外部依存に対して `compileOnly` でコンパイルします（いずれも**実行時は同一サーバーの mod が提供**、本リポには同梱しません）:

- **MochiOS コネクタ mod**（`mochi`）— `MochiOS2.0/minecraft/forge` を先にビルドし、その deobf クラス（`build/classes/java/main`）を参照。別レイアウトなら `-Pmochi_forge_classes=<dir>`。
- **AutoEconomicManagementMod（AEM）共通 API jar** — サードパーティのプロプライエタリ成果物のため非同梱。`mod/libs/autoeconomicmanagementmod-common.jar` に配置するか、`-Paem_jar=<path>` を指定。

```bash
cd mod && ./gradlew build      # → build/libs/piggleshop-0.1.0.jar
```
