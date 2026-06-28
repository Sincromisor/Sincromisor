# Evaluation: task-260628161554-character-animation-3-0-phase-11-constrained-ik-refinement

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `sincroArmIkRefinement.ts` の追加と export — `SincroArmIkRefinementConfig` / `Candidate` / `Result` / default helper が追加され、solver barrel からも再 export されている（commit `9ae1a0f`、`sincromisor-frontend/src/character/ik/sincroArmIkRefinement.ts:4`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:40`）。
- [✓] default config と candidate 上限 — `enabled: false`、`maxCandidates: 5`、`reachScales: [1, 0.97, 0.94]`、`elevationOffsetsRad: [0, -0.035]`、`depthScales: [1, 0.9]`、`maxTargetDeltaRatio: 0.08` に一致する（`sincroArmIkRefinement.ts:48`）。
- [✓] `solve(target)` の signature/default behavior 維持と `solveRefined()` 追加 — `solve()` は既存 signature のまま `evaluateTarget()` 経由に整理され、`solveRefined(target, config?: Partial<...>)` が追加されている（`sincroArmIkSolver.ts:185`、`sincroArmIkSolver.ts:201`）。
- [✓] disabled は `solve()` と同じ result — `config.enabled !== true` で `this.solve(target)` に委譲し、refinement result / `phase11_ik_refined` を追加しない。unit test でも `toEqual(plain)` を確認している（`sincroArmIkSolver.ts:209`、`sincroArmIkRefinement.test.ts:77`）。
- [✓] candidate 生成式、順序、maxCandidates、delta rejection — index `0` は original、reach outer / elevation middle / depth inner、original 重複除外、総数上限適用、指定式どおり depth scale -> elevation offset -> reach scale の順で wrist を生成し、delta 超過候補を reject する（`sincroArmIkRefinement.ts:63`、`sincroArmIkRefinement.ts:73`、`sincroArmIkRefinement.ts:122`、`sincroArmIkSolver.ts:324`）。unit test で default index `0..4` の tuple と delta rejection を確認している（`sincroArmIkRefinement.test.ts:87`、`sincroArmIkRefinement.test.ts:110`）。
- [✓] candidate 評価の既存 solver logic 再利用と state commit — `evaluateRefinementCandidate()` は original target を spread し wrist だけを candidate に差し替え、`evaluateTarget()` 経由で既存 prepare / quaternion / constraint logic を使う。評価中に `lastPoleDirection` は更新されず、選択後に `commitPoleDirection(selected...)` だけを呼ぶ（`sincroArmIkSolver.ts:215`、`sincroArmIkSolver.ts:283`、`sincroArmIkSolver.ts:319`、`sincroArmIkSolver.ts:225`）。
- [✓] cost formula と tie break — clamp 3、`pole_flip_rejected` 4、`pole_uncertain_downweighted` 1.5、`collisionAvoided === true` 2、upper/lower limited 各 1、`0.5 * deltaRatio` に一致する。同点は `<` 比較のみで先行 candidate を保持する（`sincroArmIkSolver.ts:461`、`sincroArmIkSolver.ts:474`）。
- [✓] refinement result と reason code — non-original 選択時のみ `phase11_ik_refined` を追加し、original 選択時も enabled なら `refinement` を返して `applied: false` になる。plain object shape は指定フィールドに一致し、JSON round-trip test がある（`sincroArmIkSolver.ts:489`、`sincroArmIkRefinement.ts:99`、`sincroArmIkRefinement.test.ts:130`、`sincroArmIkRefinement.test.ts:147`、`sincroArmIkRefinement.test.ts:180`）。
- [✓] production runtime / motion-debug UI toggle 未追加 — `rg "solveRefined|SincroArmIkRefinement|phase11_ik_refined"` で利用は IK 実装、unit test、design doc のみ。runtime page / app / feature への接続はない。
- [✓] unit test 追加 — `sincroArmIkRefinement.test.ts` が disabled equals solve、candidate order、delta rejection、lower cost selection、tie keeps original、lastPoleDirection commit、JSON serializable を検証している（7 tests）。
- [✓] design doc 同期 — `documents/design/frontend/character/motion.md` に dev-only / opt-in、候補生成、cost、既定 `solve()` 非変更、production / motion-debug 接続を後続 task に残す判断が同期されている（`motion.md:65`）。

## テスト結果

- `npm run gate`（評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-9ae1a0fa7a8e-0rYZxx`、commit `9ae1a0f`、clean）: PASS。
    - `gate:lint` CACHE HIT: frontend lint/format and Markdown check passed。
    - `gate:build` CACHE HIT: frontend type check and build passed。
    - `gate:test` CACHE HIT: frontend tests passed、392 tests passed。
- `cd sincromisor-frontend && npm run test -- sincroArmIkRefinement`: PASS、1 file / 7 tests passed。
- カバレッジ評価: task.md が要求する unit test 観点は追加テストで一通り押さえられている。`lastPoleDirection` については test に加え、コード確認で candidate evaluation 中に commit が無く、選択後だけ commit されることを確認した。

## ドキュメント整合性

- 公開 WebRTC / backend 契約、runtime UI、production motion path の変更はない。
- developer-visible な IK solver API と Phase 11 方針は `documents/design/frontend/character/motion.md` に同期済み。生成物の再生成対象はなし。

## 残課題（FAIL の場合）

- なし。

## 残リスク / 補足

- 実ブラウザ runtime、motion-debug UI、recording / replay slot の手動確認は未実行。ただし本タスクは production runtime / UI 未接続が受け入れ条件のため、PASS 判定の阻害要因ではない。
- 評価用の追加 acceptance file は作成していない。
