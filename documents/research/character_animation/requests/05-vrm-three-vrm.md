# VRM / three-vrm / AvatarMotionProfile 調査依頼

## 目的

Sincromisor の `sincro` モードで、VRM 1.0 / VRoid Studio 系キャラクターを Three.js + `@pixiv/three-vrm` で安定して動かすための実装規約、pose 合成、optional bone fallback、AvatarMotionProfile を検証する。

調査では、MediaPipe や IK の詳細ではなく、最終的に決まった上半身姿勢を three-vrm runtime へ安全に適用する層に焦点を当ててほしい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、単眼 Web カメラから推定したユーザーの上半身動作を VRM 1.0 キャラクターへ反映する。

既存資料では、three-vrm を「ボーンを直接回す便利ライブラリ」としてではなく、VRM 1.0 humanoid runtime として扱う方針である。最終的な姿勢は `VRMHumanBoneName` をキーにした normalized local pose へ集約し、`vrm.humanoid.setNormalizedPose(finalPose)` を主経路にする。

## 前提技術

- 描画: Three.js
- VRM runtime: `@pixiv/three-vrm`
- 対象: VRM 1.0
- 主なモデル: VRoid Studio 系キャラクター
- 最終入力: motion solver が出力した `VRMPose`
- 非推奨経路: glTF node 名依存、world rotation の直接 copy、raw bone の通常制御

## 調査してほしいこと

### three-vrm pose 適用規約

既存資料では次の方針を採っている。最新版の three-vrm と VRM 1.0 の仕様に照らして妥当性を検証してほしい。

- `setNormalizedPose()` を主経路にする。
- `VRMHumanBoneName` を唯一の bone 識別子にする。
- final pose は 1 箇所で合成し、同一 bone に複数の書き手を作らない。
- `vrm.update(delta)` は全姿勢適用後に 1 回呼ぶ。
- `normalizedRestPose` を `setNormalizedPose()` の入力として使わない。
- 所有する bone は毎フレーム全て書く。

### PoseComposer

tracking、semantic clip、fallback、idle / breathing などを、最終的に 1 つの `VRMPose` へ合成する `VrmPoseComposer` を想定している。

調査してほしい論点は次である。

- override layer と additive layer の合成方法。
- quaternion slerp / log-space blend の使い分け。
- bone limit を合成前にかけるか、合成後にかけるか。
- partial pose を扱う場合の安全な reset / ownership 規約。
- AnimationMixer を本番 VRM に直接当てない staging 方式の妥当性。

### optional bone fallback

VRM 1.0 では `chest`、`upperChest`、`neck`、`leftShoulder` / `rightShoulder`、指 bone の一部が optional である。

調査してほしい論点は次である。

- torso rotation の `spine` / `chest` / `upperChest` 分配。
- `neck` がない場合の head rotation 上限。
- shoulder bone がない場合の肩補正の逃がし方。
- 指 bone が欠けている場合の curl 再分配。
- VRoid Studio 系以外の VRM 1.0 モデルで起きやすい差分。

### AvatarMotionProfile

既存資料では、VRM モデル差分を例外ではなく profile と fallback で扱う方針である。

調査してほしい論点は次である。

- VRM load 時に測定すべき値。
- rest local rotation、bone length、shoulder width、head size、optional bones の扱い。
- reach scale、depth compression、elbow outward bias、shoulder damping、wrist roll influence の初期値。
- モデルごとの破綻しやすさをどう profile 化するか。
- profile 値を user calibration と混ぜてよい範囲。

### spring bone / constraint / expression との干渉

今回の主対象は身体 motion だが、three-vrm runtime では spring bone、node constraint、lookAt、expression も更新される。

調査してほしい論点は次である。

- `vrm.update(delta)` 内の更新順序が motion 適用に与える影響。
- spring bone と肩・腕 motion の干渉。
- expression / lookAt と head motion の所有権分離。
- VRM Animation clip を使う場合の安全な評価方法。

## 期待成果物

- three-vrm pose 適用規約。
- `VrmRuntime`、`VrmHumanoidRig`、`VrmPoseBuffer`、`VrmPoseComposer`、`VrmPoseApplier` の責務案。
- optional bone fallback table。
- AvatarMotionProfile のフィールド案。
- VRM モデル差分テスト観点。
- AnimationMixer / VRM Animation / additive clip の採用判断。

## 読んでほしい資料

- [roadmap.md](roadmap.md)
- [report01.md](report01.md)
- [report03.md](report03.md)
- [report04-three-vrm.md](report04-three-vrm.md)
