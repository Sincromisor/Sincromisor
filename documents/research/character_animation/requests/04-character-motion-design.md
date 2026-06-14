# キャラクターアニメーション / ものまねらしさ 調査依頼

## 目的

Sincromisor の `sincro` モードで、ユーザーの動作をキャラクターが「ものまね」しているように見せるためのモーションデザインを検証する。

調査では、人体の姿勢再現ではなく、会話中の 3D キャラクターとして自然で、かわいく、破綻しにくく、ユーザーの意図が伝わる動きの設計基準を整理してほしい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、単眼 Web カメラで撮影したユーザーの上半身動作を、VRM 1.0 / VRoid Studio 系キャラクターへ反映する。

既存資料では、優先順位を次のように置いている。

| 優先度 | 目的                           |
| -----: | ------------------------------ |
|      1 | 破綻しない                     |
|      2 | 安定している                   |
|      3 | キャラクターとして自然に見える |
|      4 | ユーザーの意図が伝わる         |
|      5 | 実人体の姿勢へ忠実             |

単眼カメラでは、奥行き、肘方向、手首 roll、遮蔽、左右入れ替えが不安定になりやすい。そのため、検出値への完全追従ではなく、動作意図を抽出し、必要に応じて短い authored clip や style 補正でキャラクターらしい motion に変換する方針としている。

この依頼の対象は `sincro` モードの上半身同期に限る。`chat` モードの idle、会話視線、表情、AI speech gesture、長期的な personality 設計には広げない。

## 前提技術

- 入力: MediaPipe Pose / Hand / Face / Gesture の観測値
- 中間表現: MotionIntent、GestureState、CanonicalUpperBodyState
- 出力: VRM 1.0 normalized pose、additive pose delta
- 描画: Three.js + `@pixiv/three-vrm`
- 対象キャラクター: VRoid Studio 系のアニメ調モデル

## 調査してほしいこと

### ものまねらしさの評価軸

`sincro` モードでは、ユーザーの動きを完全再現するより、キャラクターが自分をまねていると感じられることを重視する。

調査してほしい論点は次である。

- どの部位が似ていれば「ものまね」と感じやすいか。
- どの部位は省略・丸め・低振幅化しても違和感が少ないか。
- 誇張した方がよい動きと、抑えた方がよい動き。
- 会話中に邪魔になる動きと、存在感を高める動き。
- かわいく見える遅れ、丸め、anticipation、follow-through。

### semantic motion layer

既存資料では、Hand / Gesture の結果から `MotionIntent` を推定し、tracking と短い additive clip を blend する案を挙げている。

想定している intent は次である。

- `tracking`
- `wave`
- `pointing`
- `nearFace`
- `lost`
- `fallback`

調査してほしい論点は次である。

- 追加すべき intent。
- intent ごとの発火条件。
- tracking pose と semantic clip の blend 比率。
- fade-in / fade-out / cooldown / minimum duration。
- gesture label のちらつきを motion として見せない方法。

### 上半身 clip

短い上半身 clip は、全身上書きではなく additive 補助として使う想定である。

調査してほしい論点は次である。

- 手振り、指差し、サムズアップ、ピース、顔近くの手などに必要な clip。
- clip が触るべき bone と、tracking に残すべき bone。
- 肩・胸・頭をどこまで clip 側で動かすべきか。
- clip の長さ、周期、blend weight。
- `sincro` 上半身同期に閉じた style parameter。例: 動きの振幅、丸め方、gesture の控えめさ。

### 破綻時の自然な退避

信頼度が低いときに動きを止めると不自然になる。一方で、悪い観測値に追従すると破綻する。

調査してほしい論点は次である。

- confidence が低いときの motion amplitude の落とし方。
- comfortable pose / relaxed hand / neutral head への戻し方。
- 破綻しそうな観測を「意味ある動き」に丸める方法。
- ユーザーにとって、追従していないことが目立ちにくい fallback。

## 期待成果物

- `sincro` モードの motion design principle。
- `MotionIntent` 一覧と発火条件。
- tracking / semantic clip / fallback の blend table。
- 最初に用意すべき authored upper-body clip のリスト。
- 主観評価チェックリスト。
- 「かわいいが不安定」ではなく「控えめだが破綻しない」動きにするための具体指針。

## 読んでほしい資料

- [roadmap.md](roadmap.md)
- [report02.md](report02.md)
- [report03.md](report03.md)
- [report04-three-vrm.md](report04-three-vrm.md)
