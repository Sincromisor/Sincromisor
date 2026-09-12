# WSL2向け開発環境の導入スクリプトを用意する

## 背景 / 目的

ユーザー要求に基づき、プレーンな Ubuntu 26.04 / WSL2 に Sincromisor の開発・動作検証環境を用意するスクリプトを `utils/setup-devenv` に追加する。

## 完了条件

- [x] 一般ユーザーで実行し、対象 OS・CPU・WSL2・systemd と既存 Docker パッケージを確認してから導入する。
- [x] Node.js、Go、uv / Python 3.12、音声処理・ビルド依存、Docker / Compose / Buildx、NVIDIA Container Toolkit を導入する。
- [x] リポジトリ依存をロックに同期し、MediaPipe WASM、初回設定とモデル保存先を準備する。既存設定とキャッシュは維持する。
- [x] GPU なしの開発用指定、ブラウザー操作用の追加指定、Windows 側の前提と起動・確認手順を用意する。
- [x] 構文、ShellCheck、条件判定の回帰確認を行う。

## 範囲と判断

`utils/setup-devenv/setup.sh`、同ディレクトリの手順・テストとルート README の案内を変更する。Ubuntu 標準パッケージと公式配布手順を使い、既存の Python / npm ロックと Go のバージョン指定に従う。Windows ドライバー、ネットワーク、ファイアウォール、Dify / LLM の配置は利用者が行う。Docker グループの追加やアプリケーションの自動起動は行わない。通信契約と既存設計は変更しない。

## 確認結果

- `bash -n utils/setup-devenv/setup.sh utils/setup-devenv/test.sh`: PASS。
- `shellcheck utils/setup-devenv/*.sh`: PASS。
- `bash utils/setup-devenv/test.sh`: PASS。ヘルプ、不明な引数、対象環境の受理と OS・CPU・WSL・systemd・競合パッケージの拒否を確認した。
- 変更 Markdown の Prettier、`tasks:check`、`tasks:index:check`、`git diff --check`: PASS。
- コメント点検: PASS。

## 未実行事項・残る制約

作成環境は Ubuntu 24.04 のため、OS への導入処理は実行していない。Ubuntu 26.04 / WSL2 の新規環境での依存取得完走、GPU コンテナ、Playwright / Chrome、音声会話は未検証。公式情報とリポジトリの依存宣言に基づく実装であり、実機での互換性は導入先で確認する。再実行時は依存の同期と Docker の再起動が発生する。
