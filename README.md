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
