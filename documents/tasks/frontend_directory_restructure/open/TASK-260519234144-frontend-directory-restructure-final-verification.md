# TASK-260519234144 frontend directory restructure final verification

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

フロントエンドディレクトリ再編の完了後に、build / check / 主要ページ起動をまとめて確認し、移行漏れを潰す。

## スコープ

- `npm run build` の実行
- `npm run check` の実行
- `npm run test` が利用可能な場合の実行
- `main` / `simple-vrm` / `vrm360` / `looking-glass-vrm` / `motion-debug` の起動確認
- 確認結果のタスク記録

## 非対象

- 追加のディレクトリ移動
- UI デザイン変更
- backend / compose の変更

## 完了条件

- `cd sincromisor-frontend && npm run build` が成功する
- `npm run check` / `npm run test` の実施可否と結果が記録されている
- 主要ページの entry が壊れていない
- 残タスクまたは既知制約があれば明記されている

## 確認

```sh
cd sincromisor-frontend
npm run build
npm run check
npm run test
```
