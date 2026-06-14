# 単眼姿勢推定 / MediaPipe 運用 調査依頼

## 目的

Sincromisor の `sincro` モードで、単眼 Web カメラから得た MediaPipe Pose / Hand / Face / Gesture の出力を、キャラクター上半身モーションの観測値として安全に使うための設計を検証する。

MediaPipe を標準候補としている最大の理由は、技術性能だけではなく、Apache-2.0 ライセンスでプロジェクトへ組み込みやすいことである。調査ではこの前提を崩さず、MediaPipe 出力をそのまま骨格姿勢として使うのではなく、不確実性を持つ観測値として扱い、信頼度推定、ROI 化、fallback、代替モデル比較に必要な判断材料を整理してほしい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、単眼 Web カメラで撮影したユーザーの頭、体幹、肩、腕、手首、指の動きを、VRM 1.0 / VRoid Studio 系キャラクターへ反映する。

目的は人体の完全再現ではなく、会話中のキャラクターがユーザーの動作意図を自然に「ものまね」しているように見えることである。既存資料では、MediaPipe landmark を VRM bone へ直接流し込まず、次のような中間層を置く方針としている。

```text
MediaPipe observations
  -> Reliability map
  -> Body-local canonical state
  -> Temporal state estimation
  -> Motion intent / style
  -> Avatar profile
  -> IK / FK / VRM pose
```

## 前提技術

- 実行環境: Web browser
- 入力: 単眼 Web カメラ
- 推定: MediaPipe Pose Landmarker、Hand Landmarker、Face Landmarker、Gesture Recognizer
- 採用前提: MediaPipe は Apache-2.0 ライセンスであることを主要な選定理由とする
- 描画: Three.js + `@pixiv/three-vrm`
- モデル: VRM 1.0 / VRoid Studio 系モデル
- 主な対象: 上半身、頭部、肩、腕、手首、指
- 非対象: 下半身歩行、full-body IK、オフライン高品質モーション生成

## 調査してほしいこと

### MediaPipe 出力の信頼度

次の出力について、キャラクターモーション用途で信用できる条件と、信用しない方がよい条件を整理してほしい。

- Pose の 2D landmarks
- Pose の world landmarks
- Pose の `visibility` / `presence`
- Hand の landmarks / world landmarks
- Hand の handedness
- Face の landmarks
- Face の transformation matrix
- Gesture Recognizer の gesture label / confidence

特に、単眼カメラで不安定になりやすい奥行き、肘方向、手首 roll、手の遮蔽、左右入れ替えについて、信頼度推定に使える指標を知りたい。

### Pose 起点 Hand / Face ROI 化

既存資料では、Pose を full-frame で実行し、Pose wrist / face region から Hand / Face の ROI を切る設計を候補にしている。

調査してほしい論点は次である。

- full-frame Hand / Face と Pose-seeded ROI の使い分け。
- 手が小さい、速く動く、顔の近くにある、腕が交差する場合の効果。
- ROI 座標を full-frame 座標へ戻す際の注意点。
- handedness を Hand の結果だけに依存せず、Pose wrist と時系列 ID で補正する方法。
- ROI 経路が失敗した場合の fallback。

### 信頼度推定に使う追加指標

既存資料では、MediaPipe confidence だけでは不十分とし、次のような指標を組み合わせる案を挙げている。

- border proximity
- bone length consistency
- temporal innovation
- segmentation consistency
- body scale consistency
- detection / tracking state

これらの妥当性、計算方法、優先順位、誤検出しやすい条件を整理してほしい。

### 代替モデル・補助モデル

MediaPipe を標準候補とする主理由は、Apache-2.0 ライセンスにより Sincromisor へ組み込みやすいことである。代替モデルは、精度や速度が高くても、ライセンス、再配布条件、モデル weight の利用条件、商用・公開プロダクトへの組み込み可否が合わなければ採用候補から外す。

この前提で、比較対象として次を再評価してほしい。これは一般的な姿勢推定モデルサーベイではない。採用候補は、ライセンス、再配布、モデル weight の利用条件、Web 実行が Sincromisor の公開プロダクトに適合するものに限定する。それ以外は、MediaPipe の弱点理解のための参考調査に留める。

- MoveNet
- RTMPose / MMPose 系
- OpenPose 系
- MediaPipe Holistic 相当の構成
- 2026 年時点で Web 実行可能で、採用条件を満たす可能性がある姿勢・手・顔推定モデル

採用候補としてだけでなく、MediaPipe の弱点を補う調査観点として比較してほしい。ただし、比較表では技術性能より前にライセンス適合性を確認し、Apache-2.0 相当の扱いやすさがないものは「参考調査」または「非採用候補」として明示してほしい。

## 期待成果物

- MediaPipe 出力ごとの信頼度設計表。
- Pose / Hand / Face / Gesture の推奨実行構成。
- ROI 化すべき条件、不要な条件、fallback 条件。
- 単眼カメラ由来の不確実性と、それを下流へ伝える `ReliabilityMap` 案。
- 代替モデル比較表。ライセンス、再配布条件、モデル weight の利用条件、Web 実行可否、性能、精度、実装コストを含める。
- Sincromisor で最初に実装すべき最小構成と、将来拡張の候補。

## 読んでほしい資料

- [roadmap.md](roadmap.md)
- [report01.md](report01.md)
- [report02.md](report02.md)
- [report03.md](report03.md)
