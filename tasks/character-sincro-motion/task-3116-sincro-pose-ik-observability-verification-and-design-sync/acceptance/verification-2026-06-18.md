# Verification 2026-06-18

Note: screenshot PNG artifacts were used for local visual verification but are intentionally local-only and not committed, because they include the operator's room.

## Automated Checks

- [x] `cd sincromisor-frontend && npm run build`
- [x] `simple-vrm` desktop viewport `1280x720` screenshot
- [x] `simple-vrm` mobile viewport `390x844` screenshot
- [x] `motion-debug` desktop viewport `1280x720` screenshot
- [x] `motion-debug` mobile viewport `390x844` screenshot
- [x] `motion-debug` `window.__SINCRO_MOTION_DEBUG__` API presence
- [x] `motion-debug` camera start attempted with Playwright camera permission

## Results

- `simple-vrm`: VRM load reached browser console as `VRM file loaded.`; no horizontal overflow at either viewport.
- `simple-vrm`: `/api/v1/RTCSignalingServer/config.json` returned 404 because the backend was not running. This is outside the IK/UI verification scope.
- `motion-debug`: no console errors or warnings on initial desktop load; no horizontal overflow at either viewport.
- `motion-debug`: debug API keys were present: `startCamera`, `stopCamera`, `setRetargetConfig`, `getSnapshot`, `captureFrame`, `waitForPoseDetected`, `loadVideoFixture`.
- `motion-debug`: `startCamera()` timed out after 12000ms even after Playwright camera permission was granted, so `waitForPoseDetected()` could not be meaningfully evaluated.

## Blocking Items For PASS

- [x] Real-camera checks for low wrist confidence, one hand raised, arms spread, elbow bend, one arm missing, both arms missing, and close upper-body framing.
- [x] Multiple VRM checks. `sincromisor-frontend/public/characters/aoi-1.0.7.vrm` was loaded in `motion-debug` and checked with camera / tracker / IK active.
- [x] Short-window visual judgment that no arm flip, deep shoulder penetration, persistent wrist roll jitter, or stuck T-pose behavior occurs.
- [x] Independent `impl-evaluator` review completed with `NEEDS_REVISION`; follow-up evidence and decision were recorded.
- [x] Single-arm missing PARTIAL accepted. The operator visually confirmed the left side was off-frame, while MediaPipe retained the elbow as inferred `strong`; wrist `lost / out_of_frame` with `usableForIk=false` is accepted as sufficient.
- [ ] Full `npm run gate`; currently blocked by Markdown formatting warnings outside the task-local changed files.

## Adopted Defaults

No runtime default was changed in this run. The current adopted values remain:

- `armIkMode`: `world_3d_ik`
- `armIkStrength`: `1.0`
- `armIkTargetScale`: `1.0`
- `smoothingMs`: `155`
- `minConfidence`: `0.45`
- `returnToNeutralMs`: `520`

## Camera Retry

After `aoi-1.0.7.vrm` was added, `motion-debug` camera startup was retried with Playwright camera permission.

- `startCamera()`: PASS
- Camera state: `source=camera`, `width=1280`, `height=720`, `readyState=4`
- Tracker state: `mode=worker`, `status=running`
- `waitForPoseDetected(5000)`: FAIL, `Pose was not detected within 5000ms.`
- Runtime fallback: `pose_lost`
- Screenshot: `artifacts/motion-debug-camera-running-2026-06-18.png`

At this point in the run, the previous camera timeout blocker was resolved. Pose-detection framing and the required pose-pattern / multi-VRM visual checks were still pending.

## Pose Detection Retry

After the operator adjusted the camera framing, `motion-debug` pose detection was retried with up to ten `waitForPoseDetected(6000)` attempts.

- Result: PASS on attempt 1
- Camera state: `source=camera`, `width=1280`, `height=720`, `readyState=4`
- Tracker state: `mode=worker`, `status=running`
- Pose: `detected=true`, `confidence=0.9996`
- Runtime: `poseRetargetRuntime.active=true`, `ikMode=world_3d_ik`
- Anchor: `hips_fallback_to_shoulders`
- Left arm: `arm_not_tracked` because left elbow / wrist targets were not usable.
- Right arm: `ikActive=true`, `ikSolverMode=world_3d_ik`, `ikWeight=0.2481`, `fallbackReason=joint_limited`
- Screenshot: `artifacts/motion-debug-pose-detected-2026-06-18.png`
- Summary: `artifacts/pose-detected-summary-2026-06-18.json`

This satisfies the camera startup and basic pose-observability path. The full task still needs the required posture matrix and visual checks across both `default.vrm` and `aoi-1.0.7.vrm`.

## Both Hands Visible Retry

After the operator adjusted the framing so arms and hands were visible, `motion-debug` was retried with up to twelve `waitForPoseDetected(5000)` attempts. The first attempt produced usable wrist targets for both arms.

- Result: PASS on attempt 1
- Pose: `detected=true`, `confidence=0.9999`
- Left targets: shoulder / elbow / wrist all `strong`, wrist `usableForIk=true`
- Right targets: shoulder / elbow / wrist all `strong`, wrist `usableForIk=true`
- Runtime: `poseRetargetRuntime.active=true`, `ikMode=world_3d_ik`
- Left arm: `ikActive=true`, `ikWeight=0.9`, `ikSolverMode=world_3d_ik`, `fallbackReason=joint_limited`
- Right arm: `ikActive=true`, `ikWeight=0.9`, `ikSolverMode=world_3d_ik`, `fallbackReason=joint_limited`
- Screenshot: `artifacts/motion-debug-both-hands-detected-2026-06-18.png`
- Summary: `artifacts/both-hands-detected-summary-2026-06-18.json`

