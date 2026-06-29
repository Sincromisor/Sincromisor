# Add feature flag for composer arm application

## 背景 / 目的

dry-run と metrics comparison が揃った後、いきなり全面 `setNormalizedPose(finalPose)` へ移行するのは危険である。まず腕だけ、かつ明示的な developer flag のときだけ composer result を適用できる実験経路を作る。

## 完了条件（受け入れ条件）

- [ ] `SincroPoseRetargetConfig` に `composerArmApplicationMode: "off" | "left" | "right" | "both"` を追加し、既定は `"off"` に固定する。Debug Console の既存 pose retarget config 経路から変更できるようにする。
- [ ] `"off"` では現行の `ArmBoneController` direct write と完全に同じ経路を維持する。
- [ ] `"left"` / `"right"` / `"both"` では対象腕の `upperArm` / `lowerArm` / `hand` のみ composer result 由来 quaternion を適用し、対象外腕は既存 direct write を維持する。
- [ ] 適用は `VrmPoseComposerResult.finalPose` の該当 bone が存在し、dry-run status が `available` の frame に限る。欠損時は既存 direct write に fallback し、warning を Debug Console に出す。
- [ ] torso / shoulder / finger / head / expression は本タスクでは composer 適用しない。shoulder fallback が composer result に含まれていても適用対象外にする。
- [ ] flag 切替時に前 frame の composer pose が残留しない。mode 変更時は previous final pose / arm application state を reset する。
- [ ] production TypeScript comment audit を実施し、flag の実験性、fallback 条件、対象 bone 限定、reset 条件を保守コメントへ記録する。
- [ ] `impl.md` に comment audit table を記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、対象は `SincroPoseRetargetConfig.composerArmApplicationMode`、default `"off"`、Debug Console config path、対象 bone 限定、fallback to direct write、mode change reset、`setNormalizedPose()` を呼ばない判断を必ず含める。
- [ ] audit の `decision` は `keep` / `rewrite` / `delete` / `add` に限定する。弱い既存コメント、実装と矛盾した stale comment、名前・型から分かるだけのコメントは `rewrite` または `delete` にする。コメントを省略する場合は省略理由を audit に書く。TODO を追加する場合は理由、削除条件、canonical task ID、判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- flag は `SincroPoseRetargetConfig` に置き、既存 Debug Console pose retarget config 経路で操作する。通常設定 UI には出さない。一般ユーザー向け挙動として安定していないため。
- `SincroPoseRetargetConfig` に置く案を採用し、別 Debug Console 専用 store を作る案は採用しない。`VRMCharacterManager.setSincroPoseRetargetConfig()` という既存の runtime config 反映口を再利用でき、設定経路が分裂しないため。
- 適用対象は arm 3 bone に限定する。shoulder / torso を含めると `CharacterMotionOrchestrator` と衝突するため採用しない。
- `setNormalizedPose(finalPose)` の全面呼び出しはしない。既存 direct write と混在する実験段階では、対象 bone node への限定適用に留める。

## スコープ境界

- 本タスクでやること: feature flag、腕限定適用、fallback / reset、Debug Console status。
- 本タスクでやらないこと: torso / shoulder 移行、finger / semantic 適用、通常 UI 露出、全面 `setNormalizedPose()`。
- 依存タスクとの境界: comparison task が適用判断の材料を提供する。本タスクは明示 flag の実験経路を作る。

## 実装方針（既存コード整合: file:line）

- `ArmBoneController.update()` は現行腕適用の入口である（`sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:31`）。
- `applyArmBoneRotations()` は world IK では quaternion を直接 bone に copy している（`sincromisor-frontend/src/character/vrmCharacter/armBoneRotationPose.ts:119`）。
- `VRMCharacterManager.setSincroPoseRetargetConfig()` は Debug Console から retarget config を受け取る既存口である（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:259`）。
- `VrmPoseComposerResult.finalPose` は `VRMHumanBoneName` keyed quaternion plain object である（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:48`）。

## テスト

- `cd sincromisor-frontend && npm run test -- armBoneController`
- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer flag で本番表示の腕挙動を変えられるため、`documents/design/frontend/character/motion.md` と Debug Console 関連設計に experimental flag、既定 off、対象 bone、fallback 条件を同期する。
