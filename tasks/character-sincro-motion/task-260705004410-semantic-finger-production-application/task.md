# Apply semantic and finger composer layers in production

## 背景 / 目的

semantic pose layer と finger curl layer は motion-debug / helper 側では実装済みだが、production runtime では
まだ composer dry-run / arm / torso の段階に留まっている。torso / shoulder migration の exit criteria を
満たした後、semantic / finger を composer layer としてだけ production 適用できるようにする。

## 完了条件（受け入れ条件）

- [ ] `MotionIntentState`、semantic layer、finger curl layer、`AvatarMotionProfile` が valid snapshot の場合だけ、
      semantic / finger layer を production composer input に追加する。
- [ ] semantic preset と finger curl は composer layer としてだけ適用し、tracking layer が所有する bone と競合する場合は
      confidence gate / suppression reason で説明できる。
- [ ] `frame.intent`、`frame.solver.phase9`、semantic / finger debug snapshot、composer finalPose snapshot、
      profile capability snapshot が motion-debug recording / replay で保存・表示できる。
- [ ] `gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、
      `intentInvalidFrameCount` が pass で、finger 欠損 chain の composer conflict が 0 である。
- [ ] Hand open / half / closed、thumbs-up、peace、near-face、soft clap-like、hand lost / recovered、
      reduced finger chain を複数 VRM または synthetic profile で確認し、
      `artifacts/semantic-finger-production-application-verification.md` に記録する。
- [ ] Gesture Recognizer raw result、MediaPipe raw landmark、VRM Object3D、raw bone node は semantic / finger layer
      生成入力にしない。
- [ ] `documents/design/frontend/character/motion.md` と必要に応じて
      `documents/design/frontend/character/overview.md` に、semantic / finger production 適用、Phase 9 artifact、
      rollback 条件、raw landmark 非使用境界を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、
      `symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、
      `action`、`reviewer note` に固定し、最低限 `createSemanticMotionPoseLayer()`、
      `createFingerCurlPoseLayer()` / `createFingerCurlPoseLayers()`、Phase 9 parser / debug snapshot、
      production composer input 追加判断、confidence suppression、reduced finger chain fallback、
      raw landmark 非使用判断を含める。
      audit 記録だけでは完了扱いにせず、public export / boundary / lifecycle / heuristic / parser に必要な
      JSDoc/TSDoc の追加・更新または省略理由、弱い既存コメントの rewrite / delete、stale comment 更新・削除、
      TODO 必須情報の充足を実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- semantic / finger は `VrmPoseComposer` の `kind: "semantic"` layer として追加する。`ArmBoneController` や
  `CharacterMotionTorsoApplier` に個別 direct write を増やす案は採用しない。
- production input は saved / validated `MotionIntentState` と low-dimensional Hand snapshot に限定する。
  raw landmark から本番で finger rotation を作る案は、replay 決定性と privacy / artifact 境界を壊すため採用しない。
- semantic / finger flag は arm / torso flag と独立に rollback 可能にする。full `setNormalizedPose(finalPose)` は
  後続 task に残す。
- conflict 時は semantic が tracking pose を不透明に上書きしない。confidence threshold 未満の bone は suppression する。

## スコープ境界

- 本タスクでやること: semantic / finger layer の production composer input 接続、Phase 9 snapshot / metrics / replay 確認、
  reduced finger chain fallback、docs sync。
- 本タスクでやらないこと: Gesture Recognizer の新規導入、authored semantic clip asset、AnimationMixer 再生、
  full `setNormalizedPose(finalPose)`、head / neck / leg / expression 所有境界変更、backend 契約変更。
- 依存タスクとの境界: `task-260705004405-torso-shoulder-composer-migration` が torso / shoulder ownership を安定化する。
  Phase 9 helper task 群は semantic / finger layer の生成 contract を提供し、本タスクは production runtime への適用を担う。

## 実装方針（既存コード整合: file:line）

- Production Application Gates の semantic / finger 条件は `documents/design/frontend/character/motion.md:470` が正本である。
- `MotionIntentState` contract と parser 境界は `documents/design/frontend/character/motion.md:330` から
  `documents/design/frontend/character/motion.md:348` を読む。
- semantic / finger helper の production 入力境界は `documents/design/frontend/character/motion.md:349` と
  `documents/design/frontend/character/motion.md:350` に固定されている。
- semantic layer 実装入口は `sincromisor-frontend/src/character/motionIntent/semanticMotionPoseLayer.ts:70`。
- finger layer 実装入口は `sincromisor-frontend/src/character/motionIntent/fingerCurlPoseLayer.ts:51` と
  `sincromisor-frontend/src/character/motionIntent/fingerCurlPoseLayer.ts:88`。
- Phase 9 debug snapshot の保存 / parse は
  `sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase9Snapshot.ts` を確認する。

## テスト

- `sincromisor-frontend/src/character/motionIntent/__tests__/semanticMotionPoseLayer.test.ts` と
  `fingerCurlPoseLayer.test.ts` を拡張し、production 入力で raw landmark なし、confidence suppression、
  reduced finger chain fallback、previous hold を検証する。
- `sincromisor-frontend/src/character/vrmPose/__tests__/vrmPoseComposerSemantic.test.ts` または近傍テストで、
  semantic / finger layer が existing tracking layer と conflict した時に suppression reason を持つことを検証する。
- motion metrics test で Phase 9 metrics の pass / invalid intent exclusion / not_available 理由を検証する。
- `npm run gate` を通す。

## ドキュメント同期の要否

要。developer-visible な semantic / finger production 適用、Phase 9 artifact、rollback 条件が変わるため、
`documents/design/frontend/character/motion.md` と必要に応じて `documents/design/frontend/character/overview.md`
を同期する。公開 WebRTC / backend 契約は変更しない。
