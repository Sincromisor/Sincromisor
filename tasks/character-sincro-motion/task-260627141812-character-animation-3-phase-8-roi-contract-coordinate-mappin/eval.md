# Evaluation: task-260627141812-character-animation-3-phase-8-roi-contract-coordinate-mappin

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] ROI 型定義を追加し、`SincroRoiRect`、`SincroRoiObservation`、`SincroRoiSide`、`SincroRoiSource`、`SincroRoiWarningCode` を export している — `f0c7455`、`roiTrackingTypes.ts`
- [✓] `SincroRoiWarningCode` は指定 7 種に固定され、ReliabilityMap は変更していない — `f0c7455`、`roiTrackingTypes.ts`; ReliabilityMap 差分なし
- [✓] ROI contract は JSON 保存可能な number / string enum / plain object / tuple のみで構成され、runtime object や class instance を含まない — `roiTrackingTypes.ts`
- [✓] `SincroRoiPoint` は `readonly [number, number]` に固定され、`{ x, y }` object は使っていない — `roiTrackingTypes.ts`
- [✓] `SincroRoiRect` は full-frame normalized center 形式の `centerX` / `centerY` / `width` / `height` / `clamped` のみを持ち、`source` / `confidence` / `warnings` は observation 側にある — `roiTrackingTypes.ts`
- [✓] `SincroRoiObservation` の最小 schema は task.md 指定どおり — `roiTrackingTypes.ts`
- [✓] v1 ROI は axis-aligned square / rectangle のみで、`rotationRad` は保存していない — 実装および tracking / motion docs
- [✓] `roiCoordinateMapping.ts` に指定 6 関数を export し、signature は受け入れ条件に沿っている — `f0c7455`、`roiCoordinateMapping.ts`
- [✓] `createHandRoiFromPoseArm()` は finite wrist かつ `quality !== "lost"` の場合だけ `pose-wrist` を返し、missing wrist は `source: "none"`、`confidence: 0`、`roi_missing` warning の finite observation を返す — `roiCoordinateMapping.test.ts`
- [✓] hand ROI の size / center 式は `max(0.16, min(0.42, max(2.4 * wristElbowDistance, 1.15 * shoulderWidth)))`、`wrist + 0.15 * normalize(wrist - elbow) * size` に沿い、elbow / shoulderWidth 欠損時は `0.24` fallback になる — `roiCoordinateMapping.ts`
- [✓] `createFaceRoiFromPose()` は shoulder center / shoulderWidth から指定式で ROI を返し、Pose 未検出または invalid shoulder は failure observation を返す — `roiCoordinateMapping.test.ts`
- [✓] `validateRoiRect()` は finite check、edge clip、min size check、confidence clamp の順で処理し、edge clip 後の bounds から center / size を再計算する。`roi_clamped`、`roi_too_small`、confidence clamp も仕様どおり — `roiCoordinateMapping.test.ts`
- [✓] crop-local / full-frame mapping は ROI rect と normalized tuple だけを読む pure function で、round-trip `1e-6` 以下を unit test で検証している — `roiCoordinateMapping.test.ts`
- [✓] `calculateRoiConsistency()` は距離境界 `<= 0.04`、`0.04..0.18`、`> 0.18` と `roi_inconsistent` / `roi_missing` warning を実装している — `roiCoordinateMapping.test.ts`
- [✓] unit test は左右 hand ROI、face ROI、missing wrist、frame clamp、small ROI、round-trip、ROI consistency 境界を検証している — `roiCoordinateMapping.test.ts`
- [✓] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に ROI coordinate contract、axis-aligned v1、failure semantics、Hand / Face / reliability 後続 task 境界を同期している — `f0c7455`
- [✓] review.md の Critical / High 指摘はなし。申し送りの failure observation、clamp 順序、ReliabilityMap 非変更はいずれも満たしている — `review.md` / 差分確認

## Verification

- `npm run gate`（評価 worktree `/private/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-29e760164e25-4Kbp96`、HEAD `29e7601`）: PASS
    - `gate:lint`: CACHE HIT / PASS
    - `gate:build`: CACHE HIT / PASS
    - `gate:test`: CACHE HIT / PASS, 252 tests passed
- カバレッジ評価: 受け入れ条件の pure utility 境界は実装者 unit test で十分に覆われている。runtime 接続、Hand / Face Landmarker 実行、ReliabilityMap 変換、debug / replay 表示は task.md のスコープ外として実装・テスト対象から外れている。

## ドキュメント整合性

- 公開 WebRTC / backend contract の変更はない。
- developer-visible な ROI coordinate contract は追加されているため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を確認した。ROI schema、full-frame normalized center rect、tuple point、axis-aligned v1、failure semantics、ReliabilityMap とは別型で後続 task に残す境界が同期済み。
- 生成物や配布物の再生成対象はなし。ReliabilityMap / TrackerRuntime runtime 接続は変更されておらず、スコープ外が保たれている。

## 残課題（FAIL の場合）

- なし。
