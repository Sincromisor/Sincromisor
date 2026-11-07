# 手の形状計算をROIと画像比率から独立させる

## 背景 / 目的

ROI復元はx/yだけを拡縮し、zを切り抜き画像の尺度に残していた。また画像の縦横それぞれで正規化した値をそのまま3D距離へ使うため、同じ手でもROIや画像比率で掌方向・指の特徴が変わる。

## 完了条件

- [x] 画像座標のzをROI幅に合わせて全画面へ復元する。
- [x] 左右割当の手首は画像座標、形状の距離・方向計算は同一単位のworldLandmarksへ分ける。
- [x] 3D観測が欠損・非有限・退化した場合は警告と不明の特徴量を返し、画像座標を3Dの代替にしない。
- [x] 同じ3D形状を異なるROI・画像比率で表した合成入力で、掌方向・指特徴・左右割当が一致する。
- [x] ライブと未加工結果の再生が共通正規化を使うことを確認し、設計と回帰試験を同期する。

## 範囲と確認

手の正規化・特徴量・型の説明と追跡設計が対象。保存形式は維持する。旧ログを再計算する際、worldLandmarksが無い手の形状は不明となり、修正前と数値一致しない。保存値の閲覧は維持する。合成データによるVitest、TypeScript、Biomeと文書・タスク整合性を確認する。実写データや実カメラによる精度測定は対象外。

根拠（2026-11-07確認）: [Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web)は画像座標と手中心原点のメートル座標を別々に返す。[公式座標投影](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/calculators/util/landmark_projection_calculator.cc)はzをROI幅で拡縮する。

## 実施結果

画像のz復元をROI幅へ揃え、3D特徴はworldLandmarksへ分離した。不正な3D観測は既定の不明特徴へ戻る。正規化のライブ2経路と未加工結果再生の共通呼出しを確認した。`npm run test -- sincroHand motionReplayRawResult` は17件成功。合成3D形状を3種類の画面比率・3種類のROI幅で比較し、掌・指特徴と左右割当の一致を確認した。TypeScript、対象Biome、Markdownとタスク整合性は成功。Biomeの既存の左右割当の複雑度警告2件は対象外で変更していない。実カメラ測定は未実施。コメント点検: PASS。
