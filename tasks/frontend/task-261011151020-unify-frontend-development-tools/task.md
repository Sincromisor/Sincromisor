# フロントエンド開発ツールをnpm workspacesで一元管理する

## 背景 / 目的

フロントエンド周辺の開発ツールがシステム、リポジトリルート、フロントエンドに分散し、導入・更新・実行手順が煩雑になっている。可能な限りリポジトリ内で完結させ、管理と操作の入口をルートへまとめるというユーザー要求に対応する。

2026-10-11の調査では、ルートに`yaml`と`@playwright/test`、フロントエンドにVite・TypeScript・Vitest・Biome・Prettierが定義され、それぞれ別のロックファイルを持つ。ルートで`npm ls --depth=0`を実行すると、定義済みの`@playwright/test@1.63.0`が未導入だった。全体のMarkdown整形はフロントエンド側のスクリプトが担っている。

手元ではHomebrewのNode.js 26.11.1、npm 11.20.0、Playwright CLI 0.1.22が利用され、フロントのDockerビルドはNode.js 22を使う。WSL用セットアップはルートとフロントで別々に`npm ci`を実行し、Playwright CLIのグローバル導入とロック外のPlaywright取得を行う。これらは調査時点の観測であり、実装開始時に現在の状態を確認する。

## 完了条件（受け入れ条件）

- [x] `sincromisor-frontend`をnpm workspaceとし、ルートとフロントの依存をルートの`package-lock.json`で管理する。フロントの独立ロックファイルを廃止し、ルートの`npm ci`一回で双方の依存が揃う。
- [x] Biome・Prettier・Playwright CLI・`@playwright/test`をルートの開発依存として管理する。グローバルの開発CLIがなくても、ルートのnpm scriptsから利用できる。
- [x] ルートの`dev`・`build`・`test`・`check`・`format`・`browser`を日常操作の入口とする。フロント固有の処理はworkspaceへ委譲し、全体のMarkdown検査・整形はルートが担う。既存のタスク管理とゲートも新しい配置で動く。
- [x] Node.js/npmの採用バージョンをリポジトリで指定し、利用環境の不一致を検出する。ローカルの標準手順とフロントのDockerビルドを同じ検証済みバージョンに揃える。
- [x] MediaPipeの素材生成、フロントの型確認・ビルド・単体テスト、Dockerビルドが新しい依存配置で動く。Gate3のPlaywright起動経路も維持する。
- [x] セットアップと現行文書を同期し、二重のインストール、グローバルCLI導入、ロック外の一時的なツール取得を標準手順から除く。

## 設計判断

- パッケージ管理はnpmを継続し、workspacesを使う。依存の宣言まで一つの`package.json`に詰め込まず、フロント固有のVite・Vitest・TypeScript・プラグイン・型定義・実行時依存はフロント側に残す。
- インストールと更新はルートから行う。依存の競合などによりworkspace側に`node_modules`ができることは許容し、コードから配置場所を決め打ちしない。
- Node.js/npm本体とOSライブラリは外部前提として残す。Node本体を独自にダウンロードする仕組みや新たなパッケージ管理ツールは追加しない。具体的な採用版と検査方法は、既存依存の対応範囲と実行確認に基づく実装判断とする。
- 実機確認用Chromeとリポジトリ外の専用永続プロファイルは既存運用を維持する。自動テスト用ブラウザーを取得する経路では、ローカルの固定済みPlaywrightとリポジトリ内のGit管理外保存先を使い、取得時と実行時の設定を揃える。ブラウザー取得を通常の`npm ci`の副作用にしない。
- AgentServerは独自のTypeScript、依存の`overrides`、Dockerビルドを持つため、workspaceに含めず独立管理を維持する。
- 複数の設定と文書を同期する統合変更として扱う。公開通信契約やアプリの利用者向け挙動は変更しない。

## 変更範囲と実装方針

