# Generate canonical head from face matrix

## 背景 / 目的

roadmap は `CanonicalUpperBodyState` の `head` slot が型と parser には存在する一方、live canonical 生成では torso / arms が中心で Face transformation matrix 主入力の canonical head が未接続であると整理している（`documents/research/character_animation/roadmap.md:76`、`documents/research/character_animation/roadmap.md:89`、`documents/research/character_animation/roadmap.md:468`）。

現状の `createCanonicalUpperBodyState()` は腕と体幹だけを返し、Face snapshot は torso yaw 補助にしか使われない。本タスクでは FaceLandmarker の transformation matrix 由来 head pose を `CanonicalUpperBodyState.head` として生成し、production observe-only の Temporal head 入力を有効にする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/canonical/canonicalHeadFeatureExtractor.ts` を追加し、`extractCanonicalHeadState(input)` を export する。
- [ ] `extractCanonicalHeadState()` の input は `face?: Pick<SincroFaceMotionSnapshot, "detected" | "confidence" | "headPose" | "source" | "warnings">`、optional `ReliabilityMap`、optional previous `CanonicalUpperBodyState["head"]` に限定する。
- [ ] Face が detected かつ `headPose.matrix` が 16 要素の finite number 配列である場合だけ、matrix 由来の yaw / pitch / roll を radian で `CanonicalUpperBodyState.head` に入れる。
- [ ] `headPose.matrix` が undefined の場合は `headPose.yawDeg` / `pitchDeg` / `rollDeg` へ fallback するが、`warnings` に `face_matrix_missing` を追加し、matrix 由来 confidence を `min(face.confidence, 0.65)` に clamp する。
- [ ] `headPose.matrix` が存在するが 16 要素でない、または 1 要素でも非 finite の場合も Euler fallback を試す。この場合は `warnings` に `face_matrix_invalid` を追加し、matrix 由来 confidence を `min(face.confidence, 0.5)` に clamp する。Euler も非 finite なら `head` を省略し、previous を使わない。
- [ ] Face が未検出、`source === "lost"`、または confidence が 0 の場合は `head` を省略し、neutral head を捏造しない。Temporal head の lost / dropout は `TemporalStateEstimator` の既存責務に残す。
- [ ] `ReliabilityMap` がある場合、`parts.head.finalWeight` と `joints.head.finalWeight` の両方を読む。どちらかの state が `"lost"` またはいずれかの finalWeight `< 0.05` なら `head` を省略する。そうでなければ最終 `confidence = clamp01(matrixOrEulerConfidence * sqrt(parts.head.finalWeight * joints.head.finalWeight))` に固定し、最終 confidence `< 0.15` では `low_confidence` warning を付ける。
- [ ] `createCanonicalUpperBodyState()` の input に optional `face` を追加し、production `SincroMotionObserveOnlyPipeline.updateDownstream()` から latest Face snapshot を渡す。
- [ ] `CanonicalUpperBodyState` parser に `face_matrix_missing` と `face_matrix_invalid` warning code を追加し、旧 log 互換として warning が無い既存 head / head 欠損 state も valid のまま維持する。
- [ ] head warnings は `CanonicalUpperBodyState.head.warnings` に保存し、`createCanonicalUpperBodyState()` の top-level `warnings` にも torso / arm warnings と同じ重複排除方針で集約する。
- [ ] unit test で、matrix 由来 head、Euler fallback、lost face で head 省略、reliability head finalWeight による confidence 低下、Temporal head が live canonical head を読むことを検証する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期し、canonical head は Face matrix 主入力、Euler fallback は低 confidence、Pose nose / ears / eyes fallback は現行 snapshot に無いため本 task では扱わないことを明記する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、少なくとも `extractCanonicalHeadState()`、matrix validation、Euler fallback confidence clamp、lost face で neutral を捏造しない判断、schema warning 追加を含める。
- [ ] comment audit 記録だけでは完了扱いにしない。public export / schemaVersion を持つ保存 contract / parser / observe-only boundary / matrix fallback heuristic について、必要な JSDoc/TSDoc の追加・更新、コメント省略理由、弱い既存コメントの rewrite / delete、stale comment の更新・削除を実コードと `impl.md` の両方で確認できること。TODO を追加または変更する場合は、理由、削除条件、canonical task ID、期限または判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- 新規 helper は `src/character/canonical/` に置く。Face tracker 側で canonical head を作る案は、tracker snapshot と後段共有 canonical contract の責務を混ぜるため採用しない。
- `CanonicalUpperBodyState.head` の既存 schema shape（`yawRad`、`pitchRad`、`rollRad`、`CanonicalPartMeta`）は維持する。matrix 全体や quaternion は canonical state へ保存しない。
- matrix の Euler 変換は `sincroFaceTrackerNormalizer.ts` と同じ回転成分抽出式を canonical helper 内へ小さく閉じる。共通化 refactor は本 task の必須にしないが、実装時に重複を避ける小 helper 抽出を選ぶ場合は `features/gaze/faceTracking` と `character/canonical` の依存向きが逆転しないことを条件にする。
- previous head は fallback 値として使わない。previous / predicted / recovering は `TemporalStateEstimator` の責務であり、canonical layer が状態推定を始めると dropout の責務が重複するため。
- head reliability の式は `matrixOrEulerConfidence * sqrt(parts.head.finalWeight * joints.head.finalWeight)` に固定する。`min()` だけで clamp する案は arm confidence と異なる減衰曲線になり、低 confidence が Temporal / MotionIntent で比較しづらくなるため採用しない。
- `face_matrix_missing` と `face_matrix_invalid` は canonical warning enum に追加する。既存 `missing_world_coordinates` に流用する案は、Face matrix 欠損と Pose world 座標欠損を debug / replay で区別できなくなるため採用しない。

## スコープ境界

- 本タスクでやること: canonical head extractor、canonical state 生成への Face 入力追加、production observe-only 接続、parser / tests / docs sync。
- 本タスクでやらないこと: Face tracker の matrix 推定式変更、Pose nose / ears / eyes fallback、head / neck VRM bone の適用変更、MotionIntent の gesture 判定、WebRTC / backend 契約変更。
- 依存タスクとの境界: `task-260627141812-character-animation-3-phase-8-pose-seeded-face-roi-tracking` は Face ROI と `headPose.matrix` 保存経路を提供済み。本タスクはその snapshot を canonical head へ変換するだけに限定する。

## 実装方針（既存コード整合: file:line）

- `CanonicalUpperBodyState.head` は型と parser に存在する（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:94`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:224`）。
- `createCanonicalUpperBodyState()` は現在 `torso` と `arms` だけを返し、`head` を設定しない（`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:146`）。
- `SincroMotionObserveOnlyPipeline.updateDownstream()` は torso 推定へ Face を渡しているが、canonical state 生成には Face を渡していない（`sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts:203`）。
- Face snapshot は `headPose.matrix?: number[]` を持つ（`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceMotionSnapshot.ts:3`）。
- Face normalizer は transformation matrix から yaw / pitch / roll を算出している（`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTrackerNormalizer.ts:80`）。
- tracking design は head orientation を Face transformation matrix 主入力にする方針を持つ（`documents/research/character_animation/roadmap.md:240`）。

## テスト

- `sincromisor-frontend/src/character/canonical/__tests__/canonicalHeadFeatureExtractor.test.ts` を追加し、matrix、Euler fallback、lost / invalid、confidence clamp、warning enum を検証する。
- `sincromisor-frontend/src/character/canonical/__tests__/canonicalArmFeatureExtractor.test.ts` または新規 state test で `createCanonicalUpperBodyState({ face })` が head を含むことを検証する。
- `sincromisor-frontend/src/character/runtime/__tests__/sincroMotionObserveOnlyPipeline.test.ts` を拡張し、Face + Pose callback 後に `state.canonical.head` と `state.temporal.head` が available になることを検証する。
- `cd sincromisor-frontend && npm run test -- canonicalHead canonicalArmFeature sincroMotionObserveOnlyPipeline`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な `CanonicalUpperBodyState` の live 生成内容が変わるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期する。公開 WebRTC / backend 契約は変更しない。
