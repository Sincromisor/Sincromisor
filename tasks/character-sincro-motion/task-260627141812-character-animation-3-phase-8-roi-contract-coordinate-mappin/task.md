# character animation 3.0 phase 8 ROI contract and coordinate mapping

## 背景 / 目的

character-animation-3.0 Phase 8 は、Pose を full-frame の全体検出、Hand / Face を Pose 起点 ROI 検出として扱う段階である。roadmap は Pose wrist から hand crop、Pose face region から FaceLandmarker ROI を作り、crop 座標を full-frame / body-local へ戻す方針を示している（`documents/research/character_animation/roadmap.md:454`）。調査資料でも、Pose full-frame -> Hand / Face ROI -> full-frame 座標復元 -> Reliability / canonical 統合が推奨されている（`documents/research/character_animation/answers/01-mediapipe-tracking.md:187`、`documents/research/character_animation/report02.md:209`）。

このタスクでは、Hand / Face tracker 実装に先立ち、ROI の保存 contract、座標変換、左右割当の入力情報、debug / replay へ載せられる plain object 形式を確定する。MediaPipe 実行や tracker runtime 接続は後続タスクに残し、本タスクは ROI contract と pure utility に集中する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/roiTracking/roiTrackingTypes.ts` を追加し、`SincroRoiRect`、`SincroRoiObservation`、`SincroRoiSide = "left" | "right" | "face"`、`SincroRoiSource = "pose-wrist" | "pose-face" | "full-frame-fallback" | "previous" | "none"`、`SincroRoiWarningCode` を export する。
- [ ] `SincroRoiWarningCode` は `"roi_missing" | "roi_clamped" | "roi_too_small" | "roi_inconsistent" | "pose_not_detected" | "invalid_pose_point" | "low_pose_quality"` に固定する。ReliabilityMap の warning enum とは別型であり、本タスクでは ReliabilityMap を変更しない。
- [ ] ROI contract は JSON 保存可能な `number` / string enum / plain object / tuple だけで構成し、`ImageBitmap`、`HTMLCanvasElement`、MediaPipe landmark object、Three.js object、class instance を型にも保存 schema にも含めない。
- [ ] `SincroRoiPoint` は `readonly [number, number]` に固定する。object `{ x, y }` は使わない。
- [ ] `SincroRoiRect` は full-frame normalized image coordinate に固定し、`centerX`、`centerY`、`width`、`height`、`clamped` を持つ。`source`、`confidence`、`warnings` は rect ではなく `SincroRoiObservation` に持たせる。`x/y/width/height` の左上形式は採用せず、crop local 座標から full-frame へ戻す式が左右対称になる center 形式に統一する。
- [ ] `SincroRoiObservation` の最小 schema は次に固定する。

```ts
export type SincroRoiPoint = readonly [number, number];

export type SincroRoiRect = {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    clamped: boolean;
};

export type SincroRoiObservation = {
    side: SincroRoiSide;
    source: SincroRoiSource;
    rect: SincroRoiRect;
    confidence: number;
    referencePoint?: SincroRoiPoint;
    warnings: SincroRoiWarningCode[];
};
```

- [ ] v1 の ROI は axis-aligned square / rectangle に固定し、rotated crop は実行しない。`rotationRad` は保存しない。手首 roll / palm basis は Hand result の後段 feature として扱い、ROI rect へ混ぜない。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/roiTracking/roiCoordinateMapping.ts` を追加し、`createHandRoiFromPoseArm()`、`createFaceRoiFromPose()`、`mapCropPointToFullFrame()`、`mapFullFramePointToCrop()`、`validateRoiRect()`、`calculateRoiConsistency()` を export する。最小 signature は次に固定する。

