# Evaluation: task-260625035438-character-animation-3-phase-4-pose-reliability-estimator

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `createPoseReliabilityMap(input)` の追加と `ReliabilityMap` v1 返却 — attempt 1 で追加済み。`parseReliabilityMap()` を通す実装者テストも維持されている。
- [✓] 入力 shape と caller-provided time — `PoseReliabilityEstimatorInput` は `pose`、optional `cameraQuality`、optional `previous.pose/mediaTimeMs/reliability`、`mediaTimeMs`、`video` に固定されており、estimator 内で `performance.now()` / `Date.now()` を呼んでいない。
- [✓] joint placeholder — shoulder / elbow / wrist は pose 由来、`head` / `leftHand` / `rightHand` は deterministic lost placeholder で `finalWeight: 0` と `not_available_in_pose_snapshot` を返す。
- [✓] part / gesture placeholder — `torso`、`leftArm`、`rightArm` は pose 由来、`head`、hand、finger、gesture は lost placeholder。
- [✓] component 閾値と reason code — border、boneLength、bodyScale、temporal、cameraQuality の閾値は task.md と一致する。`quality: "weak"` は attempt 2 の追加テストで tracking score `0.45` / `weak_tracking` として固定された。
- [✓] `finalWeight` の幾何平均と lost clamp — `poseReliabilityFactories.ts:33-37` で provisional weight を幾何平均として計算し、`stateFromWeight(provisionalWeight) === "lost"` の場合は forceLost でなくても出力 `finalWeight` を 0 にしている。
- [✓] 前回 FAIL の解消 — attempt 2 の追加テスト `zeros finalWeight when component degradation makes a non-forced joint lost` が、非 force lost joint の `state: "lost"` / `finalWeight: 0` を固定している（`poseReliabilityEstimator.test.ts:115-143`）。
- [✓] state 境界と `predicted` / `recovering` 非使用 — factory の境界は `>= 0.65` tracked、`>= 0.05` suspect、それ未満 lost。estimator の生成経路では `predicted` / `recovering` を返していない。
- [✓] review.md の申し送り — docs の input shape 同期、boneLength / bodyScale / temporal の閾値固定、state 境界の実装が維持されている。

## テスト結果

- 実行コマンド: `npm run gate`
- 実行場所: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-17e68ad39242-v1HODC`
- 対象 commit: `17e68ad392424022b0a867101de3c59dbcbf069f`
- 結果: PASS
    - `gate:lint` PASS — `biome check` 390 files、Markdown Prettier check PASS
    - `gate:build` PASS — `tsc -p tsconfig.modern.json && vite build`
    - `gate:test` PASS — Vitest 16 files / 121 tests passed
- カバレッジ評価: task.md が要求する主要ケースに加え、前回不足していた非 force lost の `finalWeight: 0` と `quality: "weak"` の tracking score が attempt 2 の実装者テストで追加されている。受け入れ条件に対して十分。

## ドキュメント整合性

- 契約 / 公開挙動の変更: frontend 内部の developer-visible contract として `PoseReliabilityEstimator` と `ReliabilityMap` 利用範囲が増えている。WebRTC / backend の公開通信契約変更はない。
- 同期状況: `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に、Phase 4a estimator の入力 shape、previous reliability の扱い、placeholder 境界、component / state 境界が同期済み。
- 残リスク: `tracking.md` の `finalWeight` 説明は lost 時の 0 clamp を明示していない。task.md の受け入れ条件と実装者テストが正本として固定しており、今回の PASS を妨げる未同期とは判定しないが、後続で ReliabilityMap contract を広げる際に明文化すると安全。

## 残課題（FAIL の場合）

- なし。

## 前回評価履歴（attempt 1）

# Evaluation: task-260625035438-character-animation-3-phase-4-pose-reliability-estimator

## 判定

FAIL

## 受け入れ条件チェックリスト

