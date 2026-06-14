# モーションソルバ / IK / 関節制約 調査依頼

## 目的

Sincromisor の `sincro` モードで、単眼 Web カメラ由来の不確実な観測値から、VRM 1.0 キャラクターの上半身を破綻なく動かすためのモーションソルバ、IK、関節制約、補正アルゴリズムを検証する。

特に、肘反転、肩崩れ、腕の伸び切り、手首 roll 暴れ、指のちらつきを避けるための具体的な設計と初期パラメータを知りたい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、ユーザーの上半身の動きを単眼 Web カメラと MediaPipe で推定し、VRM 1.0 / VRoid Studio 系キャラクターへ反映する。

目的は人体の完全再現ではなく、キャラクターとして自然で破綻しにくい「ものまね」である。既存資料では、腕には自前の 2-bone analytic IK を使う方針だが、IK は中核ではなく、Reliability、CanonicalUpperBodyState、TemporalStateEstimator、AvatarMotionProfile を経た後段の姿勢適用器に近い位置づけとしている。

## 前提技術

- 入力: MediaPipe Pose / Hand / Face / Gesture の観測値
- 中間表現: body-local な canonical upper body state
- 出力: VRM 1.0 humanoid の normalized local pose
- 描画: Three.js + `@pixiv/three-vrm`
- モデル: VRoid Studio 系を主対象とするが、一般的な VRM 1.0 も考慮する

## 調査してほしいこと

### 腕 IK

既存資料では、腕は 2-bone analytic IK を主方式にする案としている。次を具体化してほしい。

- shoulder / elbow / wrist chain の IK 解法。
- reach clamp の設計。
- elbow pole vector の計算、保持、fallback。
- 腕が伸び切った場合の pole 安定化。
- 肩、肘、手首の soft limit。
- 左右腕での符号・軸差分の扱い。

### 肘反転の防止

肘反転は最優先で避けたい破綻の一つである。既存資料では、実測 pole、前フレーム pole、fallback pole を状態に応じて blend する案を挙げている。

調査してほしい論点は次である。

- `Stable`、`Uncertain`、`Extended`、`Lost`、`Recovering` それぞれの pole blend 比率。
- `dot(measuredPole, previousPole) < 0` のような急反転検出の妥当性。
- angular velocity や elbow flexion を使った reject 条件。
- キャラクターらしい外向き肘 bias の初期値。

### 肩・鎖骨・胸の補正

VRoid 系モデルでは、upperArm だけを動かすと肩・胸・袖まわりが破綻しやすい。次を調査してほしい。

- 腕を上げる角度に応じた shoulder / upperChest / chest / spine への分配。
- 片腕上げ、両腕上げ、手を前に出す、腕を横に広げる場合の補正差。
- shoulder bone がないモデル、upperChest がないモデルの fallback。
- 顔や胸への手・腕のめり込みを避ける簡易 no-go zone。

### 手首・前腕 twist

手首 roll は単眼カメラで特に暴れやすい。次を調査してほしい。

- Hand palm basis から信用できる軸と捨てる軸。
- wrist pitch / yaw / roll の反映比率。
- hand bone と lowerArm twist への分配。
- 手が横向き、顔前、遮蔽、小さく写る場合の fallback。

### 指制御

既存資料では、指は各関節の 3D 回転を直接推定せず、curl / splay / oppose の低次元制御から始める案としている。

調査してほしい論点は次である。

- 最初に実装すべき指制御の粒度。
- thumb / index / middle / ring-little の分け方。
- curl を proximal / intermediate / distal へ分配する比率。
- splay を入れるべき指と上限角。
- Gesture Recognizer と finger curl の整合。

## 期待成果物

- 腕 IK、pole vector、reach clamp、soft limit の設計メモ。
- 部位別の初期パラメータ表。
- VRoid 系モデルで避けるべき破綻と対応策。
- shoulder / chest / upperChest / spine の分配規則。
- wrist roll と forearm twist の推奨分配。
- 指制御の段階的実装計画。
- 実装時に記録すべき debug 値。

## 読んでほしい資料

- [roadmap.md](roadmap.md)
- [report01.md](report01.md)
- [report03.md](report03.md)
- [report04-three-vrm.md](report04-three-vrm.md)
