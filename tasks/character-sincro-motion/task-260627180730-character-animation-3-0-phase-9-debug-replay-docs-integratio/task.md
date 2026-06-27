# character animation 3.0 phase 9 debug replay docs integration

## 背景 / 目的

Phase 9 の完了条件は、手振り、指差し、サムズアップ、ピース、顔近くの手が意味ある motion として見え、gesture label のちらつきが hysteresis と minimum duration で抑えられ、tracking 低下中も semantic / fallback / comfortable pose の blend で自然に退避できることである（`documents/research/character_animation/roadmap.md:487`、`documents/research/character_animation/roadmap.md:489`、`documents/research/character_animation/roadmap.md:490`、`documents/research/character_animation/roadmap.md:491`）。評価基盤調査は `MotionIntent` を motion-debug log の保存対象に含め、replay で pipeline のどの層が悪化したか切り分ける方針を示している（`documents/research/character_animation/answers/07-evaluation-debug-qa.md:41`、`documents/research/character_animation/answers/07-evaluation-debug-qa.md:151`、`documents/research/character_animation/answers/07-evaluation-debug-qa.md:183`）。

このタスクでは Phase 9 の最後に、MotionIntent estimator、semantic pose layer、finger curl layer を motion-debug recording / replay viewer / metrics / design docs へ接続する。実装本体は依存タスクで閉じ、本タスクは観測性、保存、replay の決定性、設計文書同期を担当する。

## 完了条件（受け入れ条件）

- [ ] 依存タスク `task-260627180726-character-animation-3-0-phase-9-finger-curl-pose-mapping` までの MotionIntent / semantic / finger helper が HEAD に存在しない場合は実装せず、依存未充足として止める。
- [ ] `MotionDebugRecordingController` は canonical / reliability / temporal を解決した後、同じ `mediaTimeMs` で `MotionIntentEstimator.update()` を呼び、recording 中の frame に `intent: MotionIntentState` を保存する。recording していない live state でも latest intent を snapshot に保持する。
- [ ] camera stop、video fixture load、recording load、replay stop、source reset では MotionIntentEstimator を reset する。TemporalStateEstimator と reset タイミングを揃え、旧 source の cooldown / stable duration を持ち越さない。
- [ ] `MotionDebugSnapshot` に optional `intent?: MotionIntentState | { parseStatus: "invalid"; errors: unknown }` を追加し、`window.__SINCRO_MOTION_DEBUG__.getSnapshot()` から latest intent を確認できる。既存 top-level field 名は削除しない。
- [ ] replay viewer の intent layer は saved `frame.intent` を正本にする。旧 log で `frame.intent` が無い場合は `not_recorded`、schema invalid は `invalid` とし、live recompute で欠損を隠さない。
- [ ] `pose-snapshot` replay mode では saved `frame.intent` がある場合も estimator の live state を上書きしない。viewer は saved intent を表示し、pipeline 再実行結果としての latest intent は snapshot 側に optional で出す。両者が違う場合は replay failure ではなく debug 差分として扱う。
- [ ] motion-debug は `frame.solver.phase9` に Phase 9 semantic / finger debug snapshot を必ず保存する。schemaVersion は `sincro.phase9-semantic-motion.v1` に固定し、`intent`、`semantic`、`finger`、`layers`、`warnings` だけを持つ plain object とする。`solver.phase6`、`solver.phase7`、`finalPose` の既存 schema には無名 field を追加しない。

```ts
export type MotionDebugPhase9SemanticSnapshot = {
    schemaVersion: "sincro.phase9-semantic-motion.v1";
    timestamp: { mediaTimeMs: number };
    intent: MotionIntentState;
    semantic: SemanticMotionPoseLayerDebugSnapshot;
    finger: {
        left?: FingerCurlPoseDebugSnapshot;
        right?: FingerCurlPoseDebugSnapshot;
    };
    layers: Array<{
        id: string;
        kind: "semantic";
        weight: number;
        ownedBones: VRMHumanBoneName[];
    }>;
    warnings: string[];
};
```

