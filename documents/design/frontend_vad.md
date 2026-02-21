# Frontend VAD Design

## 1. 目的とスコープ

この文書は `sincromisor-frontend` におけるフロントエンド側 VAD (Voice Activity Detection) の設計を定義する。

- 目的:
  - 騒音環境でも発話検知を安定させる
  - 無音時の送信ゲートを行い、不要送信を抑える
  - デバッグコンソールから運用調整できる
- 対象:
  - `AudioWorklet` ベースの RMS/Peak VAD
  - `onnxruntime-web` + Silero VAD による学習ベース判定
  - フィルタ (HPF/LPF)、自動閾値、厳格判定モード

## 2. 構成

### 2.1 コンポーネント

- `src/ts/RTC/UserMediaManager.ts`
  - 音声処理チェーンの生成・制御
  - VADモード切替、ゲート制御、フィルタ適用
- `public/worklets/vad-processor.js`
  - AudioWorklet 側の軽量 VAD (RMS/Peak)
  - 学習VAD向け PCM フレーム送出
- `src/ts/RTC/LearnedVadWorkerClient.ts`
  - メインスレッドから Worker 制御と状態同期を行う
- `src/ts/RTC/silero-vad.worker.ts`
  - Silero ONNX 推論実行と最終 speech state の決定
- `src/ts/UI/DebugConsoleManager.ts`
  - デバッグ UI 入力と表示

### 2.2 音声処理チェーン

`MediaStreamTrack(raw)` -> `HPF` -> `LPF` -> `AudioWorklet(vad-processor)` -> `GateGain` -> `MediaStreamDestination`

- `vad-processor` は以下を同時に実行する:
  - 出力音声をそのままパススルー
  - RMS/Peak を計算して `vad` イベント送信
  - 学習VAD用の `audio-frame` を送信

## 3. VADモード

`VadThresholdMode` は以下の 3 モード:

- `manual`
  - RMS/Peak 閾値を固定値で運用
- `auto`
  - 無音時 RMS をノイズフロアとして追従し、閾値を動的更新
- `learned`
  - Silero の推論結果を主判定として利用

## 4. 学習VADパラメータ

`LearnedVadTuningConfig`:

- `onThreshold`
  - Speech 開始境界
  - 上げる: 誤反応減 / 取りこぼし増
  - 下げる: 感度増 / 誤反応増
- `offThreshold`
  - Speech 終了境界
  - 通常 `offThreshold < onThreshold`
- `hangoverMs`
  - Speech 判定を保持する猶予時間
  - 上げる: 途切れに強い / 終了が遅い
- `minInferIntervalMs`
  - 推論の最小実行間隔
  - 下げる: 応答性向上 / CPU負荷増
- `onConsecutiveFrames`
  - ON切替に必要な連続超過回数
  - 上げる: 誤反応減 / 立ち上がり遅延
- `offConsecutiveFrames`
  - OFF切替に必要な連続下回り回数
  - 上げる: 状態安定 / 終了遅延

### 4.1 現在のデフォルト

- `onThreshold: 0.0008`
- `offThreshold: 0.0004`
- `hangoverMs: 180`
- `minInferIntervalMs: 80`
- `onConsecutiveFrames: 2`
- `offConsecutiveFrames: 2`

### 4.2 プリセット

- `low_cpu`
  - 推論頻度を抑えて負荷優先
- `balanced`
  - 標準運用
- `high_accuracy`
  - 感度と追従性優先（負荷高め）

## 5. 厳格判定モード

`Strict (Learned + RMS)` を ON にすると、最終判定は下記となる:

- `speech = learnedSpeech AND rmsSpeech`

意図:

- 周囲会話・瞬間ノイズでの誤反応を抑える

副作用:

- 弱音声・遠距離音声の取りこぼしが増える

## 6. 負荷設計

- 推論は Worker で実行しメインスレッドをブロックしない
- Worker 内は「最新フレームのみ保持」でキュー肥大を防ぐ
- `minInferIntervalMs` で推論頻度を制御
- AudioWorklet 側は軽量処理 (RMS/Peak + フレーム送出) に限定

## 7. デバッグ観測項目

DebugConsole の `Model` 表示では以下を確認する:

- `status` (`idle/loading/ready/running/fallback/unavailable`)
- `tx` (main -> worker 送信フレーム数)
- `rx` (worker -> main 推論結果数)

切り分け:

- `tx=0`: AudioWorklet -> main のフレーム経路問題
- `tx>0, rx=0`: worker 推論経路問題
- `tx>0, rx>0`: 閾値/判定ロジックの調整問題

## 8. 既知の制約

- 学習VADモデルの出力レンジは環境・入力特性で変動するため、固定閾値だけで全環境を最適化できない
- ブラウザ差異やキャッシュ影響を避けるため、Worklet はバージョン付きURLで読み込む
- 高精度寄り設定は Three.js 描画負荷と競合しやすいため、端末性能に応じて調整が必要
