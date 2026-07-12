# Review: task-260628200308-character-animation-3-0-phase-12-motion-debug-app-controller

## 判定

APPROVED

High/Critical の blocking 指摘はない。window API 維持、controller 分割先、cleanup / reset / error code / VRM URL validation の既存挙動維持、依存タスクとの境界、文書同期が実装前に定義されている。

## 指摘事項

- [Medium] design doc の `file:line` 参照にズレがある。`documents/design/frontend/pages.md:51` は Change Checklist で、motion-debug developer page の説明は現状 `documents/design/frontend/pages.md:45` 以降。`documents/design/frontend/character/motion.md:69` は IK refinement 付近で、motion-debug の API / replay / metrics 説明は現状 `documents/design/frontend/character/motion.md:96` 以降。同期先は明確なので blocking ではない。

## 実装者への申し送り

- 既存の `motionDebugCameraStream.ts`、`motionDebugVideoSource.ts`、`motionDebugRecordingController.ts`、`motionDebugViewerModel.ts` などを再利用し、同じ責務の重複実装を増やさない。
- `window.__SINCRO_MOTION_DEBUG__` は developer-visible API なので、binding を module 化しても `types.ts:283` 以降の API 名・引数・戻り値を変えない。
- replay / metrics / QA API の `no_recording_loaded` と `fixture_id_required` は既存 E2E 的な利用者が依存しやすいため、分割後に明示的に回帰確認する。
