# Evaluation: task-260624013718-character-animation-3-canonical-arm-feature-extraction

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `canonicalArmFeatureExtractor.ts` を追加し、`createCanonicalUpperBodyState(input)`、`extractCanonicalArmState(input)`、`CanonicalArmFeatureInput` を export している（commit `be07e62`、`canonicalArmFeatureExtractor.ts:29-42`）。
- [✓] `createCanonicalUpperBodyState()` は `SincroPoseMotionSnapshot`、`CanonicalTorsoFrameResult`、任意の `previous`、`mediaTimeMs` を受ける型で、parse 可能な `CanonicalUpperBodyState` を構築している（`canonicalArmFeatureExtractor.ts:29-34`, `136-165`、`canonicalArmFeatureExtractor.test.ts:130-141`）。
- [✓] `extractCanonicalArmState(input)` は `CanonicalSingleArmFeatureInput` から指定 side 1 本分の `CanonicalArmState` だけを返し、左右 map / timestamp / calibration は `createCanonicalUpperBodyState()` 側で組み立てている（`canonicalArmFeatureExtractor.ts:36-42`, `120-133`, `136-165`）。
- [✓] `bodyLocalWrist` と `bodyLocalElbow` は torso frame の `bodyRight` / `bodyUp` / `bodyFront` への dot product で算出している。canonical 実装は VRM retarget frame、IK quaternion、AnimationMixer を入力にしていない（`canonicalArmFeatureExtractor.ts:46-51`, `canonicalArmFeatureMath.ts:83-92`）。
- [✓] `reach` は shoulder-wrist 距離を arm length で割り `0..1.15` に clamp する。不正 arm length は `reach=0`、`confidence=0`、`missing_world_coordinates` warning になる（`canonicalArmFeatureExtractor.ts:52-68`, `168-181`, `195-220`、`canonicalArmFeatureExtractor.test.ts:202-215`）。
- [✓] `elevationRad` は body-local 方向 Y 成分の `asin()` で `[-Math.PI / 2, Math.PI / 2]` に収まる（`canonicalArmFeatureExtractor.ts:69-76`）。
- [✓] `openness` は右腕 body-local X 正、左腕 body-local X 負を positive とする anatomical side 定義で `-1..1` に clamp している（`canonicalArmFeatureExtractor.ts:77-83`、`canonicalArmFeatureExtractor.test.ts:144-155`, `171-181`）。
- [✓] `forwardness` は body-local direction、MediaPipe world Z、2D projection shortening を指定重みで合成し、欠損成分を除いた weight sum で再正規化する。world Z 欠損・projection shortening 欠損だけでは confidence を下げない（`canonicalArmFeatureMath.ts:18-22`, `95-117`, `186-232`、`canonicalArmFeatureExtractor.test.ts:184-200`）。
- [✓] `elbowFlexionRad` は elbow を頂点に `Math.PI - angleBetween(elbowToShoulder, elbowToWrist)` で計算し、`0..Math.PI` に clamp している（`canonicalArmFeatureExtractor.ts:96-103`、`canonicalArmFeatureMath.ts:120-127`）。
- [✓] `classification` は task.md の deterministic rule と一致し、`confidence < 0.15` の `unknown` と `openness < -0.25` の `crossed` 優先を含む（`canonicalArmFeatureMath.ts:129-150`、`canonicalArmFeatureExtractor.test.ts:158-181`）。
- [✓] `confidence` は arm confidence、shoulder / elbow / wrist world confidence、torso confidence の最小値を基本にし、torso unreliable、body-local fallback、invalid arm length、untracked / lost joint で最大 `0.45` に clamp する。source は `"pose"` / `"neutral"` のみ（`canonicalArmFeatureExtractor.ts:109-130`, `195-220`、`canonicalArmFeatureMath.ts:152-165`）。
- [✓] clamp した field は `outOfRangeFields` に `path`、元値、min / max、clampedValue を記録し、parse 対象 state には clamp 後の値を保存している（`canonicalArmFeatureMath.ts:37-49`、`canonicalArmFeatureExtractor.test.ts:217-236`）。
- [✓] `canonicalArmFeatureExtractor.test.ts` は neutral、片腕 side、front、crossed、world Z 欠損、腕長不正、範囲 clamp を検証している（`canonicalArmFeatureExtractor.test.ts:129-237`）。
- [✓] `documents/design/frontend/character/motion.md` に arm canonical feature の名前、単位、classification rule、VRM rotation / IK quaternion / AnimationMixer を含めない方針が同期されている（`motion.md:115-119`）。

## テスト結果

- `npm run gate` を評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-be07e62e29aa-lIV0EI` で実行: passed。
- gate 詳細: `gate:lint` CACHE HIT、`gate:build` CACHE HIT、`gate:test` CACHE HIT。対象は `be07e62` の clean tree。
- test summary: `61 passed (61)`。
- カバレッジ評価: task.md が明示する unit test ケースは追加テストで網羅されている。重点確認の confidence clamp 条件（torso unreliable / world coordinate fallback / invalid arm length / untracked / lost）は direct branch としてコード照合済み。projection shortening 欠損のみの明示テストはないが、欠損時は `calculateForwardness()` の weight sum 再正規化だけに閉じており、confidence 計算へ渡らないため受け入れ上の不足とは判定しない。

## ドキュメント整合性

- 公開通信契約、外部 API、endpoint、DataChannel 語彙の変更はない。
- character motion の内部 canonical contract 追加として `documents/design/frontend/character/motion.md` は同期済み。
- 前タスク `task-260624013712.../eval.md` の差分は Prettier による空行整形のみで、評価内容の意味変更はない。Markdown check を通すための運用上の差分として問題なし。

## 残課題（FAIL の場合）

- なし。
