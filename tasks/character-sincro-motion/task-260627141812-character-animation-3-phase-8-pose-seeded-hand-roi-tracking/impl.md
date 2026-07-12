# Implementation Log: task-260627141812-character-animation-3-phase-8-pose-seeded-hand-roi-tracking

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- review.md の stale 指摘どおり、Worker は現行の Pose -> Face ROI 経路へ合わせた。Hand は Pose が実行された frame の Pose snapshot 後に差し込み、Face ROI と同じ Pose snapshot を使う構成にした。
- ROI contract は `createHandRoiFromPoseArm()`、`mapCropPointToFullFrame()`、`SincroRoiObservation` を既存 `roiTracking` から import して利用した。ROI warning enum は Hand warning enum へ重複移植せず、Hand snapshot 側に必要な warning へ明示変換するだけにした。
- Hand snapshot は low-dimensional features に限定した。MediaPipe landmark object、crop object、raw landmarks は保存せず、full-frame wrist、palm/finger feature、handedness summary、ROI observation、warning だけを残す。
- Hand wrist は腕 IK target の主値にしない。Pose snapshot の wrist target は変更せず、Hand result は palm / finger / reliability 材料に限定した。
- `poseOptions.enabled === true` かつ `poseOptions.hand?.enabled === true` の場合だけ Hand を有効化する。`onHandMotion` callback の有無だけでは Hand は起動しない。
- `handEnabled = true` かつ `poseEnabled = false` の Worker detect は Hand 推論せず stopped/lost hand snapshot を返す。Hand model 未ロード、初期化失敗、推論例外は lost snapshot に落とし、Face / Pose 経路を止めない。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` に Hand snapshot、feature 値域、ROI fallback、assignment、Worker/runtime cadence、Gesture を Phase 9 に残す境界を同期した。
- `documents/design/frontend/character/motion.md` に Hand wrist を IK 主 target にしない境界、low-dimensional Hand snapshot、ROI fallback、Gesture / MotionIntent を Phase 9 以降へ残す方針を同期した。

### 確認

- `cd sincromisor-frontend && npm run test -- sincroHand`: PASS
- `cd sincromisor-frontend && npm run test -- roiCoordinateMapping`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS
    - lint: PASS
    - build: PASS
    - test: PASS（33 files / 265 tests）
- 実装コミット `a677355cec960b1e97d72ea23405279d9ac913e3` 作成後、clean HEAD `a677355` で `npm run gate`: PASS

### 残リスク

- 実カメラでの HandLandmarker ROI 精度と fps 実測は未実施。CI では model / camera 依存を避け、ROI 復元、Pose wrist assignment、duplicate rejection、lost fallback、openness 境界を unit test で確認した。
