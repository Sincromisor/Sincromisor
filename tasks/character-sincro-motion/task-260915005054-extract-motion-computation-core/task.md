# 動作状態の共通計算を抽出して本番経路へ接続

## 背景 / 目的

本番の SincroMotionObserveOnlyPipeline、motion-debug の録画制御と再生制御は、共通の計算部品を利用しながら姿勢の共通表現・時系列推定・動作意図の更新を別々に組み立てている。まず共通計算の境界を実装し、本番の出力を維持して後続の検証経路へ利用可能にする。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 中。作業区分: 高リスク変更（本番の状態付き動作計算の組み立てを変更）。

依存なし。

## 完了条件（受け入れ条件）

- [ ] character/runtime に姿勢の共通表現生成と、時系列推定→動作意図推定の共通手順があり、本番経路がそれを利用する。既存の計算関数・推定器を複製しない。
- [ ] 同じ入力と初期状態で、抽出前後の canonical / temporal / intent、警告、公開要約が一致する再現可能な確認が残る。数値比較は既存テストの許容誤差を利用する。
- [ ] Pose入力だけが時系列と意図の状態を進め、Face / Hand単独更新とGesture観測更新では進めないこと、停止・モード変更・カメラ変更で状態が初期化されることを維持する。
- [ ] 計算の入力は正規化済み追跡値・信頼性・時刻などの既存契約に限定され、DOM、Worker、録画、VRM書き込み、診断管理を所有しない。

## 設計判断

既存の SincroMotionObserveOnlyPipeline は追跡観測の蓄積と公開要約の窓口として残す。重複する計算順序だけを抽出し、各実行経路が個別の推定状態を所有する。信頼性推定は既存 createPoseReliabilityMap を再利用する。後続の再生では保存済み canonical / temporal を採用する境界があるため、計算段階を個別に呼べる最小の構成とし、再生モードの分岐を共通計算へ入れない。

## スコープ境界

SincroMotionObserveOnlyPipeline の計算部分と共通実装、対象テストを変更する。motion-debug の切替は後続2タスクで行う。推定アルゴリズム・閾値・合成結果の適用・保存契約は変更しない。

## 実装の参照先

- [sincroMotionObserveOnlyPipeline.ts](../../../sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts)
- [sincroMotionPipelineState.ts](../../../sincromisor-frontend/src/character/runtime/sincroMotionPipelineState.ts)
- [canonicalArmFeatureExtractor.ts](../../../sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts)
- [canonicalTorsoFrameEstimator.ts](../../../sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts)
- [temporalStateEstimator.ts](../../../sincromisor-frontend/src/character/temporal/temporalStateEstimator.ts)
- [motionIntentEstimator.ts](../../../sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts)
- [sincroCharacterMotionEventSink.ts](../../../sincromisor-frontend/src/app/controller/sincroCharacterMotionEventSink.ts)
- [motionDebugCanonicalState.ts](../../../sincromisor-frontend/src/pages/motionDebug/motionDebugCanonicalState.ts)

## 確認方法

既存の sincroMotionObserveOnlyPipeline / sincroMotionPipelineObserveOnly / sincroMotionPipelineState テストと固定入力を利用し、連続Pose・Face/Hand更新・入力欠損・状態初期化を比較する。実際の SincroCharacterMotionEventSink→CharacterBehaviorState の接続後も同じ状態が渡る結合確認を行う。高リスク変更の独立評価と全体確認はタスク管理の作業経路に従う。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

共通計算と入力蓄積の責務を同期する。composerDryRun など既存の保存・診断キーと本番の姿勢適用契約は維持する。

- [overview.md](../../../documents/design/frontend/character/overview.md)
- [motion.md](../../../documents/design/frontend/character/motion.md)
