# 動作履歴の特徴量集計を責務ごとに整理する

## 背景 / 目的

ユーザーが求めた Biome の `noExcessiveCognitiveComplexity` 調査に基づく。aggregateSideFeatures が意図の継続、追跡欠損、手首反転、手の開閉という独立した履歴を1ループで管理し、状態の更新条件を読み分けにくい。

## 完了条件

- [ ] 履歴保持と特徴量計算を分け、特徴ごとの前回値を局所化する。欠損を挟む継続、同長の意図の優先順、時間逆行時の初期化、保持件数を維持する。
- [ ] 対象テスト、型検査、変更ファイルの Biome と Markdown 整形、タスク検査が成功する。

## 実装方針と範囲

対象はフロントエンドの motionPostProcessing/motionSequenceWindow.ts と抽出する特徴量集計モジュール。`run-task` の通常変更として親が現在の作業ツリーで実装する。依存タスクはない。閾値変更や警告抑制は行わない。

## 確認方法

motionPostProcessing の既存テストと欠損を挟む特徴量の回帰テスト。フロントエンドで `npx tsc -p tsconfig.modern.json --noEmit` と対象の `npx biome check` を実行する。

## 文書同期

内部処理の整理であり、公開契約と設計上の責務は維持するため設計文書の変更は不要。
