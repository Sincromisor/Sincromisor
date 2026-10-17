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

サービスが所有する1本の専用スレッドで、共有AudioClassifierの生成・分類・closeを順に実行する。接続側は分類結果を非同期に待ち、発話状態とsequence_idの更新・WebSocket送信を担当する。未開始の取消済み要求は分類せず、実行中の分類はサービス終了時に回収してから分類器を閉じる。

## 設定・配備

- Docker Composeと環境変数は `infrastructure/compose.md`を確認する。
- 現状はMediaPipe音声Classification / Yamnet系を基準とし、RNNoiseは検討対象として扱う。

## 変更時の確認

- 結果モデルを変える場合は `contracts/audio-pipeline-websocket.md`とRecognizer側を同時に更新する。
- VAD / 無音パラメータを変える場合はGoパイプライン調停器のパスパラメータとDocker Compose環境変数を確認する。
- フロント側VADとは役割が異なるため、`frontend/audio/vad.md`と混同しない。

## 依存の再現性

MediaPipeは`mediapipe>=1.1.0`の範囲指定とし、実際の採用版1.1.0はルートの`uv.lock`で固定する。Python 3.14と`uv sync --locked --group speech-extractor`を使い、起動時に依存を自動更新しない。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/archive/legacy-flat/backend_speech_extractor.md`
