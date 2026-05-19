# ADR-260517-sincro-arm-ik-solver-adoption

## Status

- Accepted

## Context

- Sincromisor の pose retarget は `@pixiv/three-vrm` の normalized bones を主な適用先にしている。
- `SincroArmIkSolver` は normalized arm chain の neutral quaternion、腕長、肩幅をロード時に測定し、MediaPipe world target を肩相対の two-bone IK として解く。
- Three.js 公式 addon の `CCDIKSolver` は `SkinnedMesh.skeleton.bones` の index ベースで、target / effector / links を raw skeleton 上の bone index として渡す。
- 将来の full-body IK や複数 effector では、CCD / FABRIK / damped least squares 系 solver の再評価余地がある。

## Decision

- 本流の腕 IK は、自前 3D two-bone IK + `@pixiv/three-vrm` normalized bone 適用を維持する。
- 肩・肘・前腕の joint constraint と head / chest no-go zone は、既存 `SincroArmIkSolver` の軽量 safety として追加する。
- `CCDIKSolver` は production path へ入れず、左腕 raw skeleton chain の互換性を確認する PoC 診断として残す。
- Debug Console では `CCDIK PoC` として、raw chain 検出、normalized bone と skeleton の分離、one-iteration smoke test の状態を表示する。
- `closed-chain-ik-js` は現時点では導入しない。full-body / multi-effector / 接地拘束が必要になった時に、worker 化と pose bridge の設計を先に切る。
- Kalidokit は deprecated リスクがあるため、中核 dependency ではなく retarget の入出力設計の参考に留める。

## Options Considered

| 選択肢                 | 利点                                                                                                                                                   | 欠点                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 自前 3D two-bone IK    | normalized bones へ直接適用できる。肩相対 target、pole、clamp、Debug Console 表示を Sincromisor の語彙で説明しやすい。bundle / dependency 追加が不要。 | full-body や複数 effector へ広げる場合は solver を増やす必要がある。                                                                                                     |
| Three.js `CCDIKSolver` | Three.js 公式 addon で、raw `SkinnedMesh` chain には smoke test 可能。CCD の挙動を既存 dependency だけで試せる。                                       | normalized bone を直接扱えない。target も skeleton bone index が必要で、一時 target bone または専用 bridge が必要。raw で解いた結果を normalized pose へ戻す設計が重い。 |
| `closed-chain-ik-js`   | damped least squares により full-body、複数 effector、閉ループ拘束を扱いやすい可能性がある。                                                           | dependency 追加、bundle size、worker 化、VRM normalized/raw bridge の設計コストが高い。片腕 IK には過剰。                                                                |
| Kalidokit              | VRM 向け retarget の軸や出力形式を読む参考になる。                                                                                                     | deprecated であり、中核採用すると保守リスクが高い。                                                                                                                      |

## Consequences

- 現行の `SincroPoseRetargeter` は confidence gate、mode selection、target scale、smoothing に集中し、IK の数学は `SincroArmIkSolver` に閉じ込める。
- `SincroArmIkSolver` は腕単体の人体的 constraint と簡易 no-go zone までを担当する。MediaPipe target の時系列 stabilizer、mesh 精密 collision、full-body IK は別判断とする。
- `CCDIKSolver` PoC はロード時診断に限定するため、通常フレーム更新の姿勢結果を変更しない。
- 外部 solver を本番導入する場合は、raw skeleton で解くか、normalized pose へ橋渡しするかを先に ADR 化する。
- dependency 追加は発生しない。`CCDIKSolver` は既存 `three` package の examples addon を利用する。

## Review Conditions

- 腕以外の IK、足接地、両手同時拘束、手と視線の複数 effector など、two-bone solver だけでは制御が破綻する。
- raw skeleton で解いた pose を normalized bones へ安定して戻す bridge が実装できた。
- `closed-chain-ik-js` または別 solver を worker 上で小さく運用でき、bundle / latency / Debug Console の説明可能性が許容できる。
- MediaPipe world target の安定性が上がり、Z 方向や全身 target を強く使えるようになった。

## References

- `documents/tasks/character_sincro_motion/done/TASK-260517024506-sincro-ik-solver-comparison-and-adoption.md`
- `documents/tasks/character_sincro_motion/done/TASK-260517024505-sincro-vrm-3d-two-bone-ik-solver.md`
- `documents/design/frontend/character/motion.md`
- `sincromisor-frontend/src/ts/sincroVrm/vrmCharacter/sincroArmIkSolver.ts`
- `sincromisor-frontend/src/ts/sincroVrm/vrmCharacter/sincroCcdIkProbe.ts`
