# TASK-260517002603 frontend Biome / Prettier 導入

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High
- 種別: Task

## 目的

`sincromisor-frontend` に Biome と Prettier を導入し、`documents/rules/coding-ts.md` の Lint / Formatter 方針を npm scripts から実行できる状態にする。

## 背景

- TypeScript 横断ルールでは、TS / JS / JSON の lint と format を Biome、Markdown の format を Prettier に分担すると定義している。
- 現状の `sincromisor-frontend` には `biome.json` と Prettier 設定ファイルが存在するが、`package.json` の devDependencies と scripts には接続されていない。
- Prettier は Markdown 専用として使うため、設定ファイルはリポジトリルートに置き、実行バイナリは `sincromisor-frontend/node_modules` のものを使う。

## 関連ルール

- `documents/rules/coding-ts.md`
- `AGENTS.md`

## スコープ

- `sincromisor-frontend` への `@biomejs/biome` / `prettier` devDependency 追加
- `sincromisor-frontend/package.json` への `check` / `format` 系 scripts 追加
- Biome の対象範囲を TS / JS / JSON 中心に整理
- Prettier 設定ファイルをリポジトリルートへ配置し、Markdown 専用で実行
- `npm run check` が通る状態までの初回調整
- `npm run build` による導入後確認

## 非対象

- pre-commit hook の導入
- CI の追加・変更
- テストランナーの新規導入
- `console.*` / `any` / 型アサーション等の全面リファクタ
- TypeScript コーディング規約そのものの見直し

## 対応方針

1. `sincromisor-frontend` 配下で devDependency を追加し、ルートには `node_modules` を作らない。
2. Prettier 設定はリポジトリルートに置き、npm scripts では `--config ../.prettierrc.json` と `--ignore-path ../.prettierignore` を明示する。
3. Biome は `sincromisor-frontend/biome.json` を正本とし、`node_modules` / `dist` / vendor 系成果物を対象外にする。
4. 初回 `npm run check` で大量の既存違反が出る場合は、導入タスクで直す範囲と後続タスク化する範囲を切り分ける。
5. 局所的に lint を抑制する場合は `// biome-ignore <rule>: <reason>` を必須とする。

## 想定変更箇所

- `.prettierrc.json`
- `.prettierignore`
- `sincromisor-frontend/package.json`
- `sincromisor-frontend/package-lock.json`
- `sincromisor-frontend/biome.json`

## 実装メモ

想定する npm scripts:

```json
{
    "check": "npm run check:biome && npm run check:md",
    "check:biome": "biome check .",
    "check:md": "prettier --config ../.prettierrc.json --ignore-path ../.prettierignore --check \"../*.md\" \"../documents/**/*.md\" \"**/*.md\"",
    "format": "npm run format:biome && npm run format:md",
    "format:biome": "biome check --write .",
    "format:md": "prettier --config ../.prettierrc.json --ignore-path ../.prettierignore --write \"../*.md\" \"../documents/**/*.md\" \"**/*.md\""
}
```

必要に応じて、Markdown の対象範囲は実行時間と副作用を見ながら調整する。

## 完了条件

- `@biomejs/biome` と `prettier` が `sincromisor-frontend` の devDependencies に追加されている
- `sincromisor-frontend` から `npm run check` が実行できる
- `sincromisor-frontend` から `npm run format` が実行できる
- Prettier は Markdown 専用として動作し、TS / JS / JSON の整形と衝突しない
- `npm run check` が通る、または残件が後続タスクとして明示されている
- `npm run build` が通る

## 確認

- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`

## 完了メモ

- `@biomejs/biome` / `prettier` を `sincromisor-frontend` の devDependencies に追加した。
- `check` / `format` / `check:biome` / `check:md` / `format:biome` / `format:md` scripts を追加した。
- Biome 対象を TS / TSX / JS / JSON / JSONC に整理し、`public/mediapipe-wasm` などの vendor 成果物を除外した。
- Prettier 設定をリポジトリルートへ移し、Markdown 初回整形を適用した。
- `npm run check` と `npm run build` が通ることを確認した。

## 設計ドキュメント更新

- 本タスクは開発ツール導入のため、通常は `documents/design/` の更新不要。
- ただし、npm scripts の正本や開発フローを設計文書に移す判断をした場合は、該当文書と `documents/design/index.md` の整合を確認する。
