# Add production motion rollback and cleanup

## 背景 / 目的

full `setNormalizedPose(finalPose)` が pass した後も、段階 rollout 用の temporary flag、旧 direct write fallback、
debug-only comparison、rollback 手順が残る。これらを残したままだと、将来の motion 変更で所有境界が再び
曖昧になる。

本タスクでは production motion rollout の最終段として、明示 rollback 手順を文書化し、不要になった旧経路と
temporary flag を整理する。

## 完了条件（受け入れ条件）

- [ ] full normalized pose application の PASS commit / artifact を確認し、未達の場合は cleanup に入らず停止する。
- [ ] production rollback runbook を `artifacts/production-motion-rollback-runbook.md` に作成し、arm、torso / shoulder、
      semantic / finger、full finalPose の各段階へ戻す手順、確認コマンド、rollback 判定、復旧後の metric 確認を記録する。
- [ ] 段階 rollout 用の temporary flag / debug-only comparison / stale fallback path を棚卸しし、削除するもの、
      残すもの、後続 task に送るものを `artifacts/production-motion-cleanup-inventory.md` に記録する。
- [ ] 削除対象にした production code は、runtime ownership map と docs からも同時に消す。残す debug-only 経路は
      目的、削除条件、所有者を comment audit と artifact に残す。
- [ ] cleanup 後も head / neck / leg / expression の非対象境界と public WebRTC / backend 契約が変わらない。
- [ ] P0 fixture replay、camera degradation / recovery、chat / sincro mode 切替、複数 VRM の確認が full application 後と
      同等に pass する。
- [ ] `documents/design/frontend/character/motion.md`、runtime ownership map artifact、cleanup / rollback artifacts に、
      rollback 手順、temporary flag の有無、残す debug-only 経路の目的と削除条件を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、
      `symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、
      `action`、`reviewer note` に固定し、最低限 temporary flag 削除、rollback hook 残置判断、
      stale comment 削除/更新、TODO 必須情報、runtime ownership map との同期、debug-only comparison 残置判断を含める。
      audit 記録だけでは完了扱いにせず、public export / boundary / lifecycle / heuristic に必要な JSDoc/TSDoc の
      追加・更新または省略理由、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を
      実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- cleanup は full application PASS 後にだけ実施する。PASS 前に旧 direct write path を消す案は rollback 不能になるため採用しない。
- rollback 手順は task artifact に置く。README や design 本文へ長い運用ログを蓄積する案は、現在仕様と履歴が混ざるため採用しない。
- temporary flag を残す場合は、残置理由と削除条件を comment audit / artifact に必ず書く。理由なしの「念のため」残置はしない。
- public WebRTC / backend 契約、DataChannel payload、server code は本タスクの対象外とする。

## スコープ境界

- 本タスクでやること: rollback runbook、cleanup inventory、temporary code / docs cleanup、runtime ownership map 更新、
  stale comment / TODO 整理、gate / replay 確認。
- 本タスクでやらないこと: full finalPose 適用の新規実装、semantic / finger の新規 intent 追加、
  user-facing UI の新規設定導線、backend / WebRTC 契約変更。
- 依存タスクとの境界: `task-260705004415-full-normalized-pose-application` が production の新正本を作る。
  本タスクはその後の整理と rollback 手順の明文化に限定する。

## 実装方針（既存コード整合: file:line）

- Production Application Gates の rollback 条件は `documents/design/frontend/character/motion.md:468` から
  `documents/design/frontend/character/motion.md:471` を段階別に読む。
- current ownership と cleanup 対象は
  `tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md`
  を正本にする。
- arm flag の temporary setting は
  `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:76` と
  `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:302` を起点に棚卸しする。
- dry-run / stale fallback contract は
  `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts:21` と
  `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts:115` を確認する。
- Debug Console summary と pipeline state の残置判断は
  `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipelineTypes.ts:61` と
  `sincromisor-frontend/src/character/runtime/sincroMotionPipelineState.ts:46` を確認する。

## テスト

- cleanup で削除・変更した TS production code の既存 unit test を更新し、temporary flag が削除された場合は
  old flag path を参照するテストも削除または新正本へ rewrite する。
- P0 fixture replay metrics と composer metrics を full application PASS 時の artifact と比較し、regress なしを確認する。
- `npm run tasks:index`、`npm run tasks:index:check`、`npm run tasks:check` で task artifact / index の整合を確認する。
- `npm run gate` を通す。

## ドキュメント同期の要否

要。runtime ownership、rollback 手順、temporary flag の有無が変わるため、
`documents/design/frontend/character/motion.md`、runtime ownership map artifact、cleanup / rollback artifacts を同期する。
公開 WebRTC / backend 契約は変更しない。
