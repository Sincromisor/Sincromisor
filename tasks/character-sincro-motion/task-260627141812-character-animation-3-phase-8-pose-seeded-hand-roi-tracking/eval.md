# Evaluation: task-260627141812-character-animation-3-phase-8-pose-seeded-hand-roi-tracking

## 判定
PASS

## 受け入れ条件チェックリスト
- [✓] Hand snapshot module/export — `sincroHandMotionSnapshot.ts` が `SincroHandMotionSnapshot`、左右 side / feature snapshot、default snapshot を export している。
- [✓] Snapshot schema — `trackingEnabled`、`detected`、左右 hand、inference stats、`fallbackReason` と、左右 hand の `assignedSide` / `source` / `roi` / `fullFrameWrist` / `features` / `warnings` が固定 schema で実装されている。
- [✓] 型 enum/tuple の固定 — `SincroHandTuple3 = readonly [number, number, number]`、`SincroHandPoint2 = readonly [number, number]`、source/warning enum が task.md の最小 schema と一致する。
- [✓] Feature 値域 — `clamp01()`、`finiteOrZero()`、`normalizeTuple3()` で scalar は `0..1`、palm tuple は正規化/fallback され、非 finite confidence/landmark には `low_confidence` / `landmarks_missing` が残る。
- [✓] Default lost hand — default は `detected=false`、`source="lost"`、confidence/score 0、wrist undefined、palm fallback、scalar 0、`openness="unknown"`、`warnings=["landmarks_missing"]`。`sincroHandMotionSnapshot.test.ts` で検証済み。
- [✓] Openness 境界 — `averageCurl` の `<=0.35` open、`<0.72` half、`>=0.72` closed、欠損/低 confidence unknown が実装され、境界 test あり。
- [✓] Raw object 非保存 — snapshot は full-frame wrist と低次元 feature / ROI observation のみを保存し、MediaPipe landmark object、crop object、raw landmarks を snapshot に保持していない。
- [✓] HandLandmarker lifecycle/fallback — `/3rd_party/hand_landmarker.task` から初期化し、未ロード/初期化失敗/推論例外は lost fallback snapshot に落ちる。
- [✓] Pose-seeded ROI / full-frame fallback — `createHandRoiFromPoseArm()` で left/right ROI を作り、valid side のみ crop 推論する。両 side invalid の場合だけ full-frame pass を 1 回実行し、`source="full-frame-fallback"` で assignment する。
- [✓] ROI crop boundary — canvas/OffscreenCanvas crop は `sincroHandRoiCropFrame.ts` 内部に閉じ、crop-local landmark は `mapCropPointToFullFrame()` で full-frame normalized coordinate へ戻す。
- [✓] Pose wrist distance assignment — handedness label ではなく Pose wrist distance を主条件にし、`<=0.18` の結果だけ採用する。距離超過は `side_inconsistent` lost になる。distance assignment test あり。
- [✓] Full-frame duplicate/tie handling — full-frame fallback は同じ hand result を両 side に割り当てず、duplicate side に `duplicate_assignment` を残す。同距離は previous assignment、次に wrist confidence で片側採用する。duplicate/previous tie test あり。
- [✓] Hand wrist boundary — diff は pose snapshot / retargeter / IK 実装を変更しておらず、Hand wrist は hand snapshot の `fullFrameWrist` と feature/reliability 材料に閉じている。
- [✓] Worker callback protocol — Worker result に optional `hand`、`TrackerRuntimeCallbacks.onHandMotion?`、stop message の hand snapshot が追加され、callback 未指定でも Face/Pose は従来どおり optional chaining で動作する。
- [✓] Enable condition — Hand は `poseOptions.enabled === true && poseOptions.hand?.enabled === true` の場合だけ有効化され、`onHandMotion` の有無だけでは起動しない。
- [✓] Worker handEnabled protocol — init/detect message に `handEnabled` が追加され、`handEnabled=true` でも `poseEnabled=false` または pose snapshot なしでは Hand 推論せず stopped/lost snapshot を返す。
- [✓] Hand cadence/stats/fallback — `lastHandInferenceAtMs` と `targetHandInferenceFps` を持ち、既定 4fps、指定 1..8fps clamp、main-thread fallback は 4fps 以下へ clamp。stats に optional `effectiveHandFps` が追加されている。
- [✓] Focused tests — ROI 座標復元、Pose wrist distance assignment、duplicate assignment rejection、lost fallback snapshot、openness 境界が `sincroHandMotionSnapshot.test.ts` で検証されている。
- [✓] Docs sync — `documents/design/frontend/character/tracking.md` と `motion.md` に Hand snapshot、値域、ROI fallback、Hand wrist を IK 主 target にしない境界、Gesture/MotionIntent を Phase 9 以降に残す方針が同期されている。

## テスト結果
- `npm run gate`（評価 worktree `/private/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-a677355cec96-aVlxQm`、HEAD `a677355`、clean）: PASS
- gate 詳細:
    - `gate:lint`: CACHE HIT / PASS
    - `gate:build`: CACHE HIT / PASS
    - `gate:test`: CACHE HIT / PASS（265 tests passed）
- 追加の acceptance test は作成していない。実装者テストは helper 中心だが、受け入れ条件で明示された Hand feature/assignment/ROI 復元の観点を満たしている。Worker/runtime の enable 条件、fallback、callback 非指定互換は差分の静的確認で補完した。

## ドキュメント整合性
- 契約/公開挙動の変更あり: developer-visible な `SincroHandMotionSnapshot`、`TrackerRuntimeCallbacks.onHandMotion?`、Worker `handEnabled` protocol、stats `effectiveHandFps?` が追加されている。
- 同期状況: 同期済み。`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に Hand snapshot schema、feature 値域、ROI fallback、assignment、cadence、Hand wrist/IK 境界、Gesture / MotionIntent を Phase 9 に残す方針が反映されている。

## 残課題（FAIL の場合）
- なし。
