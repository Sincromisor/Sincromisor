# character animation 3.0 phase 10 ordered degradation policy

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の Phase 10 は、負荷が上がったときに同期品質を一気に落とすのではなく、Gesture fps 低下、Hand / Face optional pass 低下、ROI / hand 一時停止、Pose fps / camera resolution 低下、face-only / idle / comfortable pose 退避の順で段階的に degraded mode へ移ることを求めている。

現状は `TrackerRuntimeRoiBudgetController` が ROI pause を持ち、`TrackerRuntimePosePerformanceGate` が face-only fallback を持つが、全体の degradation order と recovery 条件が 1 つの policy として読めない。このタスクでは ordered degradation policy を pure controller として切り出し、runtime が同じ順序で degrade / recover できるようにする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeDegradationPolicy.ts` を追加し、`TrackerRuntimeDegradationStage`、`TrackerRuntimeDegradationPolicyState`、`TrackerRuntimeDegradationPolicyInput`、`TrackerRuntimeDegradationPolicyDecision`、`TrackerRuntimeDegradationPolicyController` を export する。
- [ ] degradation stage は `"full" | "gesture-reduced-fps" | "optional-pass-reduced-fps" | "roi-hand-paused" | "pose-reduced-fps" | "face-only" | "comfortable-idle"` に固定する。既存 `TrackerRuntimeDegradationState` は `"full" | "main-thread-low-fps" | "pose-reduced-fps" | "face-only" | "fallback"` を維持し、`main-thread-low-fps` を削除 / rename しない。詳細 stage は `SincroTrackerWorkerStats.degradationPolicy` に保存する。
- [ ] policy は Phase 10 の degradation order を固定する。`input.budgetStatus === "over_budget"` または `input.roi.consecutiveOverBudgetFrames >= profile.degradationBudget.consecutiveOverBudgetFrames` の frame を over-budget frame とし、`state.consecutiveOverBudgetFrames >= profile.degradationBudget.consecutiveOverBudgetFrames` になった frame で `full -> gesture-reduced-fps -> optional-pass-reduced-fps -> roi-hand-paused -> pose-reduced-fps -> face-only -> comfortable-idle` の順に 1 段だけ進む。stage を飛ばさず、stage 進行後は over-budget / recovery counters を `0` に reset する。
- [ ] recovery は逆順で 1 段ずつ戻す。`input.budgetStatus === "ok"` かつ `input.roi.consecutiveOverBudgetFrames === 0` の frame を budget 内 frame とし、`state.consecutiveWithinBudgetFrames >= profile.degradationBudget.recoveryFrames` になった frame だけ戻す。`face-only` から `pose-reduced-fps` へ戻るときは `poseDetected === true` かつ `poseInferenceTimeMs` が `profile` 由来 pose budget 以下であることを追加条件にする。
- [ ] `gesture-reduced-fps` は `effectiveGestureFps = max(1, floor(profile.cadence.gestureFps / 2))` を decision に出すが、本タスクでは Gesture Recognizer runtime を起動しない。stats / debug 用に decision field を残す。
- [ ] `optional-pass-reduced-fps` は Hand / Face ROI cadence を `max(1, floor(profile.cadence.handFps / 2))`、`max(1, floor(profile.cadence.faceRoiFps / 2))` へ下げる。`roi-hand-paused` は Hand ROI を停止し Face ROI は継続、既存 ROI budget の `hand-paused` と同じ外部挙動にする。
- [ ] `pose-reduced-fps` は Pose fps を `max(2, floor(profile.cadence.poseFps / 2))` にし、Face full-frame は `profile.cadence.faceFps` を維持する。
- [ ] `face-only` は既存の `degradePoseToFaceOnly()` 経路を使う。`comfortable-idle` では tracker runtime は camera / Face tracking を止めず、Pose / Hand / Face ROI を停止し、`onPoseFallback` と `onHandMotion` に comfortable / lost snapshot を出す。
- [ ] `SincroTrackerWorkerStats` に optional `degradationPolicy` を追加する。shape は `schemaVersion: "sincro.tracker-degradation-policy.v1"`、`stage`、`previousStage`、`reasonCodes`、`sinceMediaTimeMs`、`effectiveCadence`、`recovering` を持つ。
- [ ] `TrackerRuntime` は `withBudget()` の結果と ROI stats を policy に渡し、decision の effective cadence を次 frame 以降の `targetPoseInferenceFps` / `targetHandInferenceFps` / `targetFaceRoiInferenceFps` に反映する。main-thread fallback 中は `main-thread-low-fps` clamp を上限として優先し、policy が fps を上げない。
- [ ] `TrackerRuntimeRoiBudgetController` の pause state は policy decision からも設定できるようにする。ただし既存 ROI over-budget 5 frame / recovery 30 frame の挙動は unit test で維持する。policy 由来の `roi-hand-paused` は `reasonCodes` に `hand_roi_paused` を追加するが、ROI controller 自身の `fallbackCount` / `skippedFrames` を直接増やさない。
- [ ] `ignorePerformanceFallback: true` の motion-debug では `face-only` と `comfortable-idle` への自動遷移だけ抑制し、`gesture-reduced-fps`、`optional-pass-reduced-fps`、`roi-hand-paused`、`pose-reduced-fps` の stats は記録する。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/trackerRuntimeDegradationPolicy.test.ts` を追加し、順序、stage skip 禁止、recovery 逆順、main-thread clamp 上限、ignorePerformanceFallback の境界を検証する。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/trackerRuntimeRoiBudget.test.ts` または既存相当 test を更新し、policy 由来 pause と ROI budget 由来 pause の reason code が混ざっても重複せず stats に出ることを検証する。
- [ ] `motionDebugViewerModel` または Debug Console snapshot test を更新し、`degradationPolicy.stage`、active profile、reasonCodes、effective cadence を metrics layer で確認できることを検証する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に ordered degradation policy v1、stage 一覧、ignorePerformanceFallback の扱い、comfortable-idle の責務境界を同期する。

## 設計判断（着手前に確定済み）

- policy は `TrackerRuntime` の private method ではなく `trackerRuntimeDegradationPolicy.ts` に置く。状態遷移と recovery 条件を DOM / MediaPipe なしで単体テストできるようにするため。
- 詳細 stage は新しい `degradationPolicy` slot に保存し、既存 `TrackerRuntimeDegradationState` enum は `"main-thread-low-fps"` を含む現行 union のまま維持する。既存 budget report と旧 log 互換を壊さないため。
- comfortable-idle は VRM pose を直接生成しない。tracker runtime は fallback / lost snapshot と reason を出すだけにし、実際の comfortable pose blend は Temporal / MotionSolver / VrmPoseComposer の既存責務に残す。
- camera resolution の再交渉は本タスクでは行わない。`applyConstraints()` を live track に当てる案は端末差分が大きく、Phase 10 の最初の degradation policy としてはリスクが高い。camera resolution 低下は stats / decision に予約し、実適用は後続タスクに残す。
- Gesture Recognizer runtime はまだないため、`gesture-reduced-fps` は decision と debug 表示だけを実装する。実行器が無い stage を飛ばす案は roadmap の degradation order と debug 再現性を崩すため採用しない。
- 外部境界は Worker stats / motion-debug snapshot / window API のみである。policy input の欠損値は budget unknown として扱い、over-budget / recovery counters を増やさない。

最小スキーマ:

```ts
export type TrackerRuntimeDegradationStage =
    | "full"
    | "gesture-reduced-fps"
    | "optional-pass-reduced-fps"
    | "roi-hand-paused"
    | "pose-reduced-fps"
    | "face-only"
    | "comfortable-idle";

