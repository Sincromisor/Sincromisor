# Review: task-260627234128-character-animation-3-0-phase-10-runtime-performance-profile

## 判定

APPROVED

前回 High 指摘の resolver 入力 contract / default profile と、debug snapshot の canonical path は task.md 上で固定された。改訂箇所から実装を止める新たな Critical / High の破綻は見当たらない。

## 指摘事項

- なし

## 実装者への申し送り

- `resolveTrackerRuntimePerformanceProfile(input?)` は `{ performanceProfileId?: string; performanceProfile?: unknown; defaultProfileId?: TrackerRuntimePerformanceProfileId }` を入力とし、通常 default は `standard-laptop`、motion-debug 呼び出し時だけ `defaultProfileId: "debug"` を渡す方針に従う。
- active profile の live snapshot 正本は `getSnapshot().camera.performanceProfile`、recording 正本は `manifest.pipeline.performanceProfile`。`tracker.budget` や frame metrics へ重複保存しない。
- motion-debug で `performanceProfileId` が指定された場合は、既存の固定 `POSE_TARGET_INFERENCE_FPS` override を使わず profile cadence を Pose fps に適用する。profile 未指定の debug 既定では `poseFps = 12` で現行挙動を維持する。
- `MotionDebugRecordingController` test では `manifest.pipeline.performanceProfile.schemaVersion` と active profile id の保存を直接 assert する。
