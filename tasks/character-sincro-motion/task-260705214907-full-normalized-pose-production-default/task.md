# Promote full normalized pose application default

## 背景 / 目的

roadmap は production 表示で `VrmPoseComposer` full normalized pose application まで実装済みだが、Debug Console 限定 rollback hook と段階別 fallback path は削除条件を満たすまで残す、と整理している。現行 default はまだ `fullNormalizedPoseApplicationMode: "off"` であり、arm / torso / shoulder の staged writer が production default path を担っている。

本タスクでは fallback hook を削除せず、まず full normalized pose application を production default に昇格する。これにより、後続の fallback 削除タスクが「常時有効化後に継続 PASS」という削除条件を検証できる状態にする。

## 完了条件（受け入れ条件）

- [ ] `DEFAULT_SINCRO_POSE_RETARGET_CONFIG.fullNormalizedPoseApplicationMode` の既定値を `"upper_body"` に変更する。
- [ ] `composerArmApplicationMode` と `composerTorsoShoulderApplicationMode` は本タスクでは削除せず、Debug Console 限定 rollback hook として残す。既定値は full application success path では使われないが、full unavailable 時の staged rollback では従来どおり使えること。
- [ ] `VRMCharacterManager.update()` の通常 success path では `fullApplication.applied === true` となり、同 frame の `ArmBoneController.update()` と `motionOrchestrator.update()` による upper-body direct write は呼ばれない。
- [ ] full application が `not_ready`、`invalid_input`、`missing_profile`、`result_missing`、`vrm_missing` の場合は、現行どおり identity clear 後に staged rollback path を使う。fallback 削除は後続 task に残す。
- [ ] Debug Console summary は default `"upper_body"` 適用時に `full upper_body applied` を表示し、rollback 時は既存 reason code を表示する。
- [ ] 通常設定 UI、URL query、env、backend API、保存設定 contract には `fullNormalizedPoseApplicationMode` を公開しない。Debug Console の developer control 境界に限定する。
- [ ] P0 replay fixture、camera degradation / recovery、chat / sincro mode 切替、複数 VRM replay / browser smoke で full application default の regression がないことを `impl.md` または `artifacts/` に記録する。
- [ ] `documents/design/frontend/character/motion.md`、runtime ownership map artifact、production motion cleanup inventory に、full application が production default になったこと、staged rollback hook は後続削除条件を満たすまで残すことを同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、少なくとも default mode 変更、staged rollback 残置判断、Debug Console 限定境界、identity clear fallback、非対象 controller 維持を含める。
- [ ] comment audit 記録だけでは完了扱いにしない。runtime boundary、lifecycle / fallback decision、developer flag の保守知識に必要な JSDoc/TSDoc の追加・更新、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- 本タスクは default を `"upper_body"` に変えるだけで、rollback flags と staged fallback は削除しない。削除条件の確認と code removal を同時に行うと rollback 不能になるため採用しない。
- full application unavailable 時は現行 staged rollback を維持する。default 昇格直後は実カメラ / 複数 VRM 差分の追加確認が必要であり、failure path を同時に消さない。
- `fullNormalizedPoseApplicationMode` は Debug Console 限定 developer flag のままにする。通常設定 contract へ公開すると user-facing 設定移行と QA が別問題として混ざるため採用しない。
- head / expression / leg / root position は full upper-body finalPose の対象外として維持する。
- 公開 WebRTC / backend 契約、DataChannel payload、server code は変更しない。

## スコープ境界

- 本タスクでやること: full application default 昇格、success / rollback path のテスト更新、Debug Console summary 確認、P0 / browser smoke、docs / ownership map / cleanup inventory sync。
- 本タスクでやらないこと: staged fallback path / rollback flags の削除、canonical temporal arm solver の primary 化、Gesture reliability、new UI setting、backend / WebRTC 契約変更。
- 依存タスクとの境界: `task-260705004415-full-normalized-pose-application` が full application 実装を提供し、`task-260705004418-production-motion-rollback-and-cleanup` が rollback runbook / cleanup inventory を提供済み。本タスクは削除条件を満たすための default 昇格に限定する。

## 実装方針（既存コード整合: file:line）

- 現行 default は `fullNormalizedPoseApplicationMode: "off"` である（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:173`、`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:176`）。
- `VRMCharacterManager.update()` は composer dry-run 後に full normalized pose application を実行している（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:300`、`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:314`）。
- full application success 時、arm direct writer は呼ばれない（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:323`）。
- full application success 時、torso / shoulder direct writer は呼ばれない（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:357`）。
- 設計文書は現在、既定 `"off"` は段階別 application path を維持すると説明している（`documents/design/frontend/character/motion.md:541`）。本タスクで default `"upper_body"` と staged rollback 残置へ更新する。
- cleanup inventory は full application 常時有効化を follow-up candidate としている（`tasks/character-sincro-motion/task-260705004418-production-motion-rollback-and-cleanup/artifacts/production-motion-cleanup-inventory.md`）。

## テスト

- `cd sincromisor-frontend && npm run test -- vrmCharacterManager sincroVrmPoseComposerDryRun armBoneController motionComposerComparisonMetrics`
- `cd sincromisor-frontend && npm run test -- motionDebugPhase6Snapshots debugConsoleSincroMotionControls`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- P0 replay fixture、camera degradation / recovery、chat / sincro mode 切替、複数 VRM browser smoke の確認結果を `impl.md` または `artifacts/` に保存する。
- `npm run tasks:check`

## ドキュメント同期の要否

要。production default と rollback hook の現在仕様が変わるため、`documents/design/frontend/character/motion.md`、runtime ownership map artifact、`task-260705004418-production-motion-rollback-and-cleanup` の cleanup inventory / rollback runbook を同期する。公開 WebRTC / backend 契約は変更しない。
