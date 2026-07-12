# character animation 3.0 phase 11 post-processing contract

## 背景 / 目的

Phase 11 は learned post-processing / lightweight optimization を候補にするが、roadmap は「ログと metrics が揃った後」「出力は VRM bone rotation ではなく canonical control」「モデル差分や avatar profile を ML に背負わせない」ことを条件にしている（`documents/research/character_animation/roadmap.md:516`、`documents/research/character_animation/roadmap.md:526`、`documents/research/character_animation/report02.md:785`、`documents/research/character_animation/report02.md:806`）。

このタスクでは learned model や最適化本体を実装せず、Phase 11 の後続タスクが共有する保存可能な post-processing contract と no-op processor を追加する。補正対象は `CanonicalUpperBodyState` / `TemporalUpperBodyState` / `MotionIntentState` に限定し、VRM normalized pose、IK quaternion、avatar profile は出力に含めない。

依存:

- `task-260627234129-character-animation-3-0-phase-10-fixed-motion-qa-regression-`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionPostProcessing/motionPostProcessingState.ts` を追加し、`MOTION_POST_PROCESSING_SCHEMA_VERSION = "sincro.motion-post-processing.v1"`、`MotionPostProcessingInput`、`MotionPostProcessingResult`、`MotionPostProcessingCorrection`、`MotionPostProcessingParseResult`、`parseMotionPostProcessingResult(value)`、`createNoopMotionPostProcessingResult(input)` を export する。
- [ ] `MotionPostProcessingInput` は `{ canonical?: CanonicalUpperBodyState; temporal?: TemporalUpperBodyState; intent?: MotionIntentState; reliability?: ReliabilityMap; mediaTimeMs: number; source: "live" | "replay" | "fixture" }` に固定する。`mediaTimeMs` は caller 指定を正本とし、helper 内で `performance.now()` / `Date.now()` は呼ばない。
- [ ] `MotionPostProcessingResult` の schema は次に固定する。`output` は補正後 contract を入れる場所だが、no-op ではすべて省略する。

```ts
export type MotionPostProcessingMode = "disabled" | "rule_based" | "learned";
export type MotionPostProcessingTarget = "canonical" | "temporal" | "intent";
export type MotionPostProcessingCorrectionKind =
    | "jitter_smoothing"
    | "dropout_fill"
    | "gesture_sequence_classification"
    | "anomaly_rejection"
    | "ik_refinement_hint";

export type MotionPostProcessingCorrection = {
    target: MotionPostProcessingTarget;
    path: string;
    kind: MotionPostProcessingCorrectionKind;
    confidence: number;
    reasonCode:
        | "noop"
        | "neutral_jitter"
        | "recovery_jump"
        | "side_swap_suspect"
        | "gesture_flicker"
        | "tracking_loss"
        | "solver_limit";
    previousValue?: unknown;
    nextValue?: unknown;
};

