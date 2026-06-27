# character animation 3.0 phase 10 runtime performance profiles

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の Phase 10 は、端末クラス別に camera resolution、Pose fps、Hand / Face fps、Gesture fps、debug log 粒度を切り替え、high-end desktop / standard laptop / mobile Safari / debug mode の profile を持つことを求めている。

現状は `TrackerRuntime` の既定値と `motion-debug` の固定 camera constraints に性能方針が散っており、端末差分を再現可能な profile として debug / recording / replay から追えない。このタスクでは runtime performance profile の contract と適用境界を先に固定し、後続の ordered degradation policy が同じ profile を読めるようにする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePerformanceProfile.ts` を追加し、`TrackerRuntimePerformanceProfileId`、`TrackerRuntimePerformanceProfile`、`resolveTrackerRuntimePerformanceProfile(input?)` を export する。
- [ ] `resolveTrackerRuntimePerformanceProfile(input?)` の入力は `{ performanceProfileId?: string; performanceProfile?: unknown; defaultProfileId?: TrackerRuntimePerformanceProfileId }` に固定する。`input === undefined` または profile 未指定時は `defaultProfileId ?? "standard-laptop"` を返す。motion-debug だけは呼び出し側が `defaultProfileId: "debug"` を渡す。
- [ ] `TrackerRuntimePerformanceProfileId` は `"high-end-desktop" | "standard-laptop" | "mobile-safari" | "debug"` に固定し、未知 id は `standard-laptop` に fallback しつつ `warnings: ["unknown_profile_id_defaulted"]` を返す。
- [ ] `TrackerRuntimePerformanceProfile` は `schemaVersion: "sincro.tracker-performance-profile.v1"`、`id`、`requestedId`、`camera`、`cadence`、`debugLog`、`degradationBudget`、`warnings` だけを持つ JSON 保存可能な plain object とする。`requestedId` は caller が指定した raw id を説明用に保存する optional string とし、`MediaStreamTrack`、DOM、runtime class instance、function は保持しない。
- [ ] `camera` は `idealWidth`、`idealHeight`、`idealFrameRate`、`maxFrameRate`、`facingMode` を持つ。各 profile の値は次に固定する: high-end desktop `1280x720 30fps`、standard laptop `960x540 24fps`、mobile Safari `640x480 15fps`、debug `1280x720 30fps`。
- [ ] `cadence` は `faceFps`、`poseFps`、`handFps`、`faceRoiFps`、`gestureFps` を持つ。各 profile の値は high-end desktop `15/12/8/10/6`、standard laptop `12/8/4/6/3`、mobile Safari `8/4/2/3/1`、debug `15/12/4/6/2` に固定する。
- [ ] `debugLog` は `numericRingBufferFrames`、`captureFullDumpByDefault`、`overlayCaptureFps` を持つ。常時記録は numeric ring buffer に限定し、PNG / overlay / full dump は `captureFullDumpByDefault: false` と `overlayCaptureFps <= 1` を既定にする。ただし debug profile だけ `numericRingBufferFrames = 1800`、他 profile は `600` にする。
- [ ] `degradationBudget` は `workerRoundTripWarnRatio`、`workerRoundTripOverBudgetRatio`、`roiBudgetRatio`、`consecutiveOverBudgetFrames`、`recoveryFrames` を持ち、既存 Phase 3 / Phase 8 の閾値と同じ `0.9`、`1.25`、`0.55`、`5`、`30` を既定値にする。
- [ ] `TrackerRuntimePoseOptions` に optional `performanceProfileId?: TrackerRuntimePerformanceProfileId` と `performanceProfile?: TrackerRuntimePerformanceProfile` を追加する。両方指定された場合は `performanceProfile` を優先し、`performanceProfileId` は `requestedId` と debug 表示用の要求値としてだけ扱う。
- [ ] `TrackerRuntime.startFaceTracking()` は profile 由来の cadence を target fps の default として使う。明示的な `targetInferenceFps` / `poseOptions.targetInferenceFps` / `poseOptions.hand.targetInferenceFps` / `poseOptions.faceRoi.targetInferenceFps` が渡された場合は従来どおり明示値を優先する。
- [ ] `requestMotionDebugCameraStream()` は optional profile を受け取り、`MOTION_DEBUG_CAMERA_CONSTRAINTS` の固定 1280x720 ではなく profile camera から constraints を作る。既定 profile は `debug` とする。
- [ ] `MotionDebugApp.startCamera()` と window API に optional `performanceProfileId` を通せるようにし、active profile は `getSnapshot().camera.performanceProfile` を canonical path とする。`getSnapshot().tracker.budget` へ profile を重複保存しない。
- [ ] `MotionDebugRecorder` の manifest または `frame.metrics.tracker` に active performance profile を保存する。保存場所は `manifest.pipeline.performanceProfile` を正本とし、frame ごとの重複保存はしない。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/trackerRuntimePerformanceProfile.test.ts` を追加し、4 profile の固定値、未知 id fallback、明示 target fps override、non-finite custom profile reject / default を検証する。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugCameraStream.test.ts` または既存相当 test を追加し、standard laptop / mobile Safari の constraints が exact / min を使わず ideal / max だけになることを検証する。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugRecordingController.test.ts` を更新し、`manifest.pipeline.performanceProfile.schemaVersion === "sincro.tracker-performance-profile.v1"` と active profile id が保存されることを直接検証する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に performance profile v1、端末クラス別 cadence / camera constraints、debug log 粒度、後続 degradation policy との境界を同期する。

