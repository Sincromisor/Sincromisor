# Remove semantic finger rollback hook

## 背景 / 目的

semantic / finger composer layer は production で既に既定の `"composer"` 経路で動作している。
通常動作を変えない developer rollback flag と `off` 分岐を削除し、production 経路を単一化する。

## 完了条件（受け入れ条件）

- [ ] `ComposerSemanticFingerApplicationMode`、設定 field / default、runtime field、Debug Console control、`off` 分岐、
      `semantic_finger_application_off` warning と専用 test を削除する。
- [ ] valid input では semantic / finger composer layer を常時試行する。
- [ ] invalid intent、minimal profile、hand missing の既存 suppression / warning は維持する。
- [ ] settings / replay / recording に旧 flag の保存 contract がないことを `rg` で確認する。保存 contract が存在する場合だけ、
      旧値を無視する互換 test を追加する。
- [ ] 旧 symbol / warning の参照が 0 件であること、affected tests、frontend check、task check を確認する。
- [ ] `documents/design/frontend/character/motion.md`、`overview.md`、roadmap の rollback 記述を同期する。

実カメラ baseline は削除条件にしない。既定の production 経路は既に `"composer"` であり、本変更は通常動作ではなく
developer control を削除するためである。実機確認が可能なら短い smoke test を行うが、完了の blocker にはしない。

## スコープ境界

- 本タスク: rollback flag / control / warning の削除、既存安全境界の維持、tests、docs。
- スコープ外: gesture tuning、新 semantic preset、finger mapping 変更、arm / torso fallback 復活。

## 主な変更箇所

- `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts`
- `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`
- `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerSemanticFingerLayers.ts`
- `sincromisor-frontend/src/features/debug/`

## コメントと文書

削除対象の rollback を説明する stale comment を削除または更新する。常時適用境界と、維持する
invalid intent / minimal profile / hand missing の失敗条件がコードから読み取れない場合だけコメントを補う。
