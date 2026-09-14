# 動作検証のライブ計算を共通化して録画処理から分離

## 背景 / 目的

MotionDebugRecordingController.recordPoseFrame は録画中でない場合にも canonical / temporal / intent と後処理を更新する。MotionDebugTrackerBridge は別に信頼性を算出し、本番と検証ページで計算の組み立てが分かれている。現行の録画停止は計算状態も初期化する。先行タスクの共通計算を利用し、録画操作から動作状態の寿命を独立させる。録画停止後も同じ入力ソースの計算状態を維持する点は、意図した挙動変更である。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 中。作業区分: 高リスク変更（ライブ計算・録画・描画の状態所有者と更新順序を変更）。

先行: [動作状態の共通計算を抽出して本番経路へ接続](../task-260915005054-extract-motion-computation-core/task.md)。先行タスクが移したファイルは移動先を参照する。

## 完了条件（受け入れ条件）

- [ ] motion-debug のライブ・動画固定入力の動作計算が共通実装を利用し、録画制御は算出済み結果の保存・開始停止・出力に専念する。
- [ ] 録画していなくても動作計算と描画用状態が進み、録画の開始停止だけではライブの推定状態を初期化しない。カメラ・入力ソース停止や切替では旧状態を持ち越さない。
- [ ] 同じ正規化済み入力・時刻・初期状態の本番とライブ検証経路で、共有する canonical / temporal / intent の結果が一致する。検証専用の保存情報と表示情報は比較から明示的に分ける。
- [ ] 録画フレームの時刻対応、重複排除、保存形式、phase6 / phase7 / phase9 / finalPose の意味、Hand欠損時の扱いを維持する。

## 設計判断

ライブの追跡接続が計算状態を所有し、録画制御は同じフレームの結果を受け取る。既存の後処理と診断保存は検証ページ側に残す。計算を揃える際は入力の到着順を維持し、録画や描画から推定器を二重に進めない。再生は別の状態所有者のままとし、適用は後続タスクで行う。

## スコープ境界

MotionDebugTrackerBridge / RecordingController / App の接続、共通表現と描画状態の橋渡し、対象テストを変更する。Worker内の推論・カメラ取得・ダウンロード形式・再生UIは対象外。

## 実装の参照先

- [motionDebugTrackerBridge.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugTrackerBridge.ts)
- [motionDebugRecordingController.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts)
- [motionDebugApp.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts)
- [motionDebugBehaviorPipeline.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugBehaviorPipeline.ts)
- [motionDebugCanonicalState.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugCanonicalState.ts)
- [motionDebugPhase6Snapshots.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugPhase6Snapshots.ts)

## 確認方法

motionDebugRecordingController / motionDebugBehaviorPipeline / motionDebugCanonicalState の既存テストを更新し、録画前・録画中・停止後の連続入力で状態が維持されることを確認する。先行タスクの固定入力を本番とライブの接続処理へ渡して共有計算結果を比較する。開発環境で既存の動画固定入力を使い、録画開始停止と記録の読み戻しを一度確認する。高リスク変更の独立評価と全体確認はタスク管理の作業経路に従う。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

ライブ計算と録画の責務・状態初期化の条件を同期する。再生ログの版・項目と個人情報を含む検証原本の公開範囲は変更しない。

- [motion.md](../../../documents/design/frontend/character/motion.md)
- [tracking.md](../../../documents/design/frontend/character/tracking.md)
