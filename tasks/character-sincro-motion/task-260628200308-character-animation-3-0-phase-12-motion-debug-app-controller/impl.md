# Implementation Log: task-260628200308-character-animation-3-0-phase-12-motion-debug-app-controller

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- review.md の申し送りどおり、`motionDebugCameraStream.ts`、`motionDebugVideoSource.ts`、`motionDebugRecordingController.ts`、`motionDebugViewerModel.ts` は再利用し、同じ責務の再実装は避けた。
- `MotionDebugApp` は `window.__SINCRO_MOTION_DEBUG__` の既存 API 名・引数・戻り値を維持する facade とし、VRM URL validation、camera / fixture source、TrackerRuntime bridge、replay、metrics / QA、window API binding、VRM scene / render cadence を専用 module へ分けた。
- camera / fixture / replay stop 時の cleanup と temporal / intent estimator reset は、既存の呼び出し順を維持するため replay runtime と recording controller の reset callback を同期させた。
- `no_recording_loaded` と `fixture_id_required` は `motionDebugViewerModel` の既存テストで回帰確認した。
- VRM URL validation は same-origin かつ `/characters/` 配下だけを許可する既存挙動を `motionDebugVrmUrl.ts` に移した。
- `MotionDebugApp` と `motionDebugReplayRuntime.ts` は公開 API facade / replay reset timing を保つため 300 行超の例外を残した。`tasks:check:frontend-structure` はこの 2 件の例外を認識するが、feature branch 全体の既存 strict diff 由来ファイルで失敗した。

### ドキュメント同期

- `documents/design/frontend/pages.md` と `documents/design/frontend/character/motion.md` に motion-debug page controller の内部 module 境界を追記した。
- WebRTC / chat / backend contract は変更していないため、contract 文書の同期は不要。

### 検証

- `cd sincromisor-frontend && npm run test -- motionDebugRecordingController`: PASS
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`: PASS
- `cd sincromisor-frontend && npm run test -- motionDebugCameraStream`: PASS
- `cd sincromisor-frontend && npm run test -- motionQaRegression`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `npm run tasks:check`: PASS（root `node_modules` が worktree に無かったため main checkout の `node_modules` を一時 symlink して実行し、symlink は commit 前に削除）
- `npm run tasks:check:frontend-structure`: FAIL。`motionDebugApp.ts` の例外は accepted だが、worktree の `main` 差分に過去タスク由来の 300 行超ファイルが多数含まれ、26 strict target failures で失敗した。本タスクでは無関係な過去差分へ例外コメントを追加しない判断。
- `npm run gate`: PASS（commit `ed0d0a8f5bbf18e16a56c82b47849b1c13e7a700`、lint / build / test すべて PASS。gate の build は上記 `npm run build`、check は上記 `npm run check`、test は全体 `npm run test` を包含）

### コミット

- `ed0d0a8f5bbf18e16a56c82b47849b1c13e7a700` `refactor(character): split motion debug app controller`

### 残リスク

- 構造ガードの strict failure は feature branch 全体の差分基準に依存しており、本タスク単独では解消していない。
- motion-debug の実ブラウザ camera / fixture 操作は自動テストでは mock / unit 境界の確認に留まる。
