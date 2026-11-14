# 型専用インポートをコンパイラーで検査する

## 背景 / 目的

優先度: 中。型専用参照を `import type` で分ける規約をコンパイラーでも確認し、実体と型を取り違えたインポートを変更時に検出する。起票前の調査では `--verbatimModuleSyntax` を追加した型検査が通ったが、実装時のコードでも確認する。

## 変更範囲と方針

[tsconfig.json](../../../sincromisor-frontend/tsconfig.json)で `verbatimModuleSyntax: true` を有効にする。設定追加により診断された型専用参照だけを修正する。型検査コマンドの追加は [フロントエンドの型検査と監視コマンドを追加する](../task-261115055437-frontend-typecheck-commands/task.md) の担当であり、本タスクは直接 `tsc` を実行して独立して確認できる。

`moduleResolution: bundler`、相対インポート方針、実行時に必要な副作用の読み込みを維持する。Node・Workerの型環境分離、他の厳格化フラグ、依存更新は含めない。

## 完了条件

- [x] 通常の型検査で `verbatimModuleSyntax` が有効になり、型専用参照の書き分けが検査される。
- [x] フロントエンドの型検査とビルドが通り、値のインポートや必要な副作用を削除していない。

## 確認方法

フロントエンドで `../node_modules/.bin/tsc --noEmit -p tsconfig.modern.json` と `npm run build`、変更ファイルのBiomeを行う。型専用参照を変更した場合はその差分を確認する。設定を写すだけのテストは追加しない。

## 文書同期

[TypeScript規約](../../../documents/rules/coding-ts.md)の型運用・インポートの節にコンパイラーによる検査を反映する。通信・保存契約は変えない。

## 実施結果

`tsconfig.json`で `verbatimModuleSyntax`を有効にし、TypeScript規約へ検査方法を反映した。既存コードは設定追加だけで型検査を通過し、インポートの変更は不要だった。`tsc --noEmit -p tsconfig.modern.json`、通常ビルド、設定ファイルのBiome、変更文書のPrettierが成功した。副作用と値のインポート、対象範囲は変更していない。
