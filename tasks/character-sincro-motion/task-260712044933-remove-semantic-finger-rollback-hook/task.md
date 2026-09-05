# 意味に基づく動作と指の切り戻しフックを削除

## 背景 / 目的

意味に基づく動作 / 指姿勢合成処理層は本番で既に既定の `"composer"` 経路で動作している。
通常動作を変えない開発者切り戻しフラグと `off` 分岐を削除し、本番経路を単一化する。

## 完了条件（受け入れ条件）

- [ ] `ComposerSemanticFingerApplicationMode`、設定フィールド / 既定、実行時フィールド、診断 Console 制御、`off` 分岐、
      `semantic_finger_application_off` 警告と専用テストを削除する。
- [ ] 有効入力では意味に基づく動作 / 指姿勢合成処理層を常時試行する。
- [ ] 無効意図、最小プロファイル、手欠損の既存抑制 / 警告は維持する。
- [ ] 設定 / 再生 / 記録に旧フラグの保存契約がないことを `rg` で確認する。保存契約が存在する場合だけ、
      旧値を無視する互換テストを追加する。
- [ ] 旧シンボル / 警告の参照が 0 件であること、影響するテスト、フロントエンド確認、タスク確認を確認する。
- [ ] `documents/design/frontend/character/motion.md`、`overview.md`、取り組み計画の切り戻し記述を同期する。

実カメラ基準は削除条件にしない。既定の本番経路は既に `"composer"` であり、本変更は通常動作ではなく
開発者制御を削除するためである。実機確認が可能なら短い動作確認を行うが、完了の停止要因にはしない。

## スコープ境界

- 本タスク: 切り戻しフラグ / 制御 / 警告の削除、既存安全境界の維持、テスト、文書。
- スコープ外: ジェスチャー調整、新意味に基づく動作のプリセット、指対応付け変更、腕 / 体幹代替処理復活。

## 主な変更箇所

- `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts`
- `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`
- `sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerSemanticFingerLayers.ts`
- `sincromisor-frontend/src/features/debug/`

## コメントと文書

削除対象の切り戻しを説明する古くなったコメントを削除または更新する。常時適用境界と、維持する
無効意図 / 最小プロファイル / 手欠損の失敗条件がコードから読み取れない場合だけコメントを補う。
