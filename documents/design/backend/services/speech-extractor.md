# バックエンドサービス: SpeechExtractor

## 要約

- SpeechExtractorは音声フレームから音声区間を抽出する下流サービスである。
- Goパイプライン調停器からWebSocket + msgpackで音声を受け取り、発話区間の結果を返す。
- 通信契約は `contracts/audio-pipeline-websocket.md`を正本とする。

## 対象範囲

- 対象
    - SpeechExtractorサービス
    - 音声区間抽出のサービス境界
    - Goパイプライン調停器との接続
- 非対象
    - RTCシグナリング
    - SpeechRecognizer以降

## 責務

- 音声フレームを受信する。
- `max_silence_ms`などのパラメータに従って音声区間を区切る。
- `SpeechExtractorResult`を返す。

## 分類器の実行と終了

16kHzの入力は3200サンプル（200ms）以上が揃った時点で分類へ渡す。20ms単位の通常入力では10フレームで判定し、最小長ちょうどでも次フレームを待たない。Goから渡す無音閾値はchatが1,000ms、sincroが600msであり、200ms区間ではそれぞれ5区間・3区間の連続非Speechで確定する。先行音声500msと判定閾値は維持する。

サービスが所有する1本の専用スレッドで、共有AudioClassifierの生成・分類・closeを順に実行する。接続側は分類結果を非同期に待ち、発話状態とsequence_idの更新・WebSocket送信を担当する。未開始の取消済み要求は分類せず、実行中の分類はサービス終了時に回収してから分類器を閉じる。

## 入力窓と発話終端の評価

モデルの入力窓、APIが受理する最短入力、アプリの判定周期、無音閾値は別の量である。同梱YAMNetはfloat32の15,600サンプル（16kHzで975ms）を入力とする。採用MediaPipe 1.1.1の `AUDIO_CLIPS`は200ms・旧220msを受理し、短入力の分類結果は975msへ末尾をゼロ埋めした入力と一致する。1サンプルも受理されるが、発話判定に使えることを意味しない。

975ms以下の入力には時刻0の結果が1件返り、15,601サンプルでは0ms・975msの2件となる。返却時刻は各呼出し内の位置であり、セッションの入力位置や発話終了時刻ではない。評価では各入力の先頭サンプル位置を別に保持し、分類に使った区間の末尾と確定送信位置を対応付ける。`start_at`はSpeech検出のたびに更新されるため終端遅延の基準にしない。

APIの受理・ゼロ埋めは[実モデル試験](../../../../sincromisor-server/speech-extractor/tests/test_model_input_window.py)で再現できる。日本語の小声・息継ぎ・言いよどみを含む注釈済み固定音声での品質は未確認であり、入力窓の長さだけを理由に200msを不正としたり975msへ変更したりしない。評価の未完条件は[入力窓と終端評価タスク](../../../../tasks/performance/task-261101110037-dialogue-endpoint-evaluation/task.md)に保持する。

## 設定・配備

- Docker Composeと環境変数は `infrastructure/compose.md`を確認する。
- 現状はMediaPipe音声Classification / Yamnet系を基準とし、RNNoiseは検討対象として扱う。

## 変更時の確認

- 結果モデルを変える場合は `contracts/audio-pipeline-websocket.md`とRecognizer側を同時に更新する。
- VAD / 無音パラメータを変える場合はGoパイプライン調停器のパスパラメータとDocker Compose環境変数を確認する。
- フロント側VADとは役割が異なるため、`frontend/audio/vad.md`と混同しない。

## 依存の再現性

MediaPipeは`mediapipe>=1.1.1`の範囲指定とし、実際の採用版1.1.1はルートの`uv.lock`で固定する。Python 3.14と`uv sync --locked --group speech-extractor`を使い、起動時に依存を自動更新しない。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/archive/legacy-flat/backend_speech_extractor.md`
