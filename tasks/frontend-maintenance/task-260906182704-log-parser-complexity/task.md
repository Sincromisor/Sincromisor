# 動作記録の先頭行と後続行の検証を分離する

## 背景 / 目的

ユーザーが求めた Biome の `noExcessiveCognitiveComplexity` 調査に基づく。parseMotionDebugLogLines が全行のループで先頭行と後続行を繰り返し判定し、到達しない状態も含めて記録順序の規則を追う必要がある。

## 完了条件

- [ ] 先頭行で記録情報を確定し、以降をフレームとして検証する。既存の受理条件、最初のエラーのコード・行番号・文言、フレーム順を維持する。
- [ ] 対象テスト、型検査、変更ファイルの Biome と Markdown 整形、タスク検査が成功する。

## 実装方針と範囲

対象はフロントエンドの motionEvaluation/motionDebugLogSchema.ts と抽出する行検証モジュール。`run-task` の通常変更として親が現在の作業ツリーで実装する。依存タスクはない。閾値変更や警告抑制は行わない。

## 確認方法

motionDebugLogSchema、motionDebugRecorder、motionReplayPlayer、motionQaRegression と行順エラーの回帰テスト。フロントエンドで `npx tsc -p tsconfig.modern.json --noEmit` と対象の `npx biome check` を実行する。

## 文書同期

内部処理の整理であり、公開契約と設計上の責務は維持するため設計文書の変更は不要。
