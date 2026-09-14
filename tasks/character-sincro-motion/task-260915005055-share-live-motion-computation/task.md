# 動作検証のライブ計算を共通化して録画処理から分離

## 背景 / 目的

MotionDebugRecordingController.recordPoseFrame は録画中でない場合にも canonical / temporal / intent と後処理を更新する。MotionDebugTrackerBridge は別に信頼性を算出し、本番と検証ページで計算の組み立てが分かれている。現行の録画停止は計算状態も初期化する。先行タスクの共通計算を利用し、録画操作から動作状態の寿命を独立させる。録画停止後も同じ入力ソースの計算状態を維持する点は、意図した挙動変更である。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 中。作業区分: 高リスク変更（ライブ計算・録画・描画の状態所有者と更新順序を変更）。

先行: [動作状態の共通計算を抽出して本番経路へ接続](../task-260915005054-extract-motion-computation-core/task.md)。先行タスクが移したファイルは移動先を参照する。

## 完了条件（受け入れ条件）

- [x] motion-debug のライブ・動画固定入力の動作計算が共通実装を利用し、録画制御は算出済み結果の保存・開始停止・出力に専念する。
- [x] 録画していなくても動作計算と描画用状態が進み、録画の開始停止だけではライブの推定状態を初期化しない。カメラ・入力ソース停止や切替では旧状態を持ち越さない。
- [x] 同じ正規化済み入力・時刻・初期状態の本番とライブ検証経路で、共有する canonical / temporal / intent の結果が一致する。検証専用の保存情報と表示情報は比較から明示的に分ける。
- [x] 録画フレームの時刻対応、重複排除、保存形式、phase6 / phase7 / phase9 / finalPose の意味、Hand欠損時の扱いを維持する。

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

## 実装・確認結果

- 追跡接続が本番の観測パイプラインと検証専用の後処理を所有し、録画は同一Poseフレームの算出結果だけを保存する。録画停止で履歴を初期化する旧処理と、不完全な描画状態の合流関数を削除した。
- 本番の観測経路と実際のライブ追跡接続へ同じ固定入力・到着順を渡し、共有状態全体の一致、録画前・中・後の継続、ソース停止後の初期化、Hand欠損、重複排除、保存ログの読み戻しを確認した。先行タスクの本番イベント窓口の接続テストも成功した。
- 型検査・ビルド成功。全体テスト636件成功、既存2件スキップ。構造確認と変更ファイルの整形確認を実施した。
- ブラウザーで既存の動画固定入力APIに合成動画を読み込み、実際のMediaPipe追跡、3フレーム以上の録画、停止後の時系列更新、NDJSONダウンロードと読み戻しに成功した。人物を含まない動画なので検出姿勢の一致は固定入力テストで確認し、実カメラは未確認。
- 検証動画のSHA-256: `b2bc46d974898339a3713b0a299f92de5ee4c113ed34490895bc0ccf410556f2`。動画は作業用の非公開領域、録画原本は `/tmp/sincro-live-recording.ndjson` に保持し、公開成果物に含めない。
- 全体ゲートは既存の対象外Markdown整形不整合15件で停止した。今回変更した文書は整形済み。コメント点検: PASS（計算・描画・保存の順序と所有者、停止境界、時刻対応、欠損時の扱いを確認）。

- 独立評価: PASS。対象8ファイル50テストと変更Markdown3件の整形確認に成功した。
