# 動作再生の保存値と再計算を分離して共通計算へ接続

## 背景 / 目的

MotionDebugReplayRuntime は保存済み canonical / temporal を解析して採用し、欠損した場合だけ再計算する。意図は再構成した入力から別途推定する。この検証上必要な区別を保ちながら、計算手順の重複を先行タスクの共通実装へ寄せる。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 中。作業区分: 高リスク変更（保存値の解釈と再生時の状態初期化を扱う）。

先行: [動作検証のライブ計算を共通化して録画処理から分離](../task-260915005055-share-live-motion-computation/task.md)。先行タスクが移したファイルは移動先を参照する。

## 完了条件（受け入れ条件）

- [x] 再生の計算が必要な段階は共通実装を利用し、保存値の解析・採用・欠損判断は再生側に残る。保存済み値を共通計算で無条件に上書きしない。
- [x] 保存済み reliability / canonical / temporal が無効な場合の invalid 表示と、欠損した旧ログだけを補完する規則を維持する。保存済み frame.intent と再計算した意図を混同しない。
- [x] 再計算意図へのGesture入力は同一フレームから正規化した観測だけを使い、保存済み意図や過去フレームの未加工ラベルで補完しない。
- [x] 隣接する前進だけは推定状態を継続し、非連続移動・停止・読込・入力切替では既存の時系列と意図の初期化契約を維持する。ライブ状態と再生状態を共有しない。

## 設計判断

共通化するのは計算段階だけとし、保存値の選択規則・表示・再生タイマーは MotionDebugReplayRuntime と既存の閲覧モデルに残す。保存した postProcessing は既存通り表示し、欠損時に新しく合成しない。新しいログ版、再計算モード、互換変換の枠組みは追加しない。

## スコープ境界

MotionDebugReplayRuntime の共通表現・時系列・意図の再計算呼び出し、不要になった重複、関連テストを変更する。共通計算の変更が必要なら、先行タスクの本番・ライブ比較も再確認する。

## 実装の参照先

- [motionDebugReplayRuntime.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugReplayRuntime.ts)
- [motionDebugTrackerBridge.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugTrackerBridge.ts)
- [motionDebugViewerLayerResolvers.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugViewerLayerResolvers.ts)
- [motionDebugCanonicalState.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugCanonicalState.ts)
- [motionReplayPlayer.ts](../../../sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts)

## 確認方法

motionDebugReplayRuntimeGestureIntent / motionDebugViewerParsedLayers / motionDebugViewerReliabilityCamera / motionReplayPlayer の既存テストを利用する。保存値あり・欠損・無効の小さい固定ログと非連続移動で、保存表示と再計算値を別々に確認する。開発環境で先行タスクの出力または既存固定ログを読み、前進・任意位置への移動・停止後の表示を一度確認する。高リスク変更の独立評価と全体確認はタスク管理の作業経路に従う。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

再計算の共通実装参照を同期する。保存値優先・無効値表示・旧ログ補完とログの版は維持する。

- [motion.md](../../../documents/design/frontend/character/motion.md)
- [tracking.md](../../../documents/design/frontend/character/tracking.md)

## 実装・確認結果

- 再生専用の `SincroMotionComputation` に時系列・意図の計算と初期化を委譲した。保存値の解析・採用、無効値表示、旧ログの欠損補完、同一フレームのGesture入力、保存した後処理の表示規則は維持した。canonicalは先行タスクで共通化した既存の窓口を利用する。
- 保存値あり・欠損・無効値を含む固定ログを実際の再生・追跡接続で読み込み、保存表示と再計算結果を分けて確認した。隣接前進・同一位置・後退・飛び越し・停止・読込の初期化と、別系列への影響がないことを確認した。
- 型検査・ビルド成功。全体テスト638件成功、既存2件スキップ。対象確認は5ファイル34テスト成功。構造確認と変更ファイルの整形確認も成功した。
- 先行タスクの録画テストに残った、未知の保存値への直接プロパティ参照を型安全な欠損確認へ修正した。保存の期待値と本番コードは変更していない。
- ブラウザーで先行タスクの3フレームNDJSONを読み込み、前進、0番への後退、2番への飛び越し、停止を確認した。停止後は再計算した時系列・意図が消え、閲覧画面には保存した時系列がavailableのまま残る。最終フレームのcanonicalとtemporalは同じ映像時刻 `18547.153000000002 ms` だった。VRM表示と再生停止表示も確認した。
- 全体ゲートは既存の対象外Markdown整形不整合15件で停止した。今回変更した文書は整形済み。検証原本と画面は `/tmp` に保持し、コミットに含めない。
- コメント点検: PASS（保存値優先、無効値の扱い、共通計算の所有者、時系列・意図の同時初期化、Gesture入力境界を確認）。

- 独立評価: PASS。対象5ファイル34テストと変更Markdown3件の整形確認に成功した。
