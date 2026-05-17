# TASK-260517134248 frontend test runner foundation

- 作成日: 2026-05-17
- ステータス: Open
- 優先度: Low
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

`sincromisor-frontend` に `npm run test` から実行できるテスト基盤を導入し、規約で定めたテスト運用を開始できる状態にする。

## 背景

`documents/rules/coding-ts.md` では `npm run test` をテスト実行入口とする方針が定義されている。現状の `package.json` には `test` script がなく、runtime 境界や純粋関数を安全にリファクタするための受け皿が不足している。

ただし、全面的なテスト網羅よりも、schema parse、format、retarget 計算、state reducer など壊れると影響が大きい純粋処理から始める。

## スコープ

- test runner の選定と導入
- `npm run test` script の追加
- `__tests__/` 配置ルールに沿った最小テスト追加
- runtime schema / parse helper のテスト追加
- pure helper 抽出箇所のテスト追加

## 非対象

- E2E テスト基盤の全面導入
- Playwright visual regression の本格運用
- 全 component の snapshot test
- サーバー側テスト

## 対象候補

- RTC config schema
- DataChannel payload schema
- debug formatter
- device selection normalization
- motion / gaze tuning helper
- `SincroFaceRetargeterVerification` の純粋検証ロジック

## 実装方針

1. Vite / TypeScript と相性のよい runner を選び、設定を小さく始める。
2. テスト対象は同階層の `__tests__/` に置く。
3. テストのためだけに internal export を増やさない。必要なら独立 module に抽出する。
4. 既存リファクタタスクで抽出した pure helper から順にテストを追加する。

## 完了条件

- `sincromisor-frontend/package.json` に `test` script がある。
- 最小限のテストが追加されている。
- `cd sincromisor-frontend && npm run test` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。
- `cd sincromisor-frontend && npm run check` が成功する。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run test
npm run build
npm run check
```
