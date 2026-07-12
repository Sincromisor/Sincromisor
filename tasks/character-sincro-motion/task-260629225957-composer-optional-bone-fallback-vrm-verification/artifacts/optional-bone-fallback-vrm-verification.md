# Optional Bone Fallback VRM Verification

## Summary

- Date: 2026-06-30
- Scope: `composeVrmPose()` optional bone fallback / production dry-run visibility.
- Production runtime changes: none.
- VRM assets added: none.
- Screenshots: none. This task verified profile capability and dry-run data paths; visual rendering and `setNormalizedPose()` application remain outside scope because production dry-run is observe-only.

## Verification Inputs

| Input                                      | Source                                                                                                                                                                                                | Capability class     | Method                                               | Result |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------- | ------ |
| `default.vrm`                              | `sincromisor-frontend/public/characters/default.vrm`                                                                                                                                                  | full upper body      | GLB `VRMC_vrm.humanoid.humanBones` inspection        | PASS   |
| `aoi-1.0.7.vrm`                            | `sincromisor-frontend/public/characters/aoi-1.0.7.vrm`                                                                                                                                                | full upper body      | GLB `VRMC_vrm.humanoid.humanBones` inspection        | PASS   |
| synthetic missing upperChest profile       | `src/character/vrmPose/__tests__/vrmPoseTorsoFallback.test.ts`                                                                                                                                        | missing upperChest   | `composeVrmPose()` unit test                         | PASS   |
| synthetic missing shoulder profile         | `src/character/vrmPose/__tests__/vrmPoseComposer.test.ts` and `src/character/runtime/__tests__/sincroVrmPoseComposerDryRun.test.ts`                                                                   | missing shoulder     | `composeVrmPose()` and production dry-run unit tests | PASS   |
| synthetic reduced finger / hand capability | `src/character/vrmPose/__tests__/vrmPoseComposer.test.ts`, `src/character/vrmPose/__tests__/vrmPoseComposerSemantic.test.ts`, and `src/character/avatarProfile/__tests__/avatarMotionProfile.test.ts` | reduced finger chain | `composeVrmPose()` and profile unit tests            | PASS   |

## Real VRM Profile Capability

The repository assets were inspected without adding new VRM files. Both existing assets expose all optional bones needed by the composer, so missing-bone cases are covered by synthetic profiles rather than real repository VRM assets.

| Asset           | VRM extension | Model name                     | Human bone count | Optional bone capability                                                                     | Warnings                       |
| --------------- | ------------- | ------------------------------ | ---------------: | -------------------------------------------------------------------------------------------- | ------------------------------ |
| `default.vrm`   | `VRMC_vrm`    | `VRM1_Constraint_Twist_Sample` |               54 | `upperChest`, shoulders, hands, thumb proximal, and index proximal are present on both sides | none from extension inspection |
| `aoi-1.0.7.vrm` | `VRMC_vrm`    | `aoi`                          |               54 | `upperChest`, shoulders, hands, thumb proximal, and index proximal are present on both sides | none from extension inspection |

Observed optional bone flags for both assets:

```json
{
    "upperChest": true,
    "leftShoulder": true,
    "rightShoulder": true,
    "leftHand": true,
    "rightHand": true,
    "leftThumbProximal": true,
    "rightThumbProximal": true,
    "leftIndexProximal": true,
    "rightIndexProximal": true
}
```

## Dry-Run And Fallback Results

| Capability class            | Profile source                                                                              | Dry-run / composer observation                                                                                                                                                                                                | Warning / suppression visibility                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full upper body             | `COMPLETE_PROFILE`, plus real `default.vrm` and `aoi-1.0.7.vrm` capability inspection       | `SincroVrmPoseComposerDryRunService` returns `status: "available"` for an active retarget frame and keeps fallback/tracking layers only. `composeVrmPose()` can output torso and arm bones without optional bone suppression. | No missing optional bone suppression is expected for these assets.                                                                                                                 |
| missing upperChest          | synthetic `MinimalAvatarMotionProfile` with `optionalBones.upperChest = false`              | `composeVrmPose()` leaves `finalPose.upperChest` undefined while preserving available torso output such as `finalPose.spine`.                                                                                                 | `suppressedLayers` contains `{ id: "torso", kind: "tracking", bone: "upperChest", reason: "missing_optional_bone" }`.                                                              |
| missing shoulder            | synthetic `MinimalAvatarMotionProfile` with `optionalBones.leftShoulder = false`            | `composeVrmPose()` leaves `finalPose.leftShoulder` undefined. The source shoulder quaternion is damped by `solverDefaults.shoulderDamping` and written to `finalPose.leftUpperArm`.                                           | `suppressedLayers` contains the source shoulder with `reason: "missing_optional_bone"`. Production dry-run also preserves profile warning strings such as `missing_left_shoulder`. |
| reduced finger / hand chain | synthetic profiles with missing `leftHand`, `leftIndexProximal`, or `leftIndexIntermediate` | `composeVrmPose()` leaves missing hand/finger final pose entries undefined. `createAvatarMotionProfile()` marks chain gaps per side/finger.                                                                                   | Missing hand/finger writes are reported as `missing_optional_bone`; profile warnings include codes such as `missing_leftIndexIntermediate`.                                        |

## Acceptance Mapping

- Artifact created: this file.
- At least three capability classes: full upper body, missing upperChest, missing shoulder, and reduced finger chain were verified.
- Missing optional bone final pose: verified by unit tests that missing `upperChest`, `leftShoulder`, `leftHand`, and `leftIndexProximal` do not appear in `finalPose`.
- `suppressedLayers.reason = "missing_optional_bone"`: verified for missing upperChest, missing shoulder, and missing hand/finger writes.
- Missing shoulder fallback: verified separately from the missing source shoulder. `finalPose.leftShoulder` stays absent, while `finalPose.leftUpperArm` receives the damped quaternion.
- VRM asset policy: no model asset was added; existing assets only confirmed the full upper body class.
- Production runtime policy: no production runtime code was changed.

## Checks

Executed task checks:

- `npm run test -- vrmPoseComposer`: PASS, 3 files / 15 tests.
- `npm run test -- avatarMotionProfile`: PASS, 2 files / 12 tests.
- `npm run check`: PASS.
- `npm run tasks:check`: PASS, 231 tasks.
- `npm run gate`: PASS, lint / build / test. Full frontend test gate passed with 55 files / 420 tests.

## Residual Risk

- The repository VRM assets both represent the full upper body capability class. Missing upperChest, missing shoulder, and reduced finger chain were not found in real committed VRM assets and are therefore covered by synthetic profiles and unit tests.
- No screenshot was captured because the task verifies observe-only dry-run data and composer output, not live visual application. Visual confirmation remains required before enabling full `vrm.humanoid.setNormalizedPose(finalPose)` ownership.
- Reduced finger chain coverage confirms profile detection and missing final pose suppression for representative proximal/intermediate gaps; it does not validate every VRM authoring tool's finger omission pattern.