## 設計判断（着手前に確定済み）

- 新規 profile contract は `src/features/gaze/trackingRuntime/trackerRuntimePerformanceProfile.ts` に置く。`motion-debug` page 配下に置く案は、通常 runtime と後続 degradation policy も読むため採用しない。
- camera constraints は `ideal` / `max` だけを使い、`exact` / 強い `min` は使わない。端末が満たせないと `getUserMedia()` が失敗しやすく、Phase 10 の目的である段階的 degraded mode と相性が悪いため。
- `gestureFps` は profile contract に含めるが、本タスクでは Gesture Recognizer の MediaPipe 実行接続をしない。Phase 9 の MotionIntent は実装済みだが、Gesture Recognizer runtime 化は別責務であり、ここでは後続が読む数値を固定する。
- active profile の live snapshot canonical path は `camera.performanceProfile`、recording canonical path は `manifest.pipeline.performanceProfile` とする。`tracker.budget` へ入れる案は、performance budget report が per-frame budget / degradation の説明値であり、profile は camera constraints と cadence の入力 contract なので採用しない。
- `resolveTrackerRuntimePerformanceProfile()` の default は通常 runtime で `standard-laptop`、motion-debug 呼び出し時だけ `debug` に固定する。関数内部で URL / userAgent / debug page を読んで自動判定する案は、replay / unit test の決定性を落とすため採用しない。
- motion-debug で `performanceProfileId` が指定された場合、`MotionDebugApp.startRuntimeWithStream()` の固定 `POSE_TARGET_INFERENCE_FPS` override は使わず、profile cadence を Pose fps に適用する。profile 未指定の debug 既定では debug profile の `poseFps = 12` なので現行値と同じ挙動を維持する。
- 外部境界は browser `getUserMedia()` constraints と window debug API だけである。未知 profile id / invalid custom profile は throw せず `standard-laptop` fallback と warning で扱い、camera permission failure は既存の `requestMotionDebugCameraStream()` の reject を維持する。

最小スキーマ:

```ts
export type TrackerRuntimePerformanceProfileId =
    | "high-end-desktop"
    | "standard-laptop"
    | "mobile-safari"
    | "debug";

export type TrackerRuntimePerformanceProfile = {
    schemaVersion: "sincro.tracker-performance-profile.v1";
    id: TrackerRuntimePerformanceProfileId;
    requestedId?: string;
    camera: {
        idealWidth: number;
        idealHeight: number;
        idealFrameRate: number;
        maxFrameRate: number;
        facingMode: "user";
    };
    cadence: {
        faceFps: number;
        poseFps: number;
        handFps: number;
        faceRoiFps: number;
        gestureFps: number;
    };
    debugLog: {
        numericRingBufferFrames: number;
        captureFullDumpByDefault: boolean;
        overlayCaptureFps: number;
    };
    degradationBudget: {
        workerRoundTripWarnRatio: number;
        workerRoundTripOverBudgetRatio: number;
        roiBudgetRatio: number;
        consecutiveOverBudgetFrames: number;
        recoveryFrames: number;
    };
    warnings: string[];
};

export type TrackerRuntimePerformanceProfileResolverInput = {
    performanceProfileId?: string;
    performanceProfile?: unknown;
    defaultProfileId?: TrackerRuntimePerformanceProfileId;
};

export type TrackerRuntimePerformanceProfileResolveResult = {
    profile: TrackerRuntimePerformanceProfile;
    source: "default" | "id" | "custom-profile" | "fallback";
};
```