export type TrackerRuntimeDegradationPolicySnapshot = {
    schemaVersion: "sincro.tracker-degradation-policy.v1";
    stage: TrackerRuntimeDegradationStage;
    previousStage?: TrackerRuntimeDegradationStage;
    reasonCodes: TrackerPerformanceReasonCode[];
    sinceMediaTimeMs?: number;
    effectiveCadence: {
        faceFps: number;
        poseFps: number;
        handFps: number;
        faceRoiFps: number;
        gestureFps: number;
    };
    recovering: boolean;
};

export type TrackerRuntimeDegradationPolicyState = {
    schemaVersion: "sincro.tracker-degradation-policy-state.v1";
    stage: TrackerRuntimeDegradationStage;
    previousStage?: TrackerRuntimeDegradationStage;
    consecutiveOverBudgetFrames: number;
    consecutiveWithinBudgetFrames: number;
    sinceMediaTimeMs?: number;
    recovering: boolean;
};

export type TrackerRuntimeDegradationPolicyInput = {
    mediaTimeMs: number;
    profile: TrackerRuntimePerformanceProfile;
    budgetStatus?: "ok" | "warn" | "over_budget";
    budgetReasonCodes?: TrackerPerformanceReasonCode[];
    poseInferenceTimeMs?: number;
    poseDetected?: boolean;
    roi?: {
        pauseState: SincroTrackerRoiPauseState;
        consecutiveOverBudgetFrames: number;
        reasonCodes: SincroTrackerRoiReasonCode[];
    };
    mainThreadFallbackActive?: boolean;
    ignorePerformanceFallback?: boolean;
};

