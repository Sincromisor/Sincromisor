# Evaluation: task-260627180718-character-animation-3-0-phase-9-gesture-intent-estimator-hys

## 判定
PASS

前回 FAIL の残課題だった `predicted` / `recovering` semantic hold と all-arms fallback の優先順は、commit `b523cb0d1e8fcec3a95b24a6611718b20c9fbbd6` で解消されている。評価 worktree は clean で、`npm run gate` も同 commit に対して PASS した。

## 受け入れ条件チェックリスト
- [✓] 依存 `MotionIntentState` / `ArmMotionIntent` / parser が HEAD に存在する — `sincromisor-frontend/src/character/motionIntent/motionIntentState.ts` の contract と parser を import している。
- [✓] `motionIntentEstimator.ts` と要求 export を追加 — `MotionIntentEstimator`、`MotionIntentEstimatorConfig`、`MotionIntentEstimatorInput`、`GestureIntentObservation`、`createMotionIntentState()` を export 済み。
- [✓] estimator input boundary を限定 — 入力は `temporal` / optional `reliability` / optional `hand` / optional `gesture` / `mediaTimeMs` に閉じており、`performance.now()`、DOM、MediaPipe raw landmark、VRM pose、`AnimationMixer` は参照していない。
- [✓] config schema と clamp — `timing` / `thresholds` / `wave` / hold 設定を optional とし、duration は `0..2000ms`、threshold は `0..1`、`predictedSemanticHoldMs` は `200..700`、`sideSwapHoldMs` は `0..1000` に正規化している。非 finite override は default に戻る。
- [✓] class API と one-shot helper — `constructor(config?)`、`update()`、`reset()` を持ち、`createMotionIntentState(input, config?)` は `new MotionIntentEstimator(config).update(input)` に閉じている。初回 frame では minimum duration が必要な semantic intent は発火しない。
- [✓] v1 gesture label mapping — `"Open_Palm"`、`"Pointing_Up"`、`"Thumb_Up"`、`"Victory"`、`"Closed_Fist"` のみ semantic candidate にし、unsupported / unknown label は tracking に落ちる。
- [✓] confidence gate — gesture / hand confidence / hand reliability / finger reliability の既定値と override を実装。ReliabilityMap 欠損時は hand confidence のみで判定し、`low_hand_reliability` を付けない。
- [✓] minimum duration / cooldown — task 指定の既定値を `DEFAULT_TIMING` と `DEFAULT_CONFIG.wave` に固定している。
- [✓] `timing` config から wave を除外 — TypeScript schema は `Exclude<ArmMotionIntent, "tracking" | "lost" | "wave">` で、wave duration / cooldown は `config.wave` のみから読む。
- [✓] wave 発火条件 — `Open_Palm` 単独では発火せず、temporal wrist x velocity 優先、欠損時 image velocity fallback、elevation、1200ms 窓、2 回以上の符号反転、minimum duration、cooldown を要求している。`opennessPerSec` は使っていない。
- [✓] nearFace 条件 — Face bbox ではなく temporal arm `front`、elevation、forwardness、hand confidence の近似条件で判定している。
- [✓] clapLike 条件 — 左右 hand detected、両 wrist、2D 距離、左右 x velocity 対向の条件で candidate 化している。
- [✓] guarded / side_inconsistent — crossed、左右 wrist 近接 + forwardness、Reliability / Hand warning の `side_inconsistent` を candidate 化し、side swap hold 中は前回 semantic intent を同じ side に保持して `left_right_swap_suspect` を付ける。
- [✓] lost / predicted grace / fallback — `updateSide()` は side swap hold の次に `getPredictedSemanticHold()` を評価し、all-arms fallback より先に前回 semantic intent を保持する。追加 regression test は、両腕 `predicted` / `recovering` + low confidence + torso low reliability が fallback minimum duration を超えても 500ms 未満は `fallback_active` なしで semantic hold され、500ms 超過後に fallback へ落ちることを検証している。
- [✓] reset / invalid dt — `reset()` は previous time、fallback、side swap hold、side memory を破棄する。`dtMs <= 0`、`dtMs > 250`、非 finite dt は `invalid_dt` warning を返し、counters を進めない。
- [✓] unit test 追加 — `motionIntentEstimator.test.ts` は wave、mapping、cooldown、nearFace / clapLike / guarded、unknown、low reliability、ReliabilityMap 欠損、lost/fallback、predicted/recovering hold vs fallback、reset、invalid dt、config clamp、helper 初回、side swap hold を検証している。
- [✓] design docs 同期 — `documents/design/frontend/character/motion.md` に input boundary、gesture mapping、confidence gate、minimum duration / cooldown、wave 発火条件、nearFace / clapLike / guarded、lost / fallback、reset / invalid dt、Gesture Recognizer を主制御器にしない方針が同期されている。

## テスト結果
- `npm run gate`（cwd: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-b523cb0d1e8f-qF5K3M`）: PASS。commit `b523cb0` clean、3 step すべて cache hit。
- `gate:lint`: PASS / CACHE HIT。frontend lint/format and Markdown check。
- `gate:build`: PASS / CACHE HIT。frontend type check and build。既存の chunk size warning のみ。
- `gate:test`: PASS / CACHE HIT。308 tests passed。
- 追加確認: `cd sincromisor-frontend && npm run test -- motionIntentEstimator`: PASS。1 file / 15 tests passed。
- カバレッジ評価: 受け入れ条件の主要分岐は unit test で網羅されている。前回不足していた predicted / recovering semantic hold と all-arms fallback の競合ケースも追加 regression test で覆われたため、今回のタスク範囲では十分。

## ドキュメント整合性
- 公開 WebRTC / backend / compose / env 契約の変更はなし。
- developer-visible な motion intent 推定規則は追加されており、対応ドキュメント `documents/design/frontend/character/motion.md` は同じ変更で同期済み。
- attempt 2 は仕様文言の追加変更ではなく、attempt 1 で同期済みの predicted semantic hold / fallback 優先規則に対する実装バグ修正のため、追加のドキュメント更新は不要。

## 残課題（FAIL の場合）
- なし。
