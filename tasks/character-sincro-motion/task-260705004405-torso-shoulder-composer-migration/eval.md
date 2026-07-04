# Evaluation: task-260705004405-torso-shoulder-composer-migration

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `CharacterMotionTorsoApplier` 由来の spine / chest / upperChest / shoulder 書き込みは、
  `composerTorsoShoulderApplicationMode="composer"` のとき
  `CharacterMotionOrchestrator.update()` から `composeTorsoShoulderApplication()` へ移り、
  selected bone overwrite に限定されている。`"direct"` または profile 欠損時は direct write が残る。
- [✓] `keep-controller-owned` / `needs-decision` の head / neck / leg / expression / finger は
  composer layer の owned bones と selected application 対象に含まれていない。
  runtime ownership map でも非対象 / needs-decision として同期済み。
- [✓] torso / shoulder layer は `MinimalAvatarMotionProfile.torso.distribution`
  （full `AvatarMotionProfile.torso.distribution` から転送）と optional bone capability を読み、
  missing `upperChest` / shoulder で throw しない。
- [✓] missing shoulder fallback は composer policy の same-side `upperArm` に閉じている。
  `characterMotionTorsoComposerLayer.test.ts` と replay frame `missing-shoulder-frame-004` が、
  `leftShoulder=false` で `leftUpperArm` だけに fallback し、head / neck / leg / expression / finger を
  所有しないことを確認している。
- [✓] `composerTorsoShoulderApplicationMode` は arm flag と独立した type / config field / Debug Console
  select として追加され、既定値は `"direct"`。`armBoneController.test.ts`、
  `debugConsoleSincroMotionControls.test.ts`、replay global assertion が片方の変更で片方の mode が
  変わらないことを固定している。
- [✓] Debug Console では pose retarget config に mode が保持され、rollback reason は composer dry-run
  summary warnings に合流する。profile missing / upperArm fallback / final pose missing /
  normalized node missing / invalid distribution の reason code を確認した。
- [✓] production code に full `vrm.humanoid.setNormalizedPose(finalPose)` の追加呼び出しはない。
  `VRMCharacterManager.update()` は selected bone overwrite と summary warning 合流に閉じている。
- [✓] `finalPoseOwnedBoneConflictCount` は replay JSON の全 6 frame で `0`。
  `owned_bone_conflict:*` warning なし、single tracking layer composition の実装・テストとも矛盾しない。
- [✓] `spine+chest+upperChest`、`spine+chest`、`spine only`、missing shoulder、
  Face-only recovery、profile missing rollback は
  `artifacts/torso-shoulder-composer-migration-replay.json` と
  `artifacts/torso-shoulder-composer-migration-verification.md` に replay 確認として記録された。
  Face-only recovery は stale finalPose 昇格なし、profile missing rollback は
  `composer_torso_shoulder_application_profile_missing` と direct controller write retained を記録している。
- [✓] `documents/design/frontend/character/motion.md` と runtime ownership map artifact は、
  torso / shoulder selected overwrite、fallback reason、rollback 条件、非対象 bone、arm flag 独立性を同期済み。
- [✓] TypeScript production comment audit は `impl.md` に指定列で記録され、差分上の public export /
  boundary / lifecycle / fallback decision には、入力境界・rollback・非対象 owner・副作用範囲を説明する
  TSDoc / block comment が入っている。名前や型の逐語説明だけの stale comment は差分範囲では見当たらない。

## テスト結果

- 実行コマンド: `npm run gate`
- 実行場所:
  `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-b84e5eab8949-m9BjAm`
- 対象 commit: `b84e5eab89497b2bc80ce1cc4d6098512d8c4e98`
- 結果: passed。`gate:lint` / `gate:build` / `gate:test` はいずれも clean SHA の cache hit PASS。
  `gate:test` は 445 tests passed。
- カバレッジ評価: unit test は missing `upperChest`、missing shoulder fallback、invalid distribution、
  flag 独立性、Debug Console config propagation、selected overwrite 周辺を覆う。attempt 2 の replay artifact は
  前回不足していた spine-only capability、Face-only recovery、profile missing rollback、stale finalPose 昇格なし、
  non-owned bone 非所有を補っており、受け入れ条件に対して十分。

## ドキュメント整合性

- 公開 backend / WebRTC / OpenAPI / compose / env 契約の変更はない。
- developer-visible な runtime ownership / Debug Console flag / rollback 条件は変更されており、
  `documents/design/frontend/character/motion.md` と
  `tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md`
  は同じ変更で同期済み。
- task-local verification artifact と replay JSON は attempt 2 で同期済み。
- 実装者が触れた
  `tasks/character-sincro-motion/task-260705004400-arm-composer-application-hardening/eval.md`
  は Markdown indentation の Prettier 整形のみで、評価内容の意味変更は見当たらない。

## 残課題（FAIL の場合）

- なし。

## 残リスク

- 実ブラウザ visual QA は未実行。`default.vrm` / `aoi-1.0.7.vrm` での呼吸、腕上げ、腕交差、
  Face-only recovery のモデル固有の見た目品質は後続 manual verification の残リスクとして残る。
- 評価では実装コード・実装者 test は変更していない。追加 acceptance test は作成していない。
