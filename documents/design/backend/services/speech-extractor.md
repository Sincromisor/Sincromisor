# バックエンドサービス: SpeechExtractor

## 要約

- SpeechExtractor は音声フレームから音声区間を抽出する下流サービスである。
- Goパイプライン調停器から WebSocket + msgpack で音声を受け取り、発話区間結果を返す。
- 通信契約は `contracts/audio-pipeline-websocket.md` を正本とする。

## 対象範囲

- 対象:
    - SpeechExtractor サービス
    - 音声区間抽出のサービス境界
    - Goパイプライン調停器との接続
- 非対象:
    - RTC シグナリング
    - SpeechRecognizer 以降

## 責務

- 音声フレームを受信する。
- `max_silence_ms` などのパラメータに従って音声区間を切る。
- `SpeechExtractorResult` を返す。

## 設定・配備

- Docker Compose と環境変数は `infrastructure/compose.md` を確認する。
- 現状は MediaPipe 音声 Classification / Yamnet 系を基準とし、RNNoise は検討対象として扱う。

## 変更時の確認

- 結果モデルを変える場合は `contracts/audio-pipeline-websocket.md` と Recognizer 側を同時更新する。
- VAD / 無音パラメータを変える場合はGoパイプライン調停器のパスパラメータとDocker Compose 環境変数を確認する。
- フロント側 VAD とは役割が異なるため、`frontend/audio/vad.md` と混同しない。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/archive/legacy-flat/backend_speech_extractor.md`