```ts
export function createHandRoiFromPoseArm(input: {
    side: "left" | "right";
    arm: SincroPoseArmMotionSnapshot;
    shoulderWidth: number;
}): SincroRoiObservation;

export function createFaceRoiFromPose(input: {
    pose: SincroPoseMotionSnapshot;
}): SincroRoiObservation;

export function validateRoiRect(input: {
    side: SincroRoiSide;
    source: SincroRoiSource;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    confidence: number;
    referencePoint?: SincroRoiPoint;
    warnings?: SincroRoiWarningCode[];
}): SincroRoiObservation;

export function mapCropPointToFullFrame(
    roi: SincroRoiRect,
    point: SincroRoiPoint,
): SincroRoiPoint;

export function mapFullFramePointToCrop(
    roi: SincroRoiRect,
    point: SincroRoiPoint,
): SincroRoiPoint;

export function calculateRoiConsistency(input: {
    expected: SincroRoiPoint | undefined;
    observed: SincroRoiPoint | undefined;
}): {
    score: number;
    distance: number | null;
    warnings: SincroRoiWarningCode[];
};
```

- [ ] `createHandRoiFromPoseArm()` は Pose wrist が finite かつ `quality !== "lost"` の場合だけ `source = "pose-wrist"` の ROI を返す。wrist が欠損する場合は `source = "none"`、`confidence = 0`、warning `roi_missing` を返し、例外を投げない。
- [ ] hand ROI の初期サイズは `max(0.16, min(0.42, max(2.4 * wristElbowDistance, 1.15 * shoulderWidth)))` とし、wrist / elbow / shoulderWidth の欠損時は `0.24` を fallback とする。中心は `wrist + 0.15 * normalize(wrist - elbow) * size` に固定し、elbow 欠損時は wrist 中心にする。
- [ ] `createFaceRoiFromPose()` は左右 shoulder center と shoulder width を主入力に、center `(shoulderCenterX, shoulderCenterY - shoulderWidth * 0.9)`、size `clamp(shoulderWidth * 1.45, 0.18, 0.46)` を返す。Pose が未検出または shoulderWidth が finite positive でない場合は `source = "none"`、`confidence = 0`、warning `roi_missing` を返す。
- [ ] ROI rect の clamp は left/top/right/bottom を clip してから center/size を再計算する方式に固定する。入力 `left = centerX - width / 2`、`right = centerX + width / 2`、`top = centerY - height / 2`、`bottom = centerY + height / 2` を作り、各端を `0..1` へ clip し、`centerX = (left + right) / 2`、`width = right - left` として返す。center だけを寄せて size を維持する方式は採用しない。
- [ ] clamp 判定順は `finite check -> edge clip -> min size check -> confidence clamp` に固定する。edge clip が発生した場合は `clamped = true`、warning `roi_clamped` を残す。clip 後の `width` / `height` が `0.08` 未満なら `confidence = 0`、warning `roi_too_small` を追加する。
- [ ] `mapCropPointToFullFrame()` と `mapFullFramePointToCrop()` は ROI rect と normalized point のみを入力にする pure function とし、round-trip 誤差が `1e-6` 以下であることを unit test で検証する。
- [ ] `calculateRoiConsistency()` は Pose wrist / face expected point と ROI 由来 full-frame point の正規化距離から `score 0..1` と warning `roi_inconsistent` を返せる。距離 `<= 0.04` は 1、`0.04..0.18` は線形低下、`> 0.18` は 0 に固定する。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/roiTracking/__tests__/roiCoordinateMapping.test.ts` を追加し、左右 hand ROI、face ROI、missing wrist、frame clamp、small ROI、crop/full-frame round-trip、ROI consistency の境界値を検証する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に ROI coordinate contract、axis-aligned v1 方針、failure semantics、後続 Hand / Face / reliability task との境界を同期する。

## 設計判断（着手前に確定済み）

- 新規モジュールの所在は `src/features/gaze/trackingRuntime/roiTracking/` に固定する。ROI は TrackerRuntime / Worker / MediaPipe orchestration の入力境界であり、`character/canonical` や `character/reliability` より前段に位置するため、`character/` 配下には置かない。
- ROI rect は full-frame normalized image coordinate の `centerX/centerY/width/height` に固定し、confidence / source / warnings は `SincroRoiObservation` 側に置く。pixel 座標を正本にする案は video resolution 差分と replay fixture 差分で扱いにくく、`x/y` 左上形式は左右 hand の crop local 復元式で中心基準の方が読みやすいため採用しない。
- v1 は axis-aligned crop だけを扱う。rotated crop は palm / forearm 方向に合わせられる利点があるが、canvas crop と MediaPipe result 座標復元の検証範囲が広がるため、Phase 8 初期では採用しない。
- crop 座標は `0..1` の crop-local normalized coordinate、復元後は `0..1` の full-frame normalized coordinate とする。pixel 座標は実際に `ImageBitmap` / canvas crop を作る後続 Hand / Face task の内部処理に閉じる。
- ROI failure は例外ではなく `SincroRoiObservation` と warning で表現する。runtime は ROI が欠損しても Pose-only / full-frame fallback を継続できる必要があるため、utility で throw しない。
- Hand handedness は本タスクでは確定しない。後続 Hand task が Pose wrist、Hand handedness、前フレーム ID を使って割り当てる。ROI contract は `side` と consistency score の材料だけを提供する。

## スコープ境界

- 本タスクでやること:
    - ROI 型、warning code、座標変換 utility、ROI consistency utility。
    - pure unit test。
    - Phase 8 ROI contract の設計文書同期。
- 本タスクでやらないこと:
    - HandLandmarker / FaceLandmarker の実行。
    - ImageBitmap / canvas crop の生成。
    - Worker message / TrackerRuntime callback の拡張。
    - ReliabilityMap への hand / face reliability 接続。
    - motion-debug viewer / replay log への表示接続。
    - Gesture Recognizer / MotionIntent / finger pose の実装。
- 依存タスクとの境界:
    - Phase 7 debug/replay task は motion-debug の layer / solver snapshot 基盤を提供する。本タスクはその後段に載る ROI contract を準備するだけで、Phase 7 snapshot は変更しない。
    - 後続 Hand / Face task は、本タスクの ROI utility を使って crop と座標復元を実装する。

## 実装方針（既存コード整合: file:line）

- `TrackerRuntime` は video frame timing を受けて Face / Pose 推論を orchestration している（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:167`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:216`）。ROI utility はこの前段 runtime から呼べる場所に置く。
- Worker message は現在 `frame`、`timestampMs`、`poseEnabled` だけを持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:35`）。本タスクでは message を広げず、後続 task が ROI contract を使って拡張する。
- Pose snapshot は wrist / elbow / shoulder target と normalized camera coordinate を持つ（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:25`、`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:45`、`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:60`）。hand ROI はこの既存 snapshot を入力にする。
- Pose upper body snapshot は `shoulderWidth`、`shoulderCenterX`、`shoulderCenterY` を持つ（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:70`）。face ROI はこの既存値を入力にする。
- ReliabilityMap は既に `roi_missing` / `roi_inconsistent` reason を予約し、warning には `roi_inconsistent` を持つが `roi_missing` warning は持たない（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:32`、`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:55`）。ROI warning は別型として定義し、後続 reliability task が reason / warning へ明示変換する。
- canonical state は JSON 保存可能な body-local contract であり、MediaPipe / runtime object を含めない方針である（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:94`）。ROI contract も同じ保存制約に合わせる。
- roadmap は Phase 8 で Pose wrist / face region から ROI を作り、full-frame 座標へ戻すことを求めている（`documents/research/character_animation/roadmap.md:454`）。本タスクはその最小 contract を実装する。

## テスト

- `cd sincromisor-frontend && npm run test -- roiCoordinateMapping`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な tracking / ROI contract を追加するため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に ROI coordinate contract、axis-aligned v1 方針、failure semantics、後続 Hand / Face / reliability task との境界を同期する。
