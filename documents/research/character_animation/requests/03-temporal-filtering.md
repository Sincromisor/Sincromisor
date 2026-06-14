# 時系列推定 / フィルタ / レイテンシ 調査依頼

## 目的

Sincromisor の `sincro` モードで、MediaPipe 由来の jitter、欠落、外れ値、再検出時のジャンプを抑えつつ、会話中のキャラクターとして許容できる低遅延を保つための時系列推定設計を検証する。

調査では、単純な平滑化ではなく、信頼度つき観測値から body-local な canonical state と最終 VRM pose を安定させる状態推定として整理してほしい。

## 背景

Sincromisor は、ブラウザ上で 3D キャラクターと音声対話するサービスである。`sincro` モードでは、単眼 Web カメラの入力からユーザーの上半身の動きを推定し、VRM 1.0 キャラクターに反映する。

既存資料では、MediaPipe landmark を直接骨へ流し込むのではなく、Reliability map、CanonicalUpperBodyState、TemporalStateEstimator、MotionIntent、AvatarMotionProfile を経由して最終姿勢へ変換する方針である。時系列処理は、この中でも品質差が早く出る領域と位置づけられている。

## 前提技術

- 入力: MediaPipe Pose / Hand / Face / Gesture の観測値と部位別 reliability
- 中間表現: body-local canonical state
- 出力: IK target、pole vector、finger curl、head / torso rotation、最終 VRM pose
- 実行環境: Web browser
- 目標: 手・頭の体感遅延は概ね 100ms 前後以内、胴体はより安定重視

## 調査してほしいこと

### フィルタの使い分け

既存資料では次の使い分けを候補にしている。妥当性、初期値、実装上の注意点を検証してほしい。

- EMA: 品質スコア、低速 online calibration、UI 表示。
- One Euro Filter: wrist target、head rotation、canonical scalar。
- Kalman filter: dropout 中の予測、再検出時の復帰。
- quaternion log-space smoothing: 最終ボーン回転。
- hysteresis: gesture label、状態遷移、forwardness / openness 判定。

### 部位別パラメータ

部位ごとに、jitter 抑制と遅延許容量が異なる。次の部位について推奨値を知りたい。

- torso rotation
- chest / upperChest
- head rotation
- wrist target
- elbow pole
- wrist roll
- finger curl
- gesture state

特に、One Euro Filter の `minCutoff` / `beta`、Kalman の状態量、欠落時の速度減衰、復帰 blend 時間を整理してほしい。

### 状態遷移

既存資料では、部位ごとに次の状態を持つ案としている。

```text
Tracked
  -> Suspect
  -> Predicted
  -> Lost
  -> Recovering
  -> Tracked
```

調査してほしい論点は次である。

- 状態遷移の confidence 閾値。
- `Suspect` へ入るまでのフレーム数。
- `Predicted` と `Lost` の時間境界。
- `Recovering` の blend 時間。
- 腕、手首、指、頭、胴体で状態遷移を分けるべきか。

### dropout と再検出

手が顔の前に来る、画面外に出る、腕が交差するなどの状況で、観測値が一時的に消えることがある。

調査してほしい論点は次である。

- 0-200ms、200-700ms、700ms 以降での部位別挙動。
- 手が戻った瞬間の角度ジャンプを 10-15 度以下に抑える方法。
- dropout 中に comfortable pose へ戻す速度。
- gesture label をどれくらい保持するか。
- 予測が外れていると判断する条件。

### latency budget

会話中のキャラクターでは、追従が遅すぎると「ものまね」感が落ちる。一方で、遅延を減らしすぎると jitter が目立つ。

調査してほしい論点は次である。

- 部位別に許容できる追加遅延。
- 推論 fps、描画 fps、filter delay の関係。
- 動きの速さに応じた adaptive smoothing。
- 手・頭を速く、胴体・肩を遅くする設計の妥当性。

## 期待成果物

- 部位別フィルタ設計表。
- 状態遷移図と閾値案。
- dropout / recovering の挙動仕様。
- neutral jitter、recovery jump、added latency の測定方法。
- 実装時に必要な debug log 項目。
- Web browser 上で現実的な latency budget。

## 読んでほしい資料

- [roadmap.md](roadmap.md)
- [report01.md](report01.md)
- [report02.md](report02.md)
- [report03.md](report03.md)