- [✓] `createPoseReliabilityMap(input)` の追加と `ReliabilityMap` v1 返却 — `sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:41` で export され、実装者テストが `parseReliabilityMap(reliability).ok` を確認している。
- [✓] 入力 shape と caller-provided time — `PoseReliabilityEstimatorInput` は `pose`、optional `cameraQuality`、optional `previous.pose/mediaTimeMs/reliability`、`mediaTimeMs`、`video` に固定されている。estimator 実装内に `performance.now()` / `Date.now()` 呼び出しはない。
- [✓] joint placeholder — shoulder / elbow / wrist を pose から生成し、`head` / `leftHand` / `rightHand` は `state: "lost"`、`finalWeight: 0`、`warnings: ["not_available_in_pose_snapshot"]`。
- [✓] part / gesture placeholder — `torso`、`leftArm`、`rightArm` は pose 由来。`head`、hand、finger は lost placeholder。gesture は neutral lost placeholder。
- [✓] component 閾値と reason code — border、boneLength、bodyScale、temporal、cameraQuality の主要閾値は task.md と一致する。実装者テストは画面端 wrist、lost elbow、world coordinate 欠損、bad camera quality、previous wrist jump、pose fallback snapshot を確認している。
- [✓] `finalWeight` の幾何平均 — `poseReliabilityFactories.ts:33` と `poseReliabilityFactories.ts:142` で component score の幾何平均を使い、0 score は `max(score, 0.001)` としている。
- [✗] lost state と `finalWeight: 0` の整合 — `createReliability()` は `forceLost` の場合だけ `finalWeight: 0` にし、幾何平均で `stateFromWeight(finalWeight)` が `"lost"` になった場合は非 0 の `finalWeight` を返す（`poseReliabilityFactories.ts:33-36`、`poseReliabilityFactories.ts:98-105`）。task.md は「最終的に `state` が `"lost"` の部位だけ `finalWeight: 0`」を要求しているため、tracked target のまま presence / visibility / border / bodyScale / cameraQuality などが複合劣化して `finalWeight < 0.05` になったケースで契約違反になる。
- [✓] state 境界と `predicted` / `recovering` 非使用 — estimator の生成経路では `tracked` / `suspect` / `lost` のみ返しており、`predicted` / `recovering` は返していない。
- [✓] review.md の申し送り — docs の input shape 同期、boneLength / bodyScale / temporal の閾値固定、state 境界の実装は概ね満たしている。ただし上記 `lost` finalWeight の境界ケースが未解消。

## テスト結果

- 実行コマンド: `npm run gate`
- 実行場所: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-beb45941bc57-w6ILH4`
- 対象 commit: `beb45941bc578ade396748cac4f0ddc7755eab19`
- 結果: PASS
    - `gate:lint` PASS — `biome check` 390 files、Markdown Prettier check PASS
    - `gate:build` PASS — `tsc -p tsconfig.modern.json && vite build`
    - `gate:test` PASS — Vitest 16 files / 119 tests passed
- カバレッジ評価: 受け入れ条件で明示された主要ケースは実装者テストで概ね確認されている。一方、`stateFromWeight()` により `forceLost` 以外で `"lost"` へ落ちるケースと、その場合の `finalWeight: 0` は未テストで、今回の FAIL 根拠になっている。

## ドキュメント整合性

- 契約 / 公開挙動の変更: frontend 内部の developer-visible contract として `PoseReliabilityEstimator` と `ReliabilityMap` 利用範囲が増えている。WebRTC / backend の公開通信契約変更はない。
- 同期状況: `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に、Phase 4a estimator の入力 shape、previous reliability の扱い、placeholder 境界、component / state 境界が追記されている。同期済み。
- 注意: docs 側も task.md の「lost 部位だけ `finalWeight: 0`」の細部までは明文化していないため、実装修正時に必要なら tracking.md の該当行も合わせて明確化すること。

## 残課題（FAIL の場合）

- `createReliability()` で幾何平均を計算した後、`stateFromWeight(finalWeight)` が `"lost"` になった場合も返却 `finalWeight` を 0 にする。state 判定用の provisional weight と出力 weight を分けるのが安全。
- `forceLost` ではないが複数 component の劣化で `finalWeight < 0.05` になる joint / part のユニットテストを追加し、`state: "lost"` かつ `finalWeight: 0` を固定する。
- 併せて、`quality: "weak"` が tracking score `0.45` になるケースは明示テストがない。実装は満たしているが、受け入れ条件の回帰防止として追加を推奨する。
