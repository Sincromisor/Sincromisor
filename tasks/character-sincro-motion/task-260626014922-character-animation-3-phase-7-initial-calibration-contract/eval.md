# Evaluation: task-260626014922-character-animation-3-phase-7-initial-calibration-contract

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `initialSincroCalibration.ts` の追加と schema/version/types/functions export — `SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION`、`InitialSincroCalibrationSession`、status/step/retry reason union、`evaluateInitialCalibrationStep()`、`summarizeInitialCalibrationSession()`、`createCanonicalCalibrationFromInitialSession()`、`mapInitialCalibrationGuideMessages()` が公開 export されている（commit `c628787`、`initialSincroCalibration.ts`）。
- [✓] step id 固定と `face_yaw_optional` の optional 扱い — step union は `precheck` / `neutral` / `a_pose` / `hand_open` / `face_yaw_optional`。summary は `precheck` / `neutral` / `a_pose` / `hand_open` を標準判定に使い、`face_yaw_optional` は status 判定から除外され、test でも optional face yaw failure が `ready` を維持することを検証している。
- [✓] status enum 固定 — `not_started` / `ready` / `ready_without_hands` / `retry_recommended` / `failed` に固定されている。
- [✓] summary status 優先順位と `hand_open` optional 化 — core step の hard failure を先に `failed` とし、core ready + hand ready は `ready`、core ready + hand `degraded` / `retry` / `failed` / `skipped` は `ready_without_hands`。`hand_open` は core failure 判定に含まれず、単独不調で session `failed` にならない。review.md 申し送りの `degraded` / `retry` は test で直接検証済み、`failed` / `skipped` は summary helper の許容 status に含まれる。
- [✓] `ready` / `ready_without_hands` の条件 — `ready` は core ready かつ hand ready の場合のみ。`ready_without_hands` は core ready かつ hand optional status の場合のみ返る。
- [✓] `retry_recommended` / `failed` の条件 — degraded core step は `retry_recommended`、core reliability が degraded threshold 未満の `retry`/score 0 は `failed`、precheck camera unavailable は hard failure として `failed`。該当 test あり。
- [✓] step 評価入力の境界 — `EvaluateInitialCalibrationStepInput` は `ReliabilityMap`、optional `CameraQualityScore`、optional `CanonicalUpperBodyState`、`validDurationMs` に閉じ、MediaPipe raw landmark / browser camera API は読まない。
- [✓] retry reason union と guide message mapping — union は指定 8 reason に固定。priority order による重複排除と最大 2 件の固定文言返却を実装し、test で priority / max2 を検証している。`too_dark` は field mapping table に生成元がないため、今回の受け入れ条件上は union と guide message mapping の固定で充足と判断した。
- [✓] canonical snapshot id/source/capturedAt — `id` は `initial-calibration:${startedAtMediaTimeMs}:${completedAtMediaTimeMs}`、`source: "initial"`、`capturedAtMediaTimeMs` は completion 時刻。test で検証済み。
- [✓] canonical fallback — `neutralYawRad`、`shoulderWidth`、`torsoScale`、左右 `handBaseline` は session measurements を優先し、欠損時は `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` に fallback する。test で一部 measurement 欠損時の fallback を検証済み。
- [✓] step 別 field mapping と missing/debug の扱い — precheck / neutral / a_pose / hand_open / face_yaw_optional は task.md の field mapping table に沿う。camera component 欠損は該当 check skipped、reliability/canonical 欠損は threshold 未満として扱う。`debug` は判定後に生成され、判定入力には使われない。
- [✓] `mapInitialCalibrationGuideMessages(reasons)` export — export 済み。priority order と固定文言に従い最大 2 件を返す。
- [✓] unit test 追加 — `initialSincroCalibration.test.ts` が ready、ready_without_hands、retry_recommended、failed、optional face yaw 失敗、retry reason priority、canonical calibration 変換を検証している。
- [✓] design doc 同期 — `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に status、step、input boundary、通常 UI / debug UI の情報境界が同期されている。

## テスト結果

- `npm run gate`（評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-c628787fbadf-zMPcrP`、commit `c628787`、clean）: PASS
    - `gate:lint`: CACHE HIT / PASS
    - `gate:build`: CACHE HIT / PASS
    - `gate:test`: CACHE HIT / PASS、226 tests passed
- 追加 read-only 確認: `cd sincromisor-frontend && npm run test -- initialSincroCalibration`: PASS、1 file / 7 tests passed
- カバレッジ評価: 受け入れ条件の主要 contract は既存 unit test で直接検証されている。`hand_open=failed|skipped` は専用 test は無いが、summary 実装が `hand_open` を core failure から除外し optional status として扱うため、review.md の Critical/High 申し送りに対する実装充足は確認できる。追加 acceptance test は作成していない。

## ドキュメント整合性

- 公開 WebRTC / backend API の変更はなし。
- 追加された公開挙動は frontend character calibration contract（session schema、status、step、retry reason、guide message、canonical snapshot 変換）。対応する `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` は同じ変更で同期済み。
- `too_dark` は現行 `CameraQualityScore` に直接対応 component がなく、task.md の field mapping table にも生成元が無い。retry reason union と通常 UI guide message mapping の contract は同期済みであり、実 reason 生成を後続範囲とする実装者の残リスクは受け入れ条件違反ではない。

## 残課題（FAIL の場合）

- なし。
