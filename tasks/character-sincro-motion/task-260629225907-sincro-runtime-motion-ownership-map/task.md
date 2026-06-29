# Map current sincro runtime motion ownership

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の最終形は `VrmPoseComposer` を final pose の唯一の書き手にすることを要求している。一方、現行 `sincro` 本番経路は `VRMCharacterManager.update()` から複数 controller が normalized bone node を直接更新しており、`VrmPoseComposer` は developer-only path に留まっている。

本タスクでは実装変更の前段として、現行 runtime がどの bone / expression / root position を誰の責務で書いているかを artifact と設計文書に整理する。以後の observe-only / dry-run / 実適用タスクが二重書き込みを避けるための正本にする。

## 完了条件（受け入れ条件）

- [ ] `artifacts/runtime-motion-ownership-map.md` を作成し、`VRMCharacterManager.update()` の呼び出し順に、書き手、対象 bone / expression / root position、入力 snapshot、既存 fallback、`sincro` / `chat` での有効条件を表で記録する。
- [ ] map は最低限 `HeadBoneController`、`EyeBehaviorController`、`FaceMorphController`、`FaceEmotionController`、`ArmBoneController`、`LegBoneController`、`CharacterMotionOrchestrator`、`CharacterMotionTorsoApplier`、`SincroPoseRetargeter`、`SincroFaceRetargeter` を含む。
- [ ] `VrmPoseComposer` へ将来移す候補を `move-to-composer`、既存 controller 所有を維持する候補を `keep-controller-owned`、追加調査が必要な候補を `needs-decision` として分類する。
- [ ] `needs-decision` には、決めるべき所有境界、衝突する既存書き手、後続タスクでの判断先を 1 行で記録する。
- [ ] `documents/design/frontend/character/motion.md` に artifact への導線と、現時点では本番書き込み順序を変更しないことを同期する。
- [ ] TypeScript production code は変更しない。もし調査中にコードコメントの誤りを見つけた場合も本タスクでは修正せず、artifact の follow-up に記録する。

## 設計判断（着手前に確定済み）

- ownership map の正本は task artifact とし、設計文書には要約と導線だけを置く。設計本文に大きな表を直接埋めると移行中の詳細が stale になりやすいため採用しない。
- 対象は本番 `simple-vrm` / `sincro` runtime に限定する。`motion-debug` の replay / final-pose-playback 専用経路は参照するが、所有権表の主対象にはしない。
- `VRMHumanBoneName` の標準名を表記に使う。raw glTF node 名や VRoid 固有名は、モデル差分に弱いため正本にしない。

## スコープ境界

- 本タスクでやること: 現行 runtime 書き手の調査、artifact 化、設計文書への導線追加。
- 本タスクでやらないこと: production code の変更、`VrmPoseComposer` の接続、feature flag 追加、baseline recording 作成。
- 後続タスクとの境界: `production-sincro-motion-pipeline-state-contract` はこの map を前提に live state の置き場所を決める。`torso-shoulder-composer-ownership-migration-plan` はこの map の torso / shoulder 部分を移行計画へ落とす。

## 実装方針（既存コード整合: file:line）

- `VRMCharacterManager.initializeVrmControllers()` は head / arm / leg / motion / expression / eye controller を生成している（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:133`）。
- `VRMCharacterManager.update()` は `SincroPoseRetargeter.retarget()` 後に各 controller を更新し、`vrm.update(deltaSeconds)` を呼ぶ（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:193`）。
- `ArmBoneController.update()` は IK active の腕で speech gesture を抑制し、arm / hand bone を直接更新する（`sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:31`）。
- `applyArmBoneRotations()` は `Object3D.rotation` または `Object3D.quaternion` を直接書いている（`sincromisor-frontend/src/character/vrmCharacter/armBoneRotationPose.ts:37`）。
- 設計文書は `VrmPoseComposer` v1 を developer-only path とし、本番 bone 書き込み順序は変更しないと明記している（`documents/design/frontend/character/motion.md:172`）。

## テスト

- `npm run tasks:check`
- `npm run tasks:index:check`
- TypeScript production code を変更しないため frontend build / test は不要。設計文書リンクと task 整合性を task tooling で確認する。

## ドキュメント同期の要否

要。実装挙動は変えないが、後続の本番組み込み判断の前提となる developer-facing 設計情報を追加するため、`documents/design/frontend/character/motion.md` に artifact への導線と現在の所有境界の要約を同期する。
