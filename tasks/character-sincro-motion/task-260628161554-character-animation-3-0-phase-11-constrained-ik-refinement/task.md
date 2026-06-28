# character animation 3.0 phase 11 constrained ik refinement

## 背景 / 目的

Phase 11 の候補には「IK 初期解に対する数回の軽量 constrained optimization」が含まれる（`documents/research/character_animation/roadmap.md:520`）。ただし roadmap は IK を中核ではなく後段の姿勢適用器とし、品質の大部分は reliability / canonical / temporal / avatar profile で決める方針である（`documents/research/character_animation/roadmap.md:102`、`documents/research/character_animation/roadmap.md:111`）。

このタスクでは learned model ではなく、既存 `SincroArmIkSolver` 内で dev-only / opt-in の bounded target refinement を追加する。既定の `solve()` 挙動は変えず、`solveRefined()` が小さな候補集合から既存 constraint cost の低い解を選ぶところまでを扱う。

依存:

- `task-260628161551-character-animation-3-0-phase-11-replay-failure-mining`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/ik/sincroArmIkRefinement.ts` を追加し、`SincroArmIkRefinementConfig`、`SincroArmIkRefinementCandidate`、`SincroArmIkRefinementResult`、`createDefaultSincroArmIkRefinementConfig()` を export する。
- [ ] `SincroArmIkRefinementConfig` は `{ enabled: boolean; maxCandidates: 5; reachScales: readonly number[]; elevationOffsetsRad: readonly number[]; depthScales: readonly number[]; maxTargetDeltaRatio: number }` に固定する。default は `enabled: false`、`reachScales: [1, 0.97, 0.94]`、`elevationOffsetsRad: [0, -0.035]`、`depthScales: [1, 0.9]`、`maxTargetDeltaRatio: 0.08` とし、候補生成時は deterministic order で先頭 5 件だけを評価する。
- [ ] `SincroArmIkSolver` に `solveRefined(target: SincroArmIkTarget, config?: Partial<SincroArmIkRefinementConfig>): SincroArmIkSolveResult | undefined` を追加する。既存 `solve(target)` の public signature と既定挙動は変更しない。
- [ ] `solveRefined()` は `config.enabled !== true` の場合、既存 `solve(target)` と同じ result を返す。refinement disabled のときは `constraint.reasonCodes` や weight に refinement 専用 reason を追加しない。
- [ ] refinement enabled の候補は original target と、reach / elevation / depth の小変化だけに限定する。candidate wrist は original wrist からの距離が `maxTargetDeltaRatio * (upperArmLength + lowerArmLength)` を超える場合に破棄する。肘 pole、temporal state、wrist roll influence、target weight は original target の値をそのまま使う。
- [ ] candidate wrist 生成式は次に固定する。original wrist を `o = (x, y, z)`、`zDepth = z * depthScale`、`horizontal = sqrt(x*x + zDepth*zDepth)`、`radius = sqrt(horizontal*horizontal + y*y)`、`elevation = atan2(y, horizontal) + elevationOffsetRad` とする。`horizontal > 1e-6` の場合は `horizontalAfter = radius * cos(elevation)`、`wristBeforeReach = (x * horizontalAfter / horizontal, radius * sin(elevation), zDepth * horizontalAfter / horizontal)` とする。`horizontal <= 1e-6` の場合は `wristBeforeReach = (0, radius * sin(elevation), 0)` とする。最終 candidate wrist は `wristBeforeReach.multiplyScalar(reachScale)` とする。reach scale は depth scale と elevation offset 適用後に最後に掛ける。
- [ ] candidate index order は固定する。index `0` は常に original `{ reachScale: 1, elevationOffsetRad: 0, depthScale: 1 }` とする。その後、`reachScales` の配列順を outer loop、`elevationOffsetsRad` の配列順を middle loop、`depthScales` の配列順を inner loop として直積を列挙し、original と同じ tuple は重複除外する。`maxCandidates` は original を含む総数に適用し、default では index `0..4` だけを評価する。
- [ ] candidate evaluation は既存 `prepareTarget()`、`solveLocalQuaternions()`、`buildConstraintResult()` と同じ constraint / collision / pole / limit logic を使う。評価中に `lastPoleDirection` を更新せず、選ばれた candidate の pole direction だけを最後に commit する。
- [ ] cost は次の deterministic sum に固定する。`targetClamp.clamped ? 3 : 0`、`constraint.reasonCodes` に `pole_flip_rejected` があれば `4`、`pole_uncertain_downweighted` があれば `1.5`、`constraint.collisionAvoided === true` なら `2`、upper/lower limited quaternion の `limited` 件数ごとに `1`、original target からの normalized delta を `0.5 * deltaRatio`。同点は先に生成された candidate を採用する。
- [ ] 選ばれた candidate が original ではない場合、返却 `constraint.reasonCodes` に `phase11_ik_refined` を追加し、`SincroArmIkSolveResult` に optional `refinement?: SincroArmIkRefinementResult` を追加する。original が選ばれた場合も enabled なら `refinement` を返し、`selectedCandidateIndex: 0`、`applied: false` とする。
- [ ] `SincroArmIkRefinementResult` は JSON 保存可能な plain object に限定し、`candidateCount`、`selectedCandidateIndex`、`applied`、`selectedCost`、`originalCost`、`candidates: Array<{ index; reachScale; elevationOffsetRad; depthScale; cost; rejected; rejectReason?: "target_delta_exceeded" | "unusable_direction" }>` を持つ。
- [ ] 本タスクでは motion-debug UI toggle と production runtime 接続は追加しない。unit test から `solveRefined()` を直接呼ぶだけに留める。
- [ ] `sincromisor-frontend/src/character/ik/__tests__/sincroArmIkRefinement.test.ts` を追加し、disabled equals solve、candidate delta limit rejection、lower cost candidate selection、tie keeps original、lastPoleDirection commit が選択 candidate だけで起きること、result が JSON serializable であることを検証する。
- [ ] `documents/design/frontend/character/motion.md` に Phase 11 constrained IK refinement の dev-only / opt-in 方針、候補生成、cost、既定 disabled、本番接続を別タスクに残す判断を同期する。

## 設計判断（着手前に確定済み）

- refinement は `src/character/ik/` に置く。IK target と solver constraint の局所改善であり、canonical / temporal / post-processing contract の補正ではないため。
- `solve()` は変更せず、`solveRefined()` を opt-in API とする。既存 runtime の姿勢を暗黙に変えると Phase 11 の replay / metrics 比較が難しくなるため。
- 最適化は gradient / iterative numeric optimizer ではなく、固定候補集合からの deterministic selection にする。ブラウザごとの浮動小数差、処理時間増、debug 再現性低下を抑えるため。
- wrist 生成は shoulder-relative target vector の `y` を上下、`z` を depth として扱い、depth scale、elevation offset、reach scale の順に適用する。既存 solver が target vector をそのまま肩相対入力として扱うため、avatar profile や camera 座標への再変換は入れない。
- cost は既存 constraint reason と limited quaternion を使う。新しい人体モデルや avatar profile inference は導入しない。
- `lastPoleDirection` は評価中に更新しない。candidate を複数試す過程で solver state が汚れると同じ入力の再現性が崩れるため、選択後に 1 回だけ commit する。
- 外部境界はない。network、Worker、ML runtime、WebRTC / backend 契約は変更しない。

## スコープ境界

- 本タスクでやること:
    - bounded IK target refinement の型 / helper / solver opt-in API。
    - deterministic cost と unit test。
    - result debug snapshot の plain object 化。
    - design doc 同期。
- 本タスクでやらないこと:
    - production runtime で refinement を有効化すること。
    - motion-debug UI toggle / recording slot への接続。
    - learned model や TCN / MLP。
    - avatar profile 自動更新。
    - canonical / temporal / intent の補正。
- 依存タスクとの境界:
    - replay failure mining task は IK refinement candidate を分類する。本タスクはその report を読まず、IK solver の opt-in refinement API だけを提供する。

## 実装方針（既存コード整合: file:line）

- `SincroArmIkSolver` の default options は reach clamp、overhead reach、pole flip threshold を既に持つ（`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:75`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:82`）。refinement はこの constraint を置き換えず候補評価に再利用する。
- 既存 `solve(target)` は unusable target を `undefined` にし、最後に `lastPoleDirection` を更新して result を返す（`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:159`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:185`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:187`）。`solveRefined()` は同じ result shape を保つ。
- `prepareTarget()` は target constraint、collision、reach clamp、pole resolve、elbow position をまとめている（`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:198`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:203`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:212`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:224`）。candidate evaluation はここを再利用し、別の IK 幾何を作らない。
- `solveLocalQuaternions()` は existing bind direction と neutral quaternion から limited local quaternion を作る（`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:246`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:251`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:255`）。cost はこの limited 情報を読む。
- roadmap は IK 単体の高度化ではなく IK 前後の contract を重視している（`documents/research/character_animation/roadmap.md:102`、`documents/research/character_animation/roadmap.md:111`）。本タスクも opt-in local refinement に閉じ、本番 motion policy は変えない。

## テスト

- `cd sincromisor-frontend && npm run test -- sincroArmIkRefinement`
- `cd sincromisor-frontend && npm run test -- sincroArmIkSolver`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な IK solver API と Phase 11 optimization 方針が増えるため、`documents/design/frontend/character/motion.md` に constrained IK refinement v1 の責務、既定 disabled、cost、production 未接続を同期する。
