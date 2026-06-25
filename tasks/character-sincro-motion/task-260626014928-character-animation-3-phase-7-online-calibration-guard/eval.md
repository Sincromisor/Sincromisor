# Evaluation: task-260626014928-character-animation-3-phase-7-online-calibration-guard

## 判定
PASS

## 受け入れ条件チェックリスト
- [✓] `onlineSincroCalibration.ts` と required exports — `onlineSincroCalibration.ts` が `SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION`、state / parse / freeze reason 型、parse / clone / gate / update / canonical conversion を再 export している（commit `56d0df0`）。
- [✓] `initial` / `candidate` / `committed` 分離と 3000ms promotion — state 型は 3 状態を分離し、`updateOnlineCalibrationState()` は `candidate.stableDurationMs >= 3000` の場合だけ `createCommittedSnapshot()` へ promote する。テスト `promotes a candidate after 3000ms of continuous gate-open samples` で確認済み。
- [✓] 更新対象の限定 — update 実装は `neutralYawRad`、`shoulderWidth`、`torsoScale`、`handBaseline.left/right.palmSize/openSpread` だけを書き換え、その他の canonical field は clone と `id/source/capturedAtMediaTimeMs` 更新に限定されている。
- [✓] gate 条件と close 時挙動 — `evaluateOnlineCalibrationGate()` は torso/head reliability、both shoulders visible、border risk、motion blur、arm activity、face yaw、bone length consistency を評価する。gate close 時は `createClosedGateState()` により calibration 値を進めず、`candidate` reset と `freezeReasons` 更新だけを行う。review.md の Medium 申し送りは解消済み。
- [✓] drift clamp と `drift_clamped` — initial から shoulder ±15%、torso ±20%、neutral yaw ±10deg、hand baseline ±20% に clamp し、clamp 済み値で candidate / committed 更新を継続する。テスト `clamps drift without discarding the candidate` で `candidate_not_stable` と `drift_clamped` の併存を確認済み。
- [✓] EMA tau — `alpha = 1 - Math.exp(-dtSec / tauSec)` を使い、shoulder/body `120s`、neutral yaw `90s`、hand baseline `20s` の定数で更新している。テスト `uses configured EMA tau values after the first candidate sample` で確認済み。
- [✓] canonical conversion — committed がある場合は `id: online-calibration:<updatedAtMediaTimeMs>`、`source: online`、`capturedAtMediaTimeMs: updatedAtMediaTimeMs` の `CanonicalCalibrationSnapshot` を返し、committed がない場合は initial を clone して返す。テスト `creates canonical online snapshot from committed state and clones initial without committed` で確認済み。
- [✓] parser failure 分類 — schema version mismatch は `unknown_schema_version`、unknown freeze reason / NaN / Infinity / extra key / runtime object 風 value は reject、negative duration は `out_of_range` に分類される。Zod strict schema と plain object guard、テスト `rejects invalid persisted online states` で確認済み。
- [✓] unit test 追加 — `onlineSincroCalibration.test.ts` は gate open、各 freeze reason、gate close candidate reset、candidate only、committed promotion、drift clamp、parse failure、EMA tau、canonical conversion を検証している。
- [✓] 設計文書同期 — `documents/design/frontend/character/motion.md` に online calibration の更新対象、変更禁止対象、gate、drift clamp、EMA、debug 表示項目が追加されている。

補足: first gate-open frame で sample 値を直接 candidate 初期値にする実装は、stableDuration 0 の未コミット候補を作るだけで、以後の更新は mediaTime 差分の EMA に入る。task.md は初期 candidate 作成時の smoothing を要求していないため、矛盾なしと判断した。

## テスト結果
- `npm run gate`（worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-56d0df00c503-CkTtkk`、commit `56d0df0` clean）: PASS。`gate:lint` / `gate:build` / `gate:test` はいずれも CACHE HIT。cached test summary は `Tests 236 passed (236)`。
- `cd sincromisor-frontend && npm run test -- onlineSincroCalibration`: PASS。`Test Files 1 passed (1)`, `Tests 10 passed (10)`。
- カバレッジ評価: 受け入れ条件の主要分岐は実装者テストで直接検証されている。特に gate close 後の candidate reset、mediaTime non-increase の `candidate_not_stable`、3000ms promotion、drift clamp 継続更新、EMA tau、parser reject、canonical conversion が揃っており、追加 acceptance test は不要と判断した。

## ドキュメント整合性
- 公開 WebRTC / backend 契約、runtime endpoint、永続化 API の変更はない。
- developer-visible な calibration policy と debug reason は変更されており、対応する設計正本 `documents/design/frontend/character/motion.md` に同期済み。生成物の再生成対象はなし。

## 残課題（FAIL の場合）
- なし。
