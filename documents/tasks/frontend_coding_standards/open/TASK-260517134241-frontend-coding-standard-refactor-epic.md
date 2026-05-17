# TASK-260517134241 frontend coding standard refactor epic

- 作成日: 2026-05-17
- ステータス: Open
- 優先度: High
- 種別: Epic

## 目的

`sincromisor-frontend` を新しい TypeScript コーディング規約へ段階的に合わせ、今後の実装で規約違反を増やさない状態にする。

## 背景

2026-05-17 時点の棚卸しでは、`npm run build` は成功する一方で、Biome 診断、`any`、型アサーション、`console.*`、`null` 混在、巨大ファイル・巨大関数、命名規約不一致が残っている。

規約違反の範囲が広いため、通信契約や UI 表示を壊しやすい変更を一括で行わず、検証可能な単位で分割する。

## 関連ルール

- `AGENTS.md`
- `documents/rules/coding-ts.md`
- `documents/design/frontend/app-shell.md`
- `documents/design/frontend/character/`
- `documents/design/contracts/frontend-rtc.md`

## 子タスク

- `TASK-260517134242` frontend Biome diagnostics cleanup
- `TASK-260517134243` frontend logger and console replacement
- `TASK-260517134244` frontend runtime boundary schema and any removal
- `TASK-260517134245` frontend null undefined normalization
- `TASK-260517134246` frontend file function size split
- `TASK-260517134247` frontend camelCase path rename plan
- `TASK-260517134248` frontend test runner foundation

## スコープ

- `sincromisor-frontend/src` 配下の TypeScript / TSX コード整理
- 既存 npm scripts の `build` / `check` を通すための修正
- 型境界、ログ、欠損表現、ファイル分割、命名規約の段階的な改善
- 必要に応じた設計ドキュメント更新対象の明示

## 非対象

- サーバー側 endpoint / JSON 契約の変更
- ユーザー向け UI の大幅な情報設計変更
- WebRTC signaling の仕様変更
- VRM motion の見た目調整そのもの

## 棚卸し結果

- `npm run build`: 成功
- `npm run check:biome`: warning 24 件 / info 42 件
- `any`: 17 箇所 / 3 ファイル
- `console.*`: 68 箇所 / 19 ファイル
- 型アサーション `as Foo`: 90 箇所 / 38 ファイル
- `null`: 1046 箇所 / 91 ファイル
- `||`: 264 箇所 / 59 ファイル
- ファイルサイズ超過: soft 38 ファイル / hard 20 ファイル
- 関数サイズ超過: soft 76 関数 / hard 34 関数
- 引数数超過: soft 34 関数 / hard 14 関数
- 複数主要 export: 63 ファイル
- TS / TSX ファイル命名規約不一致: 166 ファイル中 133 ファイル
- ディレクトリ命名規約不一致: 22 箇所
- `import.meta.env` / `process.env` 直参照: 0 件

## 完了条件

- 子タスクが完了し、`sincromisor-frontend` の新規変更で主要規約違反を増やさない運用になっている。
- `cd sincromisor-frontend && npm run build` が成功する。
- `cd sincromisor-frontend && npm run check` が成功する、または残件が個別タスクとして明示されている。
- 設計ドキュメント更新が必要な変更を行った場合、該当文書と `documents/design/index.md` の整合が確認されている。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
npm run check
```
