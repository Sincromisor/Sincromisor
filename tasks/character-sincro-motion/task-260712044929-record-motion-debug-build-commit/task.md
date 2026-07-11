# Record build commit in motion debug manifests

## 背景 / 目的

roadmap Phase 1 は recording manifest の実 build commit 保存を残差としている。schema は `gitCommit` を受理するが、live recording は値を設定しておらず、異なる build の replay 比較を commit 単位で追跡できない。

## 完了条件（受け入れ条件）

- [ ] Vite config は環境変数 `SINCROMISOR_GIT_COMMIT` だけを入力に `__SINCROMISOR_GIT_COMMIT__` を define する。環境変数は build/CI caller が `git rev-parse HEAD` 等で設定し、Vite config 自身は git command を実行しない。
- [ ] 定数が未設定、空白、または `unknown` の dev build では `gitCommit` を省略し、recording 開始を失敗させない。
- [ ] 入力を trim→lowercase 化した後、`^[0-9a-f]{7,40}$` に一致する値だけを保存する。uppercase/前後空白は正規化値を保存し、不正値は省略する。未設定時の define 値は `undefined` とする。
- [ ] manifest 作成 test に valid / absent / invalid の3経路を追加し、既存 v1 log parser との互換を維持する。
- [ ] `documents/design/frontend/character/motion.md` に provenance の生成元と省略条件を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録し、build-time boundary と省略条件を TSDoc/JSDoc に残す。

## 設計判断（着手前に確定済み）

- build 時に Vite `define` へ注入する。ブラウザから Git 情報を取得する案は CSP・配布形態・offline replay に依存するため採らない。
- schemaVersion は v1 のままにする。`gitCommit` は既に optional field として受理済みで破壊的変更がないためである。

## スコープ境界

- 本タスク: build constant、manifest 保存、focused tests、設計文書。
- スコープ外: package version 自動列挙、dirty worktree 表示、backend/WebRTC、過去 log の補完。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:44-50` は optional `gitCommit` を既に受理する。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:298-332` が live manifest を作るが commit を設定していない。
- `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugRecordingController.test.ts:177` が `createManifest()` の既存 focused test 入口である。

## テスト

- frontend check / build / focused test、`npm run gate`、`npm run tasks:check`。

## ドキュメント同期の要否

要。developer-facing recording provenance が変わるため `documents/design/frontend/character/motion.md` を同期する。公開通信契約は変更しない。

## Comment audit / 評価条件

TypeScript production変更は `impl.md` に `path | symbol or decision | kind | current comment | decision(keep/rewrite/delete/add) | required maintenance knowledge | action | reviewer note` の列で全件記録する。最低対象は global declaration、manifest build value normalizer、`createManifest()` の build provenance decision。弱い/重複/stale commentはrewrite/deleteし、省略時は理由を記録する。評価者は変更symbol/decision全件を実コードと照合し、名前・型の逐語説明だけ、失敗/省略条件のないboundary comment、auditとの不一致をFAILにする。
