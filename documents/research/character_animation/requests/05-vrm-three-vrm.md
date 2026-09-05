# VRM / three-vrm / AvatarMotionProfile 調査依頼

## 目的

Sincromisor の `sincro` モードで、VRM 1.0 / VRoid Studio 系キャラクターを Three.js + `@pixiv/three-vrm` で安定して動かすための実装規約、姿勢合成、任意ボーン代替処理、AvatarMotionProfile を検証する。

調査では、MediaPipe や IK の詳細ではなく、最終的に決まった上半身姿勢を three-vrm 実行時へ安全に適用する層に焦点を当ててほしい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、単眼 Web カメラから推定したユーザーの上半身動作を VRM 1.0 キャラクターへ反映する。

既存資料では、three-vrm を「ボーンを直接回す便利ライブラリ」としてではなく、VRM 1.0 人型骨格実行時として扱う方針である。最終的な姿勢は `VRMHumanBoneName` をキーにした正規化済みローカル姿勢へ集約し、`vrm.humanoid.setNormalizedPose(finalPose)` を主経路にする。

## 前提技術

- 描画: Three.js
- VRM 実行時: `@pixiv/three-vrm`
- 対象: VRM 1.0
- 主なモデル: VRoid Studio 系キャラクター
- 最終入力: 動作算出処理が出力した `VRMPose`
- 非推奨経路: glTF ノード名依存、ワールド回転の直接コピー、未加工ボーンの通常制御

## 調査してほしいこと

### three-vrm 姿勢適用規約

既存資料では次の方針を採っている。最新版の three-vrm と VRM 1.0 の仕様に照らして妥当性を検証してほしい。

- `setNormalizedPose()` を主経路にする。
- `VRMHumanBoneName` を唯一のボーン識別子にする。
- 最終姿勢は 1 箇所で合成し、同一ボーンに複数の書き手を作らない。
- `vrm.update(delta)` は全姿勢適用後に 1 回呼ぶ。
- `normalizedRestPose` を `setNormalizedPose()` の入力として使わない。
- 所有するボーンは毎フレーム全て書く。

### PoseComposer

追跡、意味に基づく動作クリップ、代替処理、待機動作 / 呼吸などを、最終的に 1 つの `VRMPose` へ合成する `VrmPoseComposer` を想定している。

調査してほしい論点は次である。

- 上書き層と加算層の合成方法。
- クォータニオン slerp / 対数空間での合成の使い分け。
- ボーンの可動域制限を合成前にかけるか、合成後にかけるか。
- 一部のボーンだけを含む姿勢を扱う場合の安全な再初期化 / 所有権規約。
- AnimationMixer を本番 VRM に直接当てない評価用方式の妥当性。

### 任意ボーン代替処理

VRM 1.0 では `chest`、`upperChest`、`neck`、`leftShoulder` / `rightShoulder`、指ボーンの一部が任意である。

調査してほしい論点は次である。

- 体幹回転の `spine` / `chest` / `upperChest` 分配。
- `neck` がない場合の頭部回転上限。
- 肩ボーンがない場合の肩補正の逃がし方。
- 指ボーンが欠けている場合の曲げ再分配。
- VRoid Studio 系以外の VRM 1.0 モデルで起きやすい差分。

### AvatarMotionProfile

既存資料では、VRM モデル差分を例外ではなく調整情報と代替処理で扱う方針である。

調査してほしい論点は次である。

- VRM 読み込み時に測定すべき値。
- 初期姿勢のローカル回転、骨の長さ、肩幅、頭部大きさ、任意ボーンの扱い。
- 到達距離倍率、奥行き圧縮、肘外向き偏りの補正、肩減衰、手首ロール反映率の初期値。
- モデルごとの破綻しやすさをどう調整情報化するか。
- 調整情報値をユーザー較正と混ぜてよい範囲。

### 揺れ物のボーン / 制約 / 表情との干渉

今回の主対象は身体動作だが、three-vrm 実行時では揺れ物のボーン、ノード制約、lookAt、表情も更新される。

調査してほしい論点は次である。

- `vrm.update(delta)` 内の更新順序が動作適用に与える影響。
- 揺れ物のボーンと肩・腕動作の干渉。
- 表情 / lookAt と頭部動作の所有権分離。
- VRM Animation クリップを使う場合の安全な評価方法。

## 期待成果物

- three-vrm 姿勢適用規約。
- `VrmRuntime`、`VrmHumanoidRig`、`VrmPoseBuffer`、`VrmPoseComposer`、`VrmPoseApplier` の責務案。
- 任意ボーン代替処理表。
- AvatarMotionProfile のフィールド案。
- VRM モデル差分テスト観点。
- AnimationMixer / VRM Animation / 加算クリップの採用判断。

## 読んでほしい資料

- [roadmap.md](../roadmap.md)
- [report01.md](../report01.md)
- [report03.md](../report03.md)
- [report04-three-vrm.md](../report04-three-vrm.md)