export type TrackerRuntimeDegradationPolicyDecision = {
    state: TrackerRuntimeDegradationPolicyState;
    snapshot: TrackerRuntimeDegradationPolicySnapshot;
    effectiveCadence: TrackerRuntimeDegradationPolicySnapshot["effectiveCadence"];
    trackerDegradationState: TrackerRuntimeDegradationState;
    roiPauseState?: SincroTrackerRoiPauseState;
    shouldDegradeToFaceOnly: boolean;
    shouldEnterComfortableIdle: boolean;
    reasonCodes: TrackerPerformanceReasonCode[];
};
```

`TrackerRuntimeDegradationPolicyController.update(input)` は `TrackerRuntimeDegradationPolicyDecision` を返す。`mainThreadFallbackActive === true` の場合、`trackerDegradationState` は既存互換の `"main-thread-low-fps"` を返し、policy stage は維持するが effective cadence は main-thread clamp を超えて上げない。

## スコープ境界

- 本タスクでやること:
    - ordered degradation policy controller。
    - `TrackerRuntime` の cadence / ROI pause / face-only fallback への policy 接続。
    - stats / debug / recording に policy snapshot を出す。
    - tracking / motion 設計文書の同期。
- 本タスクでやらないこと:
    - live camera track の resolution 再交渉。
    - Gesture Recognizer runtime 実行。
    - MotionMetrics key 追加や baseline 更新。
    - UI 設定画面での profile 選択。
    - VrmPoseComposer の comfortable pose 生成変更。
- 依存タスクとの境界:
    - `task-260627234128-character-animation-3-0-phase-10-runtime-performance-profile` は profile と budget 閾値を提供する。本タスクはその profile を読み、実際の stage transition と cadence 反映を担当する。
    - `task-260627234129-character-animation-3-0-phase-10-degradation-metrics` は、本タスクが保存した `degradationPolicy` を metrics 化する。

## 実装方針（既存コード整合: file:line）

- `TrackerRuntime` は現在 `degradationState` / `degradationReason` / `degradationSinceMediaTimeMs` を private field で持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:84`）。本タスクでは詳細 policy state を別 field として持つ。
- main-thread fallback は target fps を clamp して `main-thread-low-fps` を記録している（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:538`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:553`）。policy はこの clamp を上限として尊重する。
- Pose performance gate は `applyPosePerformanceGate()` から face-only へ落としている（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:483`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:495`）。本タスクでは policy の `face-only` stage も同じ `degradePoseToFaceOnly()` を使う。
- ROI budget は `active -> hand-paused -> face-paused -> all-paused` の順序を持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeRoiBudget.ts:22`）。policy はこれを再利用し、同じ stats shape に reason code を出す。
- Hand / Face ROI cadence 判定は `trackerRuntimeCadence.ts` の pure helpers に閉じている（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeCadence.ts:54`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeCadence.ts:71`）。policy 反映は target fps と pause flag に限定する。
- `SincroTrackerWorkerStats` は budget と roi を optional で持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:35`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:49`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:50`）。`degradationPolicy` は additive に追加する。
- `withBudget()` は frame timing、stats、roiStats から budget report を作っている（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:610`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:632`）。policy input はここで作る。
- `ignorePerformanceFallback` は options と pose gate configure で使われている（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:128`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:145`）。本タスクでは policy controller にも渡す。

## テスト

- `cd sincromisor-frontend && npm run test -- trackerRuntimeDegradationPolicy`
- `cd sincromisor-frontend && npm run test -- trackerRuntimeRoiBudget`
- `cd sincromisor-frontend && npm run test -- trackerRuntime`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- 手動または Playwright で `motion-debug` を開き、window API の snapshot から `tracker.degradationPolicy.schemaVersion === "sincro.tracker-degradation-policy.v1"` と stage / effective cadence を確認する。負荷再現が実機で難しい場合は unit test で代替し、未実行理由を `impl.md` に残す。
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer-visible な degraded mode の公開挙動、Debug Console / motion-debug snapshot、motion log の保存内容が増えるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に ordered degradation policy v1、stage、recovery 条件、`ignorePerformanceFallback` の意味を同期する。