This covers the “both arms visible” baseline and confirms both wrist targets can drive `world_3d_ik`. The full task still needs the remaining posture matrix, jitter / flip observation over time, and `aoi-1.0.7.vrm` visual confirmation.

## Pose Pattern Matrix

The operator performed the required pose patterns in sequence while `motion-debug` captured runtime snapshots and screenshots.

| Pattern                     | Result   | Runtime Observation                                                                                                                                                                                                          | Artifact                                                |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Baseline both hands visible | PASS     | Both wrists `strong`; both arms `world_3d_ik`; `ikWeight=0.9`; `joint_limited`                                                                                                                                               | `artifacts/pattern-baseline-both-hands-2026-06-18.png`  |
| Low wrist confidence        | PASS     | Left wrist `weak / low_confidence`; `usableForIk=true`; left `ikWeight=0.6597`                                                                                                                                               | `artifacts/pattern-low-wrist-confidence-2026-06-18.png` |
| One hand raised             | PASS     | Raised hand clamped with `ik_target_clamped`; opposite arm `joint_limited`                                                                                                                                                   | `artifacts/pattern-one-hand-raised-2026-06-18.png`      |
| Arms spread                 | PASS     | Both wrists `strong`; both arms `world_3d_ik`; `joint_limited`                                                                                                                                                               | `artifacts/pattern-arms-spread-2026-06-18.png`          |
| Elbow bend                  | PASS     | Both wrists `strong`; `forearm_twist_limited` and `chest_no_go_zone` observed                                                                                                                                                | `artifacts/pattern-elbow-bend-2026-06-18.png`           |
| One arm missing             | ACCEPTED | Full single-arm loss was not reproduced; MediaPipe retained inferred targets. Later external Chrome evidence captured wrist `lost / out_of_frame`, and the operator accepted this as MediaPipe off-frame inference behavior. | `artifacts/pattern-one-arm-weak-target-2026-06-18.png`  |
| Both arms missing           | PASS     | Elbow / wrist targets became `lost / out_of_frame`; low-weight IK remained active from remaining world targets                                                                                                               | `artifacts/pattern-both-arms-missing-2026-06-18.png`    |
| Close upper body            | PASS     | Shoulders remained `strong`; elbow / wrist targets `lost / out_of_frame`; runtime fell back to `feature_only`                                                                                                                | `artifacts/pattern-close-upper-body-2026-06-18.png`     |

Summary: `artifacts/pose-pattern-matrix-summary-2026-06-18.json`

The pose matrix covers the required pattern set. The single-arm missing case is accepted as MediaPipe off-frame inference behavior after the external Chrome retry and operator decision.

## Aoi VRM Motion Debug Check

`motion-debug` was updated to accept `?vrm=/characters/<file>.vrm`, then reopened with `?vrm=/characters/aoi-1.0.7.vrm`.

- Visual load: PASS
- `startCamera()`: PASS
- `waitForPoseDetected(5000)`: PASS on attempt 1
- Initial runtime: both arms `ikActive=true`, `ikSolverMode=world_3d_ik`, `fallbackReason=joint_limited`
- 12 second sample:
    - 24 / 24 samples `pose.detected=true`
    - 24 / 24 samples runtime active
    - 24 / 24 samples left / right IK active
    - left / right wrist quality stayed `strong`
    - render FPS stayed around 60
- Screenshot: `artifacts/motion-debug-aoi-detected-2026-06-18.png`
- Summary: `artifacts/aoi-vrm-motion-debug-summary-2026-06-18.json`

This resolves the multi-VRM blocker for `default.vrm` + `aoi-1.0.7.vrm`. The later external Chrome retry and operator decision resolved the single-arm missing caveat.

## Aoi VRM Public Route Check

The same `aoi-1.0.7.vrm` check was repeated through the public route alias `/motion-debug/?vrm=/characters/aoi-1.0.7.vrm`.

- Visual route readiness: PASS
- Debug API presence: PASS
- `startCamera()`: PASS
- `waitForPoseDetected(5000)`: PASS on attempt 1
- Pose confidence: `0.9999481439590454`
- Left / right wrist quality: `strong`
- Runtime: `active=true`, `ikMode=world_3d_ik`
- Left / right arm IK: active
- Screenshot: `artifacts/motion-debug-aoi-public-route-detected-2026-06-18.png`
- Summary: `artifacts/aoi-vrm-public-route-summary-2026-06-18.json`

## External Chrome Single Arm Decision

The in-app Browser could not provide camera permission, so the check was repeated in external Chrome with the Codex extension.

- Camera startup: PASS
- Baseline pose: PASS, both wrists `strong`
- Single-arm missing retry:
    - Operator visual judgment: the left side was fully outside the camera frame.
    - Runtime: left wrist `lost / out_of_frame`, `usableForIk=false`.
    - Runtime: left elbow stayed `strong`, likely because MediaPipe retained an inferred elbow target near the visible body.
    - Opposite arm remained usable: right wrist `strong`.
- Accepted result: `ACCEPTED_WITH_MEDIAPIPE_INFERENCE`
- Summary: `artifacts/external-chrome-camera-summary-2026-06-18.json`

This resolves the single-arm missing blocker. The remaining blocker is full `npm run gate`, which is currently blocked by unrelated Markdown formatting warnings outside the task-local changed files.
