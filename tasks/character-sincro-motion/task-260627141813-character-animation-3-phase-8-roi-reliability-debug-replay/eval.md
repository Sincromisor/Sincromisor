# Evaluation: task-260627141813-character-animation-3-phase-8-roi-reliability-debug-replay

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `createPoseReliabilityMap()` optional `hand` / `face` 入力 — `PoseReliabilityEstimatorInput` に optional field が追加され、未指定時は `hasOwnInput()` により既存 placeholder を維持している。
- [✓] Face detected head reliability — `createHeadJointReliability()` が `source: "face"`、`modelPresence` / `tracking` / `roi` など finite component を埋め、`face.roi.confidence` を ROI component の正本にしている。`poseReliabilityEstimator.test.ts` の "uses detected face ROI metadata for head reliability" で検証済み。
- [✓] Face missing / not detected reason — snapshot 自体なしは `no_observation`、`roi` field 欠損は `not_available_in_pose_snapshot`、ROI warning は `mapRoiWarnings()` に分離されている。
- [✓] Hand detected hand/finger reliability — `joints.leftHand/rightHand` と `parts.leftHand/rightHand` は `source: "hand"` になり、`parts.leftFinger/rightFinger` は `openness !== "unknown"` の場合だけ hand source を使う。テスト "uses detected hand ROI consistency for hand and finger reliability" で検証済み。
- [✓] Hand ROI consistency — `createHandRoiComponent()` は `calculateRoiConsistency({ expected: hand.roi.referencePoint, observed: hand.fullFrameWrist })` の結果だけを ROI score に使い、欠損時は `not_available_in_pose_snapshot` に落とす。
- [✓] side inconsistent downweight — `side_inconsistent` は side component `0.35`、state は `suspect` 以下、`finalWeight <= 0.45` cap、`low_confidence` warning 付与。テスト "downweights side-inconsistent hands to suspect reliability" で検証済み。
- [✓] ROI metadata 欠損 reason 分離 — snapshot なし / `roi` field 欠損 / ROI warning の reason が混同されず、`roi_missing` と `not_available_in_pose_snapshot` は同じ欠損に同時付与されない。テスト "keeps ROI metadata absence distinct from ROI failure warnings" で検証済み。
- [✓] `mapRoiWarnings()` — `roi_missing` は `roi_missing`、`roi_inconsistent` / `roi_clamped` / `roi_too_small` / `low_pose_quality` は `roi_inconsistent` に写像し、空 warning は空配列になる。
- [✓] Gesture placeholder 維持 — `createUnavailableGesture()` の `source: "neutral"` placeholder を維持し、Hand snapshot から gesture label を生成していない。テスト "keeps gesture reliability as a neutral placeholder with hand input" で検証済み。
- [✓] reliability 生成責務 — `MotionDebugApp.updatePoseReliability()` が latest hand / face snapshot を `createPoseReliabilityMap()` へ渡し、`MotionDebugRecordingController.recordPoseFrame()` は生成済み reliability を受け取る境界のまま。
- [✓] `MotionDebugSnapshot.hand` / recording `frame.hand` — live snapshot type と app snapshot に `hand` が追加され、recording frame schema / record input に `hand` が保存される。`motionDebugRecorder.test.ts` で exported log の `frame.hand` を検証済み。
- [✓] replay viewer saved reliability 正本 / old log fallback / invalid raw 表示 — viewer は live value がなければ saved `frame.reliability` を parse して表示し、旧 log は pose-only fallback、invalid reliability は `parseStatus: "invalid"` と `raw` を available layer value として表示する。`motionDebugViewerModel.test.ts` で検証済み。
- [✓] 実装テスト — `poseReliabilityEstimator.test.ts` と `motionDebugViewerModel.test.ts` / `motionDebugRecorder.test.ts` に、指定された Face / Hand / side / ROI / Gesture / live hand / saved reliability / old log / invalid reliability 観点が追加されている。
- [✓] docs 同期 — `documents/design/frontend/character/tracking.md`、`motion.md`、`overview.md` に Phase 8 hand / face / ROI reliability、component 方針、旧 log 互換、Gesture Phase 9 境界、`MotionDebugSnapshot.hand` / `frame.hand` が同期されている。

## テスト結果

- `npm run gate` を評価 worktree `/private/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-2b2c9f7bb252-3qC7ZC` で実行: PASS。
    - `gate:lint`: CACHE HIT, passed。
    - `gate:build`: CACHE HIT, passed。
    - `gate:test`: CACHE HIT, 270 passed。
- 補足確認: `npm run tasks:check` は gate 対象外だが実行し、実装ログと同じく root package `yaml` 不足で開始前に `ERR_MODULE_NOT_FOUND`。判定は gate PASS を正本にした。
- カバレッジ評価: 受け入れ条件の主要分岐は実装者テストで十分に押さえられている。追加の acceptance test は作成していない。

## ドキュメント整合性

- 公開 WebRTC / backend API 契約の変更はなし。
- developer-visible な `ReliabilityMap` の埋まり方、motion-debug `MotionDebugSnapshot.hand` / `frame.hand`、replay viewer の saved reliability 正本化という公開挙動変更あり。
- 対応ドキュメントは `documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/overview.md` に同期済み。未同期なし。

## 残課題（FAIL の場合）

- なし。
