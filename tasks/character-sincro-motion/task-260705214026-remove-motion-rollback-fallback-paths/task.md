# Remove production motion rollback fallback paths

## 背景 / 目的

roadmap は full normalized pose application まで production 表示で実装済みとしつつ、Debug Console 限定 rollback hook と段階別 fallback path は削除条件を満たすまで残す、と整理している。既存 `task-260705004418-production-motion-rollback-and-cleanup` は rollback runbook と cleanup inventory を作り、`task-260705214907-full-normalized-pose-production-default` が full application を production default に昇格する。

本タスクでは、full application default 化後の継続 PASS を前提に、production runtime から staged rollback fallback paths と関連 developer flags を削除し、Debug Console は full composer の観測 summary に限定する。

## 完了条件（受け入れ条件）

- [ ] `task-260705214907-full-normalized-pose-production-default` が `status: done` / `verdict: PASS` であることを確認する。未達の場合は本タスクの code removal に入らず停止する。
- [ ] `task-260705004418-production-motion-rollback-and-cleanup/artifacts/production-motion-rollback-runbook.md` と cleanup inventory を読み、削除対象 / 残置対象 / 後続送りを `impl.md` に再掲する。
- [ ] 削除対象は `composerArmApplicationMode`、`composerTorsoShoulderApplicationMode`、`fullNormalizedPoseApplicationMode`、arm / torso staged rollback warnings、`ArmBoneController.update()` と `motionOrchestrator.update()` を full application failure 時に自動実行する production fallback trigger、対応する Debug Console controls / snapshot fields / tests に固定する。
- [ ] 残置対象は `composerSemanticFingerApplicationMode` と semantic / finger layer suppression warnings に固定する。これは semantic / finger regression rollback の責務であり、arm / torso / full application rollback とは別 task で削除判断する。
- [ ] `VRMCharacterManager.update()` は full composer application を唯一の upper-body final pose writer とし、full application unavailable frame でも old arm / torso staged writer へ自動 rollback しない。unavailable reason は Debug Console summary と metrics に残す。
- [ ] `fullNormalizedPoseApplicationRollbackReason()` は削除するか、名前を `fullNormalizedPoseApplicationUnavailableReason()` に変えて Debug Console / metrics 用の理由生成に限定する。旧 staged application を起動する trigger として使わない。
- [ ] stale fallback tests を削除または新正本へ rewrite し、旧 staged fallback が production success / failure path の受け入れ条件にならないようにする。
- [ ] cleanup 後も head / eye / mouth / emotion / leg / root position の非対象 controller は従来どおり更新される。
- [ ] P0 replay fixture、camera degradation / recovery、chat / sincro mode 切替、複数 VRM replay comparison で regression がないことを `impl.md` または `artifacts/` に記録する。
- [ ] `documents/design/frontend/character/motion.md`、runtime ownership map artifact、rollback / cleanup artifacts を更新し、production の唯一の upper-body final pose 書き手が full `VrmPoseComposer` application であること、削除した staged fallback path、残置した semantic / finger flag の削除条件を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、少なくとも temporary flag 削除、rollback reason 残置判断、old staged fallback 削除、Debug Console summary 境界、controller 非対象維持を含める。
- [ ] comment audit 記録だけでは完了扱いにしない。runtime boundary、lifecycle / cleanup decision、fallback deletion に必要な JSDoc/TSDoc の追加・更新、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- 削除対象は arm / torso / full application の staged rollback path と developer flags に固定する。semantic / finger flag は別責務なので本タスクでは残す。
- cleanup は `task-260705214907-full-normalized-pose-production-default` の PASS 後にだけ実施する。default 昇格前に fallback path を消す案は production 表示経路を壊すため採用しない。
- full application unavailable 時に旧 staged application を自動実行する挙動は廃止する。unavailable は warning / debug summary / metrics で扱い、同一 frame で複数 writer を復活させない。
- head / expression / leg / root position は upper-body composer ownership の対象外なので削除しない。
- 公開 WebRTC / backend 契約、DataChannel payload、server code は変更しない。

## スコープ境界

- 本タスクでやること: rollback artifacts 再確認、production fallback path 削除、temporary flags 棚卸し / 削除、tests rewrite、P0 /実機確認、docs / ownership map sync。
- 本タスクでやらないこと: full normalized pose application の新規実装、canonical temporal arm solver の primary 化、Gesture reliability、new UI setting、backend / WebRTC 契約変更。
- 依存タスクとの境界: `task-260705004415-full-normalized-pose-application` が production full application を提供し、`task-260705004418-production-motion-rollback-and-cleanup` が runbook / inventory を提供し、`task-260705214907-full-normalized-pose-production-default` が production default 昇格を行う。本タスクはその後の arm / torso / full rollback code removal に限定する。

## 実装方針（既存コード整合: file:line）

- 現行 default は `fullNormalizedPoseApplicationMode: "off"` である（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:173`、`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:176`）。この default 変更は依存タスク `task-260705214907-full-normalized-pose-production-default` の責務であり、本タスク開始時には `"upper_body"` default へ変更済みである前提にする。
- `VRMCharacterManager.update()` は composer dry-run 後に full normalized pose application を実行している（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:300`、`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:314`）。
- full application が適用されなかった場合、arm fallback として `ArmBoneController.update()` が呼ばれる（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:323`）。
- root 更新後、full application が適用されなかった場合、torso / shoulder fallback として `motionOrchestrator.update()` が呼ばれる（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:357`）。
- rollback reason は `fullNormalizedPoseApplicationRollbackReason()` に集約されている（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:563`）。
- Debug Console へ full application metadata を付与する処理は `annotateFullNormalizedPoseApplication()` が担う（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:600`）。
- dry-run service は VRM 適用を行わず、`status !== "available"` では result を返さない contract を持つ（`sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts:56`、`sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts:136`）。

## テスト

- `cd sincromisor-frontend && npm run test -- vrmCharacterManager sincroVrmPoseComposerDryRun armBoneController motionComposerComparisonMetrics`
- `cd sincromisor-frontend && npm run test -- motionDebugPhase6Snapshots debugConsoleSincroMotionControls`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- P0 replay fixture、camera degradation / recovery、chat / sincro mode 切替、複数 VRM replay comparison の確認結果を `impl.md` または `artifacts/` に保存する。
- `npm run tasks:check`

## ドキュメント同期の要否

要。runtime ownership と rollback / cleanup の現在仕様が変わるため、`documents/design/frontend/character/motion.md`、runtime ownership map artifact、`task-260705004418-production-motion-rollback-and-cleanup` の rollback / cleanup artifacts、必要なら `documents/research/character_animation/roadmap.md` の現在地を同期する。公開 WebRTC / backend 契約は変更しない。
