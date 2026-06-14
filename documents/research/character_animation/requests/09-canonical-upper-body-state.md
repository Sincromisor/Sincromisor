# CanonicalUpperBodyState / 座標系 調査依頼

## 目的

Sincromisor の `sincro` モードで、MediaPipe 由来の観測値を、IK、時系列推定、semantic motion、VRM pose 適用が共有できる `CanonicalUpperBodyState` へ変換するための座標系、値域、入力優先順位、debug 表示を設計する。

この調査は、後段の IK、フィルタ、metrics、VRM 適用で語彙と単位がずれないようにするための中核である。MediaPipe landmark を直接 VRM bone へ渡すのではなく、体幹基準の意味量へ正規化する設計を固めてほしい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、単眼 Web カメラで撮影したユーザーの上半身、頭、腕、手首、指の動きを、VRM 1.0 / VRoid Studio 系キャラクターへ反映する。

既存資料では、MediaPipe Pose / Hand / Face / Gesture の出力を「骨格姿勢の正解値」ではなく「不確実な観測値」として扱い、次の流れで最終 motion を作る方針としている。

```text
MediaPipe observations
  -> Reliability map
  -> Body-local canonical state
  -> Temporal state estimation
  -> Motion intent / style
  -> Avatar profile
  -> IK / FK / VRM pose
```

`CanonicalUpperBodyState` は、このうち body-local canonical state を担う。ここが曖昧だと、腕の `forwardness`、IK target、filter の単位、metrics の意味、AvatarMotionProfile の scale が後段ごとにずれる。

## 前提技術

- 入力: MediaPipe Pose / Hand / Face / Gesture observations
- 入力品質: `ReliabilityMap` による joint / part ごとの weight
- 出力: IK、TemporalStateEstimator、MotionIntent、AvatarMotionProfile が共有する中間状態
- 実行環境: Web browser
- 対象: 頭、体幹、肩、腕、手首、指
- 非対象: VRM bone rotation の最終適用、full-body IK、下半身歩行

## 調査してほしいこと

### 座標系

MediaPipe の画像座標、world landmarks、カメラ空間、体幹ローカル空間、VRM normalized local pose を混同しないための座標系を定義してほしい。

調査してほしい論点は次である。

- camera / image / MediaPipe world / body-local / avatar-local の責務分離。
- 各空間の軸方向、単位、原点。
- 左右反転、カメラ鏡像表示、VRM 表示側反転の扱い。
- world landmarks の z をどこまで使うか。
- body scale 正規化に shoulder width / hip width / torso height のどれを使うか。

### torso frame

体幹基準は、腕、頭、手首、semantic motion の全ての基準になる。

調査してほしい論点は次である。

- `shoulderCenter`、`hipCenter`、Face matrix、前フレームを使った torso frame 推定。
- `U`、`R`、`F` 軸の定義。
- body yaw、body front 反転、横向き時の安定化。
- shoulder / hip が欠落した場合の fallback。
- online calibration で neutral yaw をどこまで更新してよいか。

### 腕の意味量

既存資料では、腕を絶対 wrist position ではなく、body-local な意味量に落とす案を挙げている。

主に定義したい値は次である。

- `elevation`
- `openness`
- `forwardness`
- `elbowFlexionHint`
- `reach`
- `side`
- `armConfidence`

調査してほしい論点は次である。

- それぞれの計算式。
- 値域。例: 0-1、-1-1、radian、normalized length。
- Pose wrist、Pose elbow、Hand palm、world z、手サイズ変化の優先順位。
- 「前に出す」と「横に広げる」の判定。
- 腕が伸び切った場合や画面端に近い場合の reliability 反映。

### head / wrist / hand 入力優先順位

部位ごとに、どの観測値を主入力にし、どれを fallback とするかを明確にしたい。

調査してほしい論点は次である。

- head は Face transformation matrix を主入力、Pose nose / eyes / ears を fallback にする設計。
- wrist position は Pose wrist を主入力、Hand landmarks を向きと指の補助入力にする設計。
- wrist orientation は palm basis から作るが、roll を弱く扱う設計。
- finger は curl / splay / oppose の低次元値へ落とす設計。
- Hand / Face が欠落した場合、Pose-only で残すべき値。

### データ構造

後段が共有できる TypeScript 向けの型を提案してほしい。

含めたい要素は次である。

- timestamp / frame id
- torso frame
- head state
- left / right arm state
- wrist / palm state
- finger state
- part reliability
- calibration metadata
- debug values

型は実装コードそのものではなく、責務と単位が分かる設計メモでよい。

### debug 表示と metrics

`CanonicalUpperBodyState` は debug snapshot と replay で確認できる必要がある。

調査してほしい論点は次である。

- motion-debug で表示すべき canonical 値。
- 値域外、急変、左右入れ替えを見つける debug 表示。
- metrics へ渡すべき値。
- replay log に保存すべき値と、再計算でよい値。
- IK / temporal / semantic から見て説明しやすい名前。

## 期待成果物

- 座標系定義。
- torso frame の推定方法。
- `CanonicalUpperBodyState` の TypeScript 型案。
- 腕の意味量の計算式、値域、信頼度反映。
- head / wrist / hand / finger の入力優先順位表。
- debug snapshot と motion-debug 表示項目。
- 後段の IK、TemporalStateEstimator、MotionIntent、AvatarMotionProfile へ渡す contract。

## 読んでほしい資料

- [roadmap.md](roadmap.md)
- [report01.md](report01.md)
- [report02.md](report02.md)
- [report03.md](report03.md)
- [report04-three-vrm.md](report04-three-vrm.md)