export type MotionPostProcessingResult = {
    schemaVersion: typeof MOTION_POST_PROCESSING_SCHEMA_VERSION;
    timestamp: { mediaTimeMs: number };
    processor: {
        id: string;
        version: string;
        mode: MotionPostProcessingMode;
    };
    inputAvailability: {
        canonical: boolean;
        temporal: boolean;
        intent: boolean;
        reliability: boolean;
    };
    output: {
        canonical?: CanonicalUpperBodyState;
        temporal?: TemporalUpperBodyState;
        intent?: MotionIntentState;
    };
    corrections: MotionPostProcessingCorrection[];
    warnings: Array<
        | "input_missing"
        | "invalid_output"
        | "low_confidence"
        | "model_unavailable"
        | "processor_disabled"
    >;
};
```

- [ ] parser は unknown schema version を `unknown_schema_version`、非 finite number / unknown enum / extra key / class instance / function を `invalid_state`、`confidence` の `0..1` 範囲外を `out_of_range` として返す。`previousValue` / `nextValue` は `undefined`、`null`、boolean、string、finite number、plain array、plain object だけを許可し、`THREE.Vector3` / `THREE.Quaternion` 風 object は reject する。
- [ ] `createNoopMotionPostProcessingResult(input)` は `processor: { id: "noop", version: "v1", mode: "disabled" }`、`corrections: []`、`warnings: ["processor_disabled"]`、`output: {}` を返す。入力 contract を deep clone して output に再保存しない。
- [ ] `sincromisor-frontend/src/character/motionPostProcessing/noopMotionPostProcessor.ts` を追加し、`NoopMotionPostProcessor` と `MotionPostProcessor` interface を export する。interface は `process(input: MotionPostProcessingInput): MotionPostProcessingResult` の同期 API に固定し、v1 では async / Worker / network / WASM loader を持たない。
- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts` に `frame.postProcessing?: unknown` の optional slot を additive に追加する。log 全体 parse は strict validation せず、個別 parser で検証する。旧 log に slot が無い場合は load を失敗させない。
- [ ] `sincromisor-frontend/src/pages/motionDebug/types.ts` と viewer model を更新し、layer key に `"postProcessing"` を追加する。saved `frame.postProcessing` が valid なら `available`、invalid なら `invalid`、欠損なら `not_recorded` として表示する。live recompute で欠損を隠さない。
- [ ] `motion-debug` の live / replay runtime には no-op processor だけを接続し、保存する場合も `processor_disabled` の result に限定する。canonical / temporal / intent の実値を no-op output として二重保存しない。
- [ ] `sincromisor-frontend/src/character/motionPostProcessing/__tests__/motionPostProcessingState.test.ts` を追加し、valid no-op、unknown schema、unknown enum、confidence 範囲外、runtime object 風 value、extra key reject、input availability を検証する。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` または同等の viewer test を更新し、postProcessing layer の valid / invalid / not_recorded を検証する。
- [ ] `documents/design/frontend/character/motion.md` に Phase 11 post-processing contract、VRM bone rotation を出力しない方針、no-op v1、saved `frame.postProcessing` の扱いを同期する。

## 設計判断（着手前に確定済み）

- Phase 11 の共有 module は `src/character/motionPostProcessing/` に置く。`motionEvaluation` は評価、`motionIntent` は semantic intent、`vrmPose` は VRM pose 合成の責務なので、後処理 contract をそこへ混ぜない。
- v1 の出力は `CanonicalUpperBodyState`、`TemporalUpperBodyState`、`MotionIntentState` の optional corrected copy だけに限定する。`VrmNormalizedLocalPose`、IK quaternion、`AvatarMotionProfile`、raw MediaPipe result は出力禁止にする。
- no-op result は入力を output にコピーしない。recording size の増加と「補正済み」と誤読されることを避けるため、補正がある場合だけ output に保存する。
- processor API は同期 `process()` に固定する。learned model / Worker / async inference は後続タスクの責務であり、このタスクで外部 runtime 境界を増やさない。
- `frame.postProcessing` は optional unknown slot とし、motion-debug log schema 全体では strict validation しない。旧 log 互換を保ち、viewer layer で個別 parser を使う既存 canonical / temporal / intent と同じ形にする。
- 外部 API / backend / WebRTC 契約は変更しない。developer-visible な motion-debug log / viewer surface だけが増える。

## スコープ境界

- 本タスクでやること:
    - post-processing v1 contract、parser、no-op processor。
    - motion-debug log optional slot と viewer layer。
    - no-op result の unit / viewer test。
    - design doc 同期。
- 本タスクでやらないこと:
    - learned model、ML runtime、WASM / ONNX / WebGPU loader。
    - constrained IK refinement の実装。
    - anomaly detector / gesture sequence classifier の実装。
    - canonical / temporal / intent の値を実際に補正すること。
    - production `VRMCharacterManager` の pose 適用順序変更。
- 依存タスクとの境界:
    - Phase 10 QA regression は replay log と metrics を返す。本タスクはその結果を読まず、後続 failure mining task が metrics から補正候補を抽出する。

## 実装方針（既存コード整合: file:line）

- `CanonicalUpperBodyState` は body-local の意味量と schema version を持ち、VRM bone rotation を含めない（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:83`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:94`）。post-processing の canonical output はこの型だけを使う。
- `TemporalUpperBodyState` は時系列状態、canonical scalar、velocity、recovering blend を保存し、IK solver 出力は含めない（`sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:68`、`sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:100`）。post-processing の temporal output はこの型だけを使う。
- `MotionIntentState` は intent / confidence / reliability / source / warnings を保存する（`sincromisor-frontend/src/character/motionIntent/motionIntentState.ts:54`、`sincromisor-frontend/src/character/motionIntent/motionIntentState.ts:67`）。gesture sequence classifier は後続でこの型を補正対象にする。
- motion-debug log frame は optional unknown slot を複数持つ（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:102`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:111`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:113`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:115`）。`postProcessing` も同じ additive slot にする。
- `MotionDebugSnapshot` は canonical / temporal / intent / finalPose を optional field として持つ（`sincromisor-frontend/src/pages/motionDebug/types.ts:202`、`sincromisor-frontend/src/pages/motionDebug/types.ts:210`、`sincromisor-frontend/src/pages/motionDebug/types.ts:212`、`sincromisor-frontend/src/pages/motionDebug/types.ts:218`）。postProcessing snapshot も同じ developer-visible snapshot に追加する。
- `MotionDebugApp.applyReplayPoseSnapshot()` は replay 時に canonical / temporal / intent を更新してから pose を適用している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:730`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:737`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:739`）。post-processing v1 はこの後段に no-op snapshot を置くだけで、pose 適用値は変えない。

## テスト

- `cd sincromisor-frontend && npm run test -- motionPostProcessingState`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugLogSchema`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な motion-debug log / viewer layer と `character/motionPostProcessing` contract が増えるため、`documents/design/frontend/character/motion.md` に schema version、保存 slot、no-op v1、VRM bone rotation を出力しない方針を同期する。
