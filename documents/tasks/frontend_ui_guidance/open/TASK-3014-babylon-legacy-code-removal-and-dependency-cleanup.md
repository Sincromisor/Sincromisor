# TASK-3014 Babylon legacy コード削除と依存クリーンアップ

- 作成日: 2026-04-22
- ステータス: Open
- 優先度: Highest

## 目的

すでに `legacy / deprecated` として整理済みの Babylon.js 系ページ、エントリ、描画コード、依存関係を実体ごと削除し、通常開発時に過去資産を考慮しなくてよい状態へ進める。

## 背景

- `TASK-3008` から `TASK-3013` により、modern 優先ビルド、公開導線、文書方針は整理済みである。
- 一方で実装上は `src/ts/SincroLegacy/**`、`src/area360/**`、`src/simple`、`src/glass`、`src/character`、`src/character-glass`、`src/single`、`src/double`、`src/ts/main-legacy.ts` がまだ残っている。
- `package.json` にも `@babylonjs/*` 依存が残っており、ビルド設定にも legacy input が残っている。
- 方針上は捨てたものをコード上で抱え続けると、型探索、依存更新、コード検索、レビューの負担が下がらない。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3009-frontend-support-matrix-and-page-classification.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3012-babylon-legacy-retirement-and-build-path-separation.md`

## スコープ

- Babylon.js 系ページと共有エントリの削除
- `SincroLegacy` 配下の削除
- `@babylonjs/*` 依存の削除
- Vite build 設定の legacy input / legacy chunk 設定削除
- TypeScript 設定と npm scripts の後始末
- README / 設計文書の current state 同期

## 非対象

- Three.js / VRM 1.0 側の新機能追加
- Debug Console の React 化
- 起動前 dialog の完全 React 化
- `single` / `double` の新規再実装

## 先行条件

- `TASK-3009` と `TASK-3012` により、legacy / deprecated 扱いと公開導線は整理済みである。
- 本タスクでは `残すかどうかの再議論` を行わず、削除実施に集中する。

## 対応方針

1. 先に `通常ビルドに不要なエントリ` を落とし、その後に描画実装と依存を削除する。
2. `single` / `double` は deprecated 凍結ではなく、このタイミングで削除対象として扱う。
3. 参照切れが出ないよう、`vite.config.js`、トップページ、README、設計文書を同時に更新する。
4. 削除後は `npm run build` を通常確認ラインとし、`build:all` の必要性も再評価する。

## 削除対象チェックリスト

### 1. エントリ / ページ

- [ ] `src/simple/index.html` が削除されている
- [ ] `src/single/index.html` が削除されている
- [ ] `src/double/index.html` が削除されている
- [ ] `src/glass/index.html` が削除されている
- [ ] `src/character/index.html` が削除されている
- [ ] `src/character-glass/index.html` が削除されている
- [ ] `src/area360/index.html` が削除されている
- [ ] `src/ts/main-legacy.ts` が削除されている

### 2. 描画 / 実装

- [ ] `src/ts/SincroLegacy/**` が削除されている
- [ ] `src/area360/**` の Babylon.js 実装が削除されている
- [ ] legacy ページ専用の CSS / 補助コードが整理されている

### 3. 依存 / ビルド

- [ ] `package.json` から `@babylonjs/*` 依存が削除されている
- [ ] `vite.config.js` から legacy input が削除されている
- [ ] `vite.config.js` から legacy vendor chunk 設定が削除されている
- [ ] `tsconfig.modern.json` の legacy 向け `exclude` 群が削除後の構成に合わせて整理されている
- [ ] `package.json` の scripts が削除後の構成に合わせて整理されている
- [ ] `build:all` を残すか廃止するかが scripts レベルで確定している

## 実装タスク

1. legacy / deprecated 対象の HTML エントリ、TS エントリ、描画実装、関連 CSS を棚卸しし、削除対象一覧を確定する。
2. `src/simple`、`src/single`、`src/double`、`src/glass`、`src/character`、`src/character-glass`、`src/area360` の legacy ページを削除する。
3. `src/ts/main-legacy.ts` と `src/ts/SincroLegacy/**` を削除する。
4. 参照されなくなった legacy CSS やアセット参照を整理する。
5. `package.json` から `@babylonjs/*` 依存を削除する。
6. `vite.config.js` から legacy input と legacy chunk 設定を削除し、ビルド構成を modern 専用へ簡素化する。
7. `tsconfig.modern.json` の legacy 向け `exclude` 群を削除後の構成に合わせて整理する。
8. `package.json` の scripts、特に `build:all` の扱いを削除後の構成に合わせて整理する。
9. README と設計文書を削除後の current state に合わせて更新する。
10. `cd sincromisor-frontend && npm run build` を実行し、ビルド成功を確認する。

## 想定変更箇所

- `sincromisor-frontend/package.json`
- `sincromisor-frontend/package-lock.json`
- `sincromisor-frontend/tsconfig.modern.json`
- `sincromisor-frontend/vite.config.js`
- `sincromisor-frontend/src/ts/main-legacy.ts`
- `sincromisor-frontend/src/ts/SincroLegacy/**`
- `sincromisor-frontend/src/area360/**`
- `sincromisor-frontend/src/simple/**`
- `sincromisor-frontend/src/single/**`
- `sincromisor-frontend/src/double/**`
- `sincromisor-frontend/src/glass/**`
- `sincromisor-frontend/src/character/**`
- `sincromisor-frontend/src/character-glass/**`
- 必要に応じて `sincromisor-frontend/src/styles/*.css`
- `README.md`
- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`

## 完了条件

- Babylon.js 系実装と依存がリポジトリから削除されている
- deprecated / legacy ページがビルド構成とファイル構成から消えている
- Vite 設定が modern 系ページ専用になっている
- `tsconfig.modern.json` と npm scripts が削除後の構成に追従している
- README と設計文書が削除後の構成と一致している
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

- `rg '@babylonjs|SincroLegacy|main-legacy' sincromisor-frontend` で残件がないことを確認する
- トップページと README に削除済み legacy 導線が残っていないことを確認する
- `npm run build` が成功し、modern 系ページが従来どおり出力されることを確認する

## 実施メモ

- 本タスクは `legacy を隔離する段階` を終え、`実体を削除する段階` へ進めるためのタスクである。
- 実装変更時は `documents/design/frontend_ui.md` と `documents/design/frontend_migration_react.md` の更新が必要になる。