- [ルートのpackage.json](../../../package.json)とロックファイル、[フロントのpackage.json](../../../sincromisor-frontend/package.json)を更新する。`gateSteps`と`evalWorktree`の依存配置も整合させる。既存依存の無関係な更新は避ける。
- [MediaPipe素材生成](../../../sincromisor-frontend/scripts/prepare-mediapipe-assets.js)の`frontend/node_modules`決め打ちをパッケージ解決へ変更し、[既存テスト](../../../sincromisor-frontend/scripts/prepare-mediapipe-assets.test.js)でルート側に配置された場合を確認する。
- [Biome設定](../../../sincromisor-frontend/biome.json)のスキーマ参照を更新する。フロント固有の設定は対象の近くに残し、今回の整理を理由に検査範囲を拡大しない。
- [フロントのDockerfile](../../../Docker/sincro-frontend/Dockerfile)をルートのロックファイルとworkspace定義から導入する構成にする。ビルド後の配信構成は維持する。
- [WSL用セットアップ](../../../utils/setup-devenv/setup.sh)、[セットアップのテスト](../../../utils/setup-devenv/test.sh)、[旧フロントセットアップ](../../../utils/setup/frontend.sh)を新しい入口へ揃える。Node/npmのバージョン指定を読み取って検査し、不一致時の手順を示す。
- [Gate3設定](../../../playwright.rtc-integration.config.ts)と[Go側の起動処理](../../../sincromisor-server/sincro-rtc/internal/rtcintegration/browser/browser_test.go)を確認する。既存の`SINCRO_GATE3_CHROMIUM_BINARY`などの明示指定は保持し、配置変更に必要な箇所だけ修正する。
- グローバルツールのアンインストール、個人環境の自動書き換え、Python・Go・AgentServerの依存再編、アプリ機能変更は行わない。過去タスクの記録や上流スキルの汎用例を一括置換しない。

## 確認方法

1. 既存の入れ子の`node_modules`に依存しない状態で、ルートの`npm ci`と`npm ls --depth=0 --workspaces --include-workspace-root`を確認する。ユーザーの既存環境を無断で削除せず、必要なら一時配置で確認する。
2. ルートの`build`・`test`・`check`を実行する。MediaPipe素材生成の既存テストと、ルート側の依存解決を確認する。対象外の既存不整合はタスク管理規則に従って扱う。
3. ルートの`dev`で主要ページを一度表示し、ローカルの`browser`から専用セッションを開閉する。グローバルCLIがなくても起動できることを確認する。ブラウザー操作時はPlaywright CLI利用ルールとスキルに従う。
4. Gate3はローカルのPlaywrightによる設定読み込みとテスト一覧取得を確認する。今回変更しない音声・RTCの全結合試験は必須にしない。
5. フロントのDockerイメージをビルドし、配信対象が生成されることを確認する。セットアップ変更は既存のシェル構文確認・ShellCheck・セットアップのテストで確認する。WSL全体の再導入は要求しない。
6. 変更したMarkdownの整形、`tasks:index:check`、`tasks:check`を確認する。タスク用スキルの編集元を変更した場合だけ生成と`gen:codex:check`も行う。

環境や権限の制約で実行できない確認は、理由と未確認範囲を実装記録に残す。

## ドキュメント同期

[README](../../../README.md)、[WSL導入手順](../../../utils/setup-devenv/README.md)、[タスク管理の確認コマンド](../../README.md#確認コマンド)、[Markdown規約](../../../documents/rules/coding-md.md)、[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)の導入・実行コマンドを同期する。現行設計やエージェント文書に旧コマンド・パスの参照があれば、利用箇所に限定して更新する。生成対象のエージェント文書は編集元から同期する。

新しい設計文書が必要な場合だけ[文書運用ガイド](../../../documents/design/documentation-guide.md)に従い、[設計索引](../../../documents/design/index.md)から辿れるようにする。公開API・通信契約の変更はない。

## 実装・確認結果

ルートworkspaceと単一ロックへ移行し、旧ロックの既存版を維持した。Node.js 26.11.1 / npm 11.20.0を採用し、導入時の厳密な版検査を追加した。ルートの`npm ci`、`npm ls --depth=0 --workspaces --include-workspace-root`、ビルド、単体テスト677件（3件スキップ）、Biome検査、Markdown検査、素材生成の配置回帰テスト、セットアップの構文確認・既存テストが成功した。フロント側のnode_modulesが空でも素材生成とビルドが動作した。Chromeの専用プロファイルでトップページ表示とCLI開閉、Gate3の1件の一覧取得も成功した。

実行環境の制限によりDockerビルドとShellCheckは未実行。詳細は[実装記録](impl.md)を参照する。
