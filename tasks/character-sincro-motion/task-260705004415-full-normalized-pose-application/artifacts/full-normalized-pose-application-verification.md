# Full Normalized Pose Application Verification

## Scope

This artifact records the implementation-side verification for
`task-260705004415-full-normalized-pose-application`.

The production switch is `fullNormalizedPoseApplicationMode: "off" | "upper_body"`.
Default `"off"` keeps the staged arm / torso / shoulder / semantic / finger application path.
`"upper_body"` applies the current frame's available composer `finalPose` through
`vrm.humanoid.setNormalizedPose(finalPose)` once from `VRMCharacterManager.update()`.
The applied `VRMPose` always includes every full-owned upper body / finger bone. Missing
`finalPose` entries are written as identity rotation so previous full-application finger poses
cannot survive a later semantic/finger gap.

## Dependency Exit Criteria

| dependency                                                           | status | evidence                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task-260705004410-semantic-finger-production-application`           | PASS   | `meta.yaml` is `status: done`, `verdict: PASS`; `eval.md` confirms semantic/finger valid snapshot gating, conflict suppression, reduced chain conflict 0, docs sync, and gate PASS.            |
| `task-260629225907-sincro-runtime-motion-ownership-map`              | PASS   | `eval.md` is PASS and the ownership map artifact exists. This attempt updates the artifact with full application row 8.5 and rollback notes.                                                   |
| `task-260629225957-composer-optional-bone-fallback-vrm-verification` | PASS   | `eval.md` is PASS and records full upper body, missing upperChest, missing shoulder, and reduced finger/hand chain verification with synthetic fallback where real VRM assets are unavailable. |

## Runtime Boundary Matrix

| condition                                                                                 | expected result                                                                                                 | implementation verification                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mode `off`                                                                                | `setNormalizedPose(finalPose)` is not called; staged application path remains active.                           | Unit test `applies available finalPose once without using setNormalizedPose in off mode`.                                                                                                                  |
| mode `upper_body` with current available result                                           | `setNormalizedPose(finalPose)` is called once; direct arm and torso/shoulder writers are skipped in that frame. | Unit test `skips direct upper body controllers when full finalPose applies`.                                                                                                                               |
| available result missing semantic / finger bones                                          | full-owned missing bones are explicitly written as identity rotation.                                           | Unit test `writes identity for missing full-owned finger bones on available frames`.                                                                                                                       |
| mode `upper_body` with `not_ready` / `invalid_input` / `missing_profile` / result missing | stale finalPose is not promoted; staged application path runs and rollback reason is shown.                     | Unit test `does not promote stale finalPose when the current dry-run frame is unavailable`; unit test `rolls back to staged application when full finalPose is unavailable`.                               |
| rollback after a previous full application                                                | previous full-owned upper body / finger bones are cleared before staged writers run.                            | Unit test `clears previous full-owned finger pose before unavailable rollback`; unit test `clears previous full application before staged rollback writers run`.                                           |
| head / neck / leg / expression                                                            | not composer-owned by full application.                                                                         | Full helper only passes composer `finalPose`; dry-run finalPose contract excludes expression/root and manager still calls face/eye/mouth/emotion and leg controllers. Ownership map records non-ownership. |
| mode change                                                                               | dry-run previous final pose and finger previous hold are reset.                                                 | Unit test `resets production dry-run previous final pose when full normalized pose mode changes`.                                                                                                          |
| Debug Console visibility                                                                  | mode is visible in pose retarget composer controls; rollback reason is visible in composer dry-run summary.     | Unit test `applies full normalized pose mode separately from staged composer modes`; formatter shows `full <mode> applied` or `full <mode> rollback <reason>`.                                             |

## Metrics / Replay

| fixture / metric set                                                                                                                 | status          | reason                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 motion metrics (`neutral-10s`, `single-arm-slow-raise`, `both-arms-slow-raise`, `hand-out-and-return`, `arms-cross`, `fast-wave`) | `not_available` | No captured replay logs are present in this implementation worktree. The result is not treated as pass.                                                                                            |
| composer comparison metrics                                                                                                          | `not_available` | No replay input with full application enabled is present in this implementation worktree. The parser was updated to accept optional full-application metadata without requiring it for older logs. |
| full finalPose replay                                                                                                                | `not_available` | Browser/motion-debug replay was not run in this sandboxed implementation phase.                                                                                                                    |

`not_available` entries above are excluded from automated gate interpretation because the required artifacts are absent, not because the metrics passed. The remaining automated coverage is unit/static verification plus `npm run gate`.

## Visual / Manual Verification

| scenario                       | status          | reason                                                                                                                 |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `default.vrm` visual check     | `not_available` | No browser/camera visual session was run in the implementation worktree.                                               |
| `aoi-1.0.7.vrm` visual check   | `not_available` | No browser/camera visual session was run in the implementation worktree.                                               |
| missing bone synthetic profile | `available`     | Covered by prior optional-bone fallback PASS dependency and current full-application rollback/static ownership checks. |
| camera degradation / recovery  | `not_available` | No live camera session was run in the implementation worktree.                                                         |
| chat / sincro mode switch      | `not_available` | No browser interaction session was run in the implementation worktree.                                                 |

## Verification Commands

- `npm run test -- src/character/vrmCharacter/__tests__/armBoneController.test.ts src/features/debug/model/__tests__/debugConsoleSincroMotionControls.test.ts`: PASS, 2 files / 23 tests.
- `npm run gate`: recorded in `impl.md` after final execution.
