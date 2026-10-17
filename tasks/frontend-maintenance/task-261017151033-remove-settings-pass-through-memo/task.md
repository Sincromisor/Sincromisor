# 設定画面の不要なuseMemoを削除

## 背景 / 目的

`SettingsShell` の `useMemo(() => pages, [pages])` は入力参照を返すだけであり、計算結果も参照も改善しない。

優先度: 低。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

なし。

## 担当範囲と設計判断

- [`src/features/settings/react/shell/settingsShell.tsx`](../../../sincromisor-frontend/src/features/settings/react/shell/settingsShell.tsx) の不要なuseMemo、import、別名だけを整理する。
- pagesを直接使う。選択ページのstate、存在しないページの補正Effect、分類・並び順、アクセシビリティ属性は変更しない。

## 完了条件

- [x] 入力を返すだけのuseMemoがなくなり、初期ページ、ページ切替、選択ページ消失時の補正が従来どおりである。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- 対象ファイルの静的検査・型検査と差分確認。単純な参照置換なので、この変更だけの新規テストは追加しない。

## 文書同期

内部記述の整理のみであり設計同期は不要。

## 実施結果

- 入力を返すだけのuseMemoと別名を除き、pagesを直接使う。初期選択・切替state・選択ページ消失時の補正Effectと分類は維持した。
- 型検査、対象Biome、差分確認が成功した。単純な参照置換のため新規テストは追加していない。
