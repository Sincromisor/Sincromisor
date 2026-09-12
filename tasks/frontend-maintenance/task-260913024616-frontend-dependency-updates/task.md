# フロント依存ライブラリの最新版調査とメジャー更新

## 背景 / 目的

ユーザー要求に基づき、フロント側の依存ライブラリにメジャー更新を含む更新があるか調査し、適用可能な安定版へ更新する。

## 完了条件（受け入れ条件）

- [x] フロントの全直接依存とルートの画面検証用 Playwright の公開安定版を確認し、更新前後と保留理由を記録する。
- [x] 更新可能な依存とロックファイルを同期し、必要な互換性修正を行う。
- [x] フロントの静的検査、型検査を含むビルド、既存テストが成功する。

## 設計判断・スコープ

対象は `sincromisor-frontend/package.json` とロックファイル、およびルートの `@playwright/test` とそのロックファイルとする。プレリリースは採用せず、Node.js 22 のコンテナ構成と既存の通信・保存契約を維持する。更新による修正が必要な場合のみ関連コード・設定・設計を変更する。

## 実装方針

npm レジストリの `latest`、依存の互換条件、メジャー更新の公式移行資料を確認する。Three.js は型定義と版を揃える。MediaPipe の WASM は既存のパッケージからの配置経路を確認する。既存のインストール・ビルド・テスト手順を再利用する。

## テスト

`npm ci`、`npm ls`、`npm outdated` で再現性と依存解決を確認する。フロントの `npm run check:biome`、`npm run build`、`npm test` を実行し、変更した Markdown とタスク管理情報を検査する。描画関連を更新する場合は既存のブラウザー確認手順を使い主要ページを確認する。

## ドキュメント同期の要否

依存更新だけなら設計契約の変更はなく、調査と確認結果を本タスクへ記録する。設定や公開挙動が変わる場合は対応する設計を同期する。

## 調査・実行結果

2026-09-13 に npm 公式レジストリの `latest` を照会した。フロントの全19直接依存のうち18件と、ルートの Playwright を更新した。保留した更新はない。

| 依存                       | 更新前  | 更新後  | 判断             |
| -------------------------- | ------- | ------- | ---------------- |
| `@lookingglass/webxr`      | 0.6.0   | 0.6.0   | 最新版のため維持 |
| `@mediapipe/tasks-vision`  | 0.10.34 | 1.0.1   | 更新             |
| `@pixiv/three-vrm`         | 3.5.1   | 3.5.5   | 更新             |
| `hls.js`                   | 1.6.15  | 1.7.3   | 更新             |
| `onnxruntime-web`          | 1.24.3  | 1.29.0  | 更新             |
| `react`                    | 19.2.5  | 19.3.0  | 更新             |
| `react-dom`                | 19.2.5  | 19.3.0  | 更新             |
| `three`                    | 0.182.0 | 0.186.0 | 更新             |
| `zod`                      | 4.4.3   | 4.6.2   | 更新             |
| `@biomejs/biome`           | 2.4.15  | 2.5.13  | 更新             |
| `@types/react`             | 19.2.14 | 19.3.0  | 更新             |
| `@types/react-dom`         | 19.2.3  | 19.3.0  | 更新             |
| `@types/three`             | 0.182.0 | 0.186.0 | 更新             |
| `@vitejs/plugin-react-swc` | 4.3.1   | 4.3.3   | 更新             |
| `postcss-preset-env`       | 10.6.1  | 11.5.2  | 更新             |
| `prettier`                 | 3.8.3   | 3.9.6   | 更新             |
| `typescript`               | 5.9.3   | 7.0.2   | 更新             |
| `vite`                     | 8.0.16  | 8.3.0   | 更新             |
| `vitest`                   | 4.1.6   | 5.0.0   | 更新             |
| `@playwright/test`         | 1.55.1  | 1.63.0  | 更新             |

TypeScript 7 で Node.js 型の自動読み込みがなくなったため、既存の固定データ生成テストが使う `@types/node` 22.20.2 を直接開発依存へ追加し、`tsconfig.json` の `types` で明示した。

Zod の非有限数エラーの文言変更で既存テストが失敗したため、プロファイル解析の分類を構造化フィールドによる判定へ変更した。正負の無限大と NaN を `out_of_range`、文字列を `invalid_state` とする契約を維持し、既存テストへ負の無限大を追加した。類似する分類処理も確認し、文言に依存する同じ問題はこの処理だけだった。

Biome 更新による4テストファイルの整形差分を反映した。本番の通信・保存形式・ページ構成は変更していないため、設計文書の同期は不要だった。

### 互換性の根拠

以下の公式資料と npm の `engines` / `peerDependencies` を同日に確認した。

- [TypeScript 7 の公式発表](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/): 既存の `tsc` による型検査経路を使用し、コンパイラーのプログラム用 API は使用していない。
- [Vitest 5 移行ガイド](https://main.vitest.dev/guide/migration/): Node.js 22.12 以降、Vite 6.4 以降の条件を満たす。モック履歴の既定初期化変更を含め、既存テストで互換性を確認した。
- [PostCSS preset-env 変更履歴](https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-preset-env/CHANGELOG.md): Node.js 20.19 以降と PostCSS 8.4 の依存条件を満たし、既存のブラウザー指定で CSS を生成できた。
- [Three.js 移行ガイド](https://github.com/mrdoob/three.js/wiki/Migration-Guide): r182 から r186 の変更を確認した。手動行列更新、変更されたローダーなどの該当利用はなく、型定義と本体を r186 に揃えた。VRM の Three.js 条件 `>=0.137` も満たす。
- [MediaPipe 公式利用例](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md): 既存のモデル生成 API を維持できる。Docker と同じパッケージ由来の WASM 配置を使い、版付きキャッシュキーが `tasks-vision-1.0.1` になることを確認した。

### 確認結果

- フロントとルートの `npm ci`: 成功。最初のオフライン実行はキャッシュ不足だったため、オンライン取得で完了した。双方の監査結果は脆弱性0件。
- フロントの `npm ls --all` とルートの `npm ls --depth=0`: 成功。フロントの再照会 `npm outdated --json` は `{}`。
- `npm run check:biome`: 成功。`npm run build`: TypeScript 7 と Vite 8.3 で成功し、6ページと Worker を生成した。再インストール後の型検査も成功。
- `npm test`: 93ファイル、603件成功。明示コマンドでのみ書き込む固定データ生成テストの1ファイル・2件は既定どおりスキップ。
- `npm run tasks:check:frontend-structure`: 成功。既存の大きなプロファイルファイルは今回の分類修正に限定する例外を明示した。
- `playwright-cli`: 本番ビルドの6ページが HTTP 200。VRM 読み込みログを確認した。静的配信のみのため会話用3ページでは RTC 設定 API の404が発生し、会話接続は確認対象外とした。
- 姿勢検証ページで、灰色の生成映像を入力し、MediaPipe の姿勢・顔モデルのCPU推論、非検出結果、停止時のグラフと WebGL コンテキスト解放を確認した。実カメラ素材は使用していない。
- 本番変更のコメント点検: PASS。
