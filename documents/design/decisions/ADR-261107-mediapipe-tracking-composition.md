# ADR-261107 MediaPipe追跡構成の選択

## 要約

- Face / Pose / Handの個別Landmarker構成を維持する。
- HolisticはWebで利用できる。未提供という過去の調査を不採用理由にしない。
- 現行APIの顔変換行列と部位別の実行制御の差を判断根拠とし、処理速度の優劣は未測定とする。
- 実行時の契約は[キャラクター追跡](../frontend/character/tracking.md)を参照する。

## 状態

採用。確認日: 2026-11-07。比較対象: 導入済み `@mediapipe/tasks-vision` 1.1.1の公開型と公式Web API。

## 背景

[旧調査](../../research/character_animation/report01.md#31-pose--hand--face-を分離して使い統合層を自前で持つ)は、Holisticの更新版が近日公開であることを個別構成の根拠にしていた。この前提は現在には適用しない。公式ページはWeb向けの `HolisticLandmarker` とデモを提供しており、1.1.0の更新履歴にも顔未検出時のHolistic修正がある。

本サービスは顔の姿勢・表情と身体を別の頻度で取得し、負荷上昇時に手や姿勢を休止しても顔追跡を継続する。頭部の標準化はFaceLandmarkerの変換行列を主入力にする。この既存契約に対して、公開APIで置換できる範囲を比較した。モデルの実測性能や精度は今回の判断範囲に含めない。

## 比較

| 観点          | 個別Landmarkerと現在の統合処理                                           | Holistic 1.1.1の公開API                                                                |
| ------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 顔の観測      | ランドマーク、表情、`facialTransformationMatrixes`                       | ランドマークと任意の表情。顔変換行列の出力はない                                       |
| 身体と手      | Poseの画像・メートル座標、Handの画像・メートル座標と左右候補を自前で統合 | Poseと左右別Handの画像・メートル座標をまとめて返す                                     |
| 実行制御      | Face / Pose / Handそれぞれの頻度と休止を制御できる                       | `detectForVideo()`単位でまとめて処理する。部位別の実行頻度・休止の公開オプションはない |
| ROIと左右割当 | アプリが切り抜き、復元、Pose手首との割当を保守する                       | 統合処理へ委ねられる。独自ROI・割当処理を削減できる候補                                |
| 速度・精度    | 現行経路の計測機構がある                                                 | 同条件での比較測定は未実施。統合しただけで高速・高精度とは判断しない                   |

APIの項目は導入済みパッケージの `HolisticLandmarkerOptions` / `HolisticLandmarkerResult` と[公式の結果型](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.holisticlandmarkerresult)を照合した。頭部行列と実行制御が現行契約を満たさないという評価は、本プロジェクトの利用箇所と照合した判断である。

## 決定と選択肢

個別構成を維持する。Holistic単独への置換は、頭部姿勢の算出方式と負荷時の顔追跡継続を同時に変更するため、単なる依存更新として扱わない。

| 選択肢                         | 利点                               | 今回採用しない場合の理由                                         |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| 個別構成を維持                 | 顔変換行列と部位別実行を維持できる | 採用。ROI・左右割当の保守負担は残る                              |
| Holistic単独へ置換             | 統合ROI・左右別出力を利用できる    | 顔行列の代替算出と実行制御の再設計が必要                         |
| HolisticとFaceLandmarkerを併用 | 頭部行列を維持できる               | 顔の重複推論が生じる。既存経路より負荷が減るという測定根拠がない |

## 影響と見直し条件

追跡実装と配布モデルは変更しない。「個別構成が最速」「Holisticが不安定・未提供」とは位置づけない。ROI座標変換や左右割当の不具合は個別構成の保守責任として扱う。

Holisticが顔変換行列や部位別の休止を提供する場合、またはアプリの契約を変更する場合に再比較する。比較実装を行う際は、同一の利用許可済み映像・端末・描画負荷で、推論時間、メモリー、左右入替、欠損からの復帰、負荷時の顔追跡継続を確認する。実測するまでは性能上の採用優位を主張しない。

## 参照

- [Holistic公式Web説明とデモ](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker)
- [Holistic Web結果型](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.holisticlandmarkerresult)
- [MediaPipe 1.1.0更新履歴](https://github.com/google-ai-edge/mediapipe/releases/tag/v1.1.0)
- [FaceLandmarkerの生成設定](../../../sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts)
- [部位別実行計画](../../../sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePredictionPlan.ts)
- [頭部の標準化入力](../../../sincromisor-frontend/src/character/canonical/canonicalHeadFeatureExtractor.ts)
