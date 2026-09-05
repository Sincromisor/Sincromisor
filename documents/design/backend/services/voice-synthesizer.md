# バックエンドサービス: VoiceSynthesizer

## 要約

- VoiceSynthesizer は TextProcessor の応答テキストを音声フレームへ変換する下流サービスである。
- 出力音声はGoパイプライン調停器とPion RTCを通じて WebRTC 音声トラックでフロントへ返る。
- WebSocket / msgpack 契約は `contracts/audio-pipeline-websocket.md` を正本とする。

## 対象範囲

- 対象:
    - VoiceSynthesizer サービス境界
    - 応答テキストから音声フレームへの変換
    - Goパイプライン調停器への結果返却
- 非対象:
    - フロント側再生 UI
    - TextProcessor の応答生成

## 責務

- TextProcessor 出力を受け取る。
- 音声合成バックエンドを呼び出す。
- `VoiceSynthesizerResult` としてGoパイプライン調停器へ返す。

## 変更時の確認

- 音声フレームモデルを変える場合はGoパイプライン調停器とWebSocket 契約を同時更新する。
- 音声合成の提供元や設定を変える場合は Docker Compose 環境変数と機密情報の取り扱いを確認する。
- テロップ / 口形同期との関係を変える場合はフロントエンドキャラクター動作と RTC 契約を確認する。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/backend/services/text-processor.md`
- `documents/design/archive/legacy-flat/backend_voice_synthesizer.md`
