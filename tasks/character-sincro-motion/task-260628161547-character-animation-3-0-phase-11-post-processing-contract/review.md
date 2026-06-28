# Review: task-260628161547-character-animation-3-0-phase-11-post-processing-contract

## 判定
APPROVED

Critical / High の blocking 指摘はない。受け入れ条件は contract、保存 slot、viewer 表示、no-op runtime、テスト、設計文書同期まで検証可能に固定されており、既存コード・設計文書の前提とも整合している。

## 指摘事項

- [Medium] `MotionPostProcessingParseResult` の詳細 shape は明示されていない。既存の `CanonicalUpperBodyStateParseResult` / `TemporalUpperBodyStateParseResult` / `MotionIntentParseResult` と同様に `{ ok: true; ... } | { ok: false; errors: ...[] }`、`path`、`message` 付き error を採るのが自然だが、実装者は既存 parser パターンへ揃えること。
- [Low] `THREE.Vector3` / `THREE.Quaternion` 風 object の reject 条件は「風」の境界がやや広い。受け入れ条件の `runtime object 風 value` テストでは、`isVector3` / `isQuaternion` marker や prototype が plain object でない runtime instance を明示的に落とすケースを入れること。

## 実装者への申し送り

- `motionDebugViewerModel.ts` の既存 layer には replay frame 欠損時に live snapshot や再計算へ fallback するものがあるが、`postProcessing` は task.md の指定どおり saved `frame.postProcessing` を正本にし、欠損は `not_recorded` として live recompute で隠さない。
- `frame.postProcessing` は `motionDebugLogSchema.ts` では optional `unknown` slot に留め、log 全体の strict validation 対象にしない。検証は `parseMotionPostProcessingResult()` の境界へ閉じる。
- no-op result は `processor_disabled`、`output: {}`、`corrections: []` に固定し、canonical / temporal / intent の実値を output へ複製しない。
- design doc 同期は受け入れ条件に含まれているため、`documents/design/frontend/character/motion.md` へ schema version、保存 slot、no-op v1、VRM bone rotation を出力しない方針を必ず反映する。