## スコープ境界

- 本タスクでやること:
    - performance profile v1 contract と resolver。
    - `TrackerRuntime` / `motion-debug` camera constraints への profile 接続。
    - active profile の debug snapshot / recording manifest 保存。
    - tracking / motion 設計文書の同期。
- 本タスクでやらないこと:
    - budget overrun を見て自動的に profile / fps を下げること。
    - Gesture Recognizer の runtime 実行接続。
    - metrics key 追加、baseline fixture 更新、QA harness。
    - 通常 app shell 設定 UI への profile 選択追加。
- 依存タスクとの境界:
    - `task-260627180730-character-animation-3-0-phase-9-debug-replay-docs-integratio` は MotionIntent / semantic / finger の debug / replay / docs 接続を完了している。本タスクはその後段として runtime profile を記録し、Phase 9 の semantic 挙動そのものは変更しない。
    - `task-260627234128-character-animation-3-0-phase-10-ordered-degradation-policy` は、本タスクで固定した profile / budget を入力にして実際の自動 degraded mode を実装する。

## 実装方針（既存コード整合: file:line）

- `TrackerRuntime` は target fps を private field として持ち、`startFaceTracking()` で固定 default / options から clamp している（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:71`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:129`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:134`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:138`）。本タスクではこの default 解決だけを profile resolver 経由にする。
- 現在の cadence default は `DEFAULT_TARGET_INFERENCE_FPS`、`DEFAULT_TARGET_POSE_INFERENCE_FPS`、`DEFAULT_TARGET_HAND_INFERENCE_FPS`、`DEFAULT_TARGET_FACE_ROI_INFERENCE_FPS` に固定されている（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:6`）。profile 追加後も export は互換のため残す。
- `TrackerRuntimePoseOptions` は現在 `enabled`、`targetInferenceFps`、`ignorePerformanceFallback`、`hand.targetInferenceFps`、`faceRoi.targetInferenceFps` だけを持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:36`）。ここへ additive に field を増やす。
- motion-debug camera constraints は現在 1280x720 / facingMode user に固定されている（`sincromisor-frontend/src/pages/motionDebug/motionDebugCameraStream.ts:3`）。ここを profile 由来 constraints factory へ切り出す。
- `MotionDebugApp.startRuntimeWithStream()` は `trackerRuntime.startFaceTracking()` に固定 `POSE_TARGET_INFERENCE_FPS` と options を渡している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:480`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:493`）。ここに profile を渡す。
- motion-debug window API は `startCamera()`、`loadVideoFixture()`、`calculateReplayMetrics()` を公開している（`sincromisor-frontend/src/pages/motionDebug/types.ts:238`）。`startCamera(options?)` の additive 拡張で対応し、既存引数なし呼び出しは維持する。
- recording manifest は `MotionDebugRecordingController.createManifest()` が source / camera / pipeline 情報を作る（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:101`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:194`）。active profile はここに入れる。
- Phase 10 の要求は roadmap に明記されている（`documents/research/character_animation/roadmap.md:493`）。設計文書側では tracker runtime と motion-debug の責務が `documents/design/frontend/character/tracking.md:65` 以降、metrics / replay が `documents/design/frontend/character/motion.md:83` 以降にある。

## テスト

- `cd sincromisor-frontend && npm run test -- trackerRuntimePerformanceProfile`
- `cd sincromisor-frontend && npm run test -- motionDebugCameraStream`
- `cd sincromisor-frontend && npm run test -- motionDebugRecordingController`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer-visible な runtime profile、motion-debug window API、recording manifest、debug snapshot の公開挙動が増えるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に profile v1 schema、profile 別 default、debug log 粒度、後続 degradation policy との責務分界を同期する。