- [ ] replay viewer の solver layer は `phase6` / `phase7` に加えて `phase9` substatus を持つ。旧 log で `frame.solver.phase9` が無い場合は `phase9.status = "not_recorded"`、schema invalid は `phase9.status = "invalid"` にし、solver 外側 status は phase6 / phase7 / phase9 のいずれかが available / invalid なら `available` にする。
- [ ] metrics に `gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount` を追加する。4 件とも unit は `count`、direction は `lower_is_better` に固定する。
- [ ] metric 閾値は `DEFAULT_MOTION_METRIC_THRESHOLDS` に `gestureFlickerCount: { pass: 0, warn: 2, fail: 5 }`、`semanticFallbackFrameCount: { pass: 30, warn: 120, fail: 240 }`、`intentCooldownSuppressionCount: { pass: 0, warn: 20, fail: 60 }`、`intentInvalidFrameCount: { pass: 0, warn: 1, fail: 3 }` を追加する。custom config は既存 `thresholds` override を使う。
- [ ] `gestureFlickerCount` は同一 side の intent が semantic intent になったあと、その side の `stableDurationMs < 150` のまま `tracking` または別 semantic intent へ戻った回数に固定する。`semanticFallbackFrameCount` は左右 arm-side sample のうち intent が `lost` または `fallback` の数に固定する。`intentCooldownSuppressionCount` は side warnings に `gesture_cooldown` を含む arm-side sample 数に固定する。
- [ ] invalid `frame.intent` は `parseMotionIntentState()` が失敗した frame 数として `intentInvalidFrameCount` に数え、他 3 件の sample から除外する。既存 `MotionMetricResult` schema は拡張せず、他 3 件で valid intent sample が 0 の場合は `status: "not_available"`、`value: null`、`sampleCount: 0`、`unavailableReason: "intent_not_recorded"` を返す。
- [ ] `motionMetrics.test.ts` で、saved `frame.intent` から上記 metrics が計算されること、旧 log 欠損では metric status が `not_available` になること、invalid intent frame は `intentInvalidFrameCount` にだけ入ることを検証する。
- [ ] `motionDebugRecorder.test.ts` と `motionDebugViewerModel.test.ts` で、recorded NDJSON に `frame.intent` が入ること、valid intent layer が `available` になること、invalid schema が replay failure ではなく layer invalid になること、source reset で estimator が reset されることを検証する。
- [ ] `documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/overview.md` に Phase 9 の MotionIntent / semantic / finger / debug / replay / metrics の最終 contract を同期する。
- [ ] `documents/research/character_animation/roadmap.md` は研究 roadmap のため、実装結果の詳細で本文を書き換えない。Phase 9 の実装メモが必要な場合は design docs 側に記録する。

## 設計判断（着手前に確定済み）

- `frame.intent` は saved value を replay viewer の正本にする。replay 時に live recompute で欠損を埋める案は、旧 log の記録不足を隠して regression 比較を曖昧にするため採用しない。
- estimator reset は TemporalStateEstimator と同じ source lifecycle に揃える。intent の cooldown / hysteresis は source-local な状態であり、camera / fixture / replay をまたいで保持しない。
- metrics は `frame.intent` から計算する。semantic pose debug や final pose から gesture intent を逆推定する案は、Phase 9 の contract を迂回するため採用しない。
- semantic debug snapshot は追加する場合も Phase 6 / Phase 7 の既存 snapshot と分け、`sincro.phase9-semantic-motion.v1` を名乗る。Phase 6 solver schema へ無名 field を混ぜない。
- roadmap は正本方針の研究文書として維持し、実装詳細は design docs に同期する。

## スコープ境界

- 本タスクでやること:
    - MotionIntent estimator の motion-debug recording / snapshot 接続。
    - saved `frame.intent` の replay viewer 表示。
    - intent metrics。
    - Phase 9 design docs 同期。
- 本タスクでやらないこと:
    - Gesture Recognizer の MediaPipe 実行接続。
    - semantic pose / finger helper の新規設計変更。
    - 本番 `VRMCharacterManager.update()` の全面移行。
    - Phase 10 の端末クラス別 degradation profile。
    - 主観評価フォーム / fixed motion catalog の追加。
- 依存タスクとの境界:
    - contract task が `MotionIntentState` parser を提供する。
    - estimator task が hysteresis 付き intent 推定を提供する。
    - semantic / finger task が pose layer helper を提供する。
    - 本タスクはそれらを debug / replay / metrics / docs へ接続するだけ。

## 実装方針（既存コード整合: file:line）

- `MotionDebugRecordingController.recordPoseFrame()` は canonical、reliability、temporal を同じ frame で解決し、recording 中に `recorder.recordFrame()` へ渡す（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:137`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:157`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:159`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:180`）。intent は temporal 解決直後に追加する。
- recorder は現在 `poseSnapshot`、`hand`、`reliability`、`canonical`、`temporal`、`solver`、`finalPose`、`metrics` を保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:186`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:187`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:188`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:190`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:191`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:197`）。`intent` はこの frame record に追加する。
- motion-debug log schema は `frame.intent` optional slot を既に持つ（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:102`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:113`）。本タスクでは optional slot を利用し、manifest schema の破壊的変更はしない。
- viewer model は intent layer key を持つ（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:50`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:78`）。依存 contract task の parsed layer を recording / replay の実データで使う。
- metrics は `parseTemporal()`、`parsePhase6Solver()`、`parseFinalPose()` のように per-frame optional parser を使っている（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:294`、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:299`、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:309`）。intent metrics も `parseMotionIntentState(frame.intent)` helper を追加して同じ構成にする。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な `frame.intent`、semantic / finger debug snapshot、intent metrics、Phase 9 motion pipeline の公開挙動を変更するため、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/overview.md` を同期する。
