# 評価基盤 / デバッグ / QA 調査依頼

## 目的

Sincromisor の `sincro` モードで、上半身キャラクターモーションの品質改善を再現可能に行うための記録、再生、metrics、固定テストモーション、QA 観点を設計する。

調査では、ライブカメラを見ながらの主観調整に頼らず、同じ入力ログで同じ pipeline を再実行し、変更前後の改善・悪化を比較できる基盤を重視してほしい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、単眼 Web カメラから MediaPipe Pose / Hand / Face / Gesture を実行し、VRM 1.0 キャラクターへ上半身 motion を反映する。

既存資料では、最初に作るべきものはアルゴリズム改善ではなく、記録・再生・指標化の基盤であるとしている。理由は、MediaPipe の出力がカメラ環境やタイミングで揺れるため、ライブ入力だけでは品質改善の再現性が低いからである。

なお、今回の調査ではプライバシー・同意・保存期間などの方針は対象外とする。ログ形式や技術的な保存項目は調査対象に含めてよい。

## 前提技術

- 入力: MediaPipe Pose / Hand / Face / Gesture result
- 中間: ReliabilityMap、CanonicalUpperBodyState、TemporalStateEstimator、MotionIntent
- 出力: final VRM pose、IK snapshot、applied bone rotation
- debug page: `motion-debug`
- 目標: ライブカメラなしで同一入力を replay し、同一 retarget 結果を比較できること

## 調査してほしいこと

### debug log schema

既存資料では、次のような情報を保存する案がある。

- video metadata
- camera settings
- MediaPipe raw result
- reliability
- canonical state
- temporal state
- final pose
- applied VRM pose
- metrics

調査してほしい論点は次である。

- どの層のデータを必ず保存すべきか。
- 保存しなくても再計算できるデータ。
- replay の determinism を保つために必要な timestamp。
- バージョン情報、設定値、avatar profile の保存方法。
- ログサイズを抑えるための工夫。

### replay player

同じ入力ログから pipeline を再実行できる replay mode を作る想定である。

調査してほしい論点は次である。

- MediaPipe raw result から再生する場合の利点と制約。
- video frame から再推論する場合の利点と制約。
- canonical state から後段だけ再生する mode の価値。
- パラメータ差分比較の UI。
- replay と live の差分を検出する方法。

### metrics

既存資料で挙げている指標は次である。

- neutral jitter
- elbow flip count
- recovery jump
- angular velocity spike
- reach clamp occupancy
- dropout duration
- left-right swap count
- bone length variance
- semantic label flicker

調査してほしい論点は次である。

- 最初に見るべき metrics。
- 指標ごとの計算方法。
- 許容ライン。
- 自動判定できるものと、人間評価に残すべきもの。
- metrics が改善しても見た目が悪化するケース。

### 固定テストモーション

既存資料では、次のような固定テストを候補にしている。

- neutral 10 秒
- 片手をゆっくり上げる
- 両手をゆっくり上げる
- 手を横に広げる
- 手を前に出す
- 速い手振り
- 手を顔の前に置く
- 腕を交差する
- 片手を画面外へ出して戻す
- 指差し・開き手・握り手
- 顔を左右に向ける
- 小柄 VRoid モデルで同一ログ再生

このセットの不足、優先順位、収録条件、評価方法を整理してほしい。

### QA 観点

技術 metrics だけでなく、見た目の QA も必要である。

調査してほしい論点は次である。

- 主観評価フォーム。
- 破綻の分類。
- avatar ごとの差分 QA。
- camera quality ごとの差分 QA。
- regression test と exploratory test の分担。

## 期待成果物

- motion debug log schema。
- replay mode の設計案。
- metrics 定義と計算式。
- 最小固定テストモーションセット。
- 合格ラインと警告ライン。
- QA チェックリスト。
- live 調整に頼らない改善サイクル案。

## 読んでほしい資料

- [roadmap.md](roadmap.md)
- [report01.md](report01.md)
- [report02.md](report02.md)
- [report03.md](report03.md)
- [report04-three-vrm.md](report04-three-vrm.md)
