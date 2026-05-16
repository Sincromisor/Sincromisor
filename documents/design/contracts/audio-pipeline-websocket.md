# Audio Pipeline WebSocket Contract

## Summary

- AudioBroker と SpeechExtractor / SpeechRecognizer / TextProcessor / VoiceSynthesizer 間の WebSocket 契約を定義する。
- 4 系統の WebSocket は msgpack binary を使い、AudioBroker がキューで中継する。
- model 互換が壊れる変更は、`sincro-models` と各 sender / receiver / worker を同時更新する。

## Producers / Consumers

- Producer:
    - AudioBroker: audio frame、認識結果、応答テキスト
    - Downstream services: extraction / recognition / text / voice synthesis result
- Consumer:
    - SpeechExtractor、SpeechRecognizer、TextProcessor、VoiceSynthesizer、AudioBroker

## Compatibility Policy

- WebSocket path、msgpack model、必須 field の変更は破壊的変更として扱う。
- `sincro-models` の変更は各サービスと AudioBroker を同時に確認する。
- TextProcessor の chat / telop 契約変更は frontend RTC 契約にも影響する。

## Endpoints / Channels

| サービス         | Endpoint                                             | 用途                                       |
| ---------------- | ---------------------------------------------------- | ------------------------------------------ |
| SpeechExtractor  | `/api/v1/SpeechExtractor/extract?max_silence_ms=...` | audio frame から speech segment を抽出     |
| SpeechRecognizer | `/api/v1/SpeechRecognizer/recognize`                 | speech segment を text へ変換              |
| TextProcessor    | `/api/v1/TextProcessor/{talk_mode}`                  | 認識 text から応答 text / telop 情報を生成 |
| VoiceSynthesizer | `/api/v1/VoiceSynthesizer/synthesize`                | 応答 text を音声化                         |

## Payloads

- 共通形式は msgpack binary。
- 主な model:
    - `SpeechExtractorInitializeRequest`
    - `SpeechExtractorResult`
    - `SpeechRecognizerResult`
    - `TextProcessorResult`
    - `ChatMessage`
    - `VoiceSynthesizerResultFrame`

## Error Semantics

- 接続断、decode error、worker 例外は該当 thread の終了として扱う。
- AudioBroker は通信系の不健全を検知し、再接続を試みる。
- ユーザーへ見せる必要があるエラーは `text_channel_queue` 経由で `text_ch` へ中継できる。

## Timeout / Retry

- Receiver は timeout 付き recv で監視を継続する。
- AudioBroker は 1 秒起点、最大 30 秒程度の backoff で再接続する。
- 過負荷時は低遅延を優先し、古い frame の破棄を許容する。

## Versioning

- msgpack model に破壊的変更を入れる場合は、全 downstream service と AudioBroker を同一タスクで更新する。
- WebSocket path 変更は compose、Consul service 名、fallback 設定も同時確認する。

## Test Matrix

| 観点          | 確認内容                                              |
| ------------- | ----------------------------------------------------- |
| Extractor     | 初期化 request と audio frame 送信が成立する          |
| Recognizer    | speech segment から confirmed / partial result が返る |
| TextProcessor | `talk_mode` 別 path で応答が返る                      |
| Synthesizer   | 応答 text から voice frame が返る                     |
| reconnect     | 1 系統切断後に AudioBroker が復帰する                 |

## References

- `documents/design/backend/services/audio-broker.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/archive/legacy-flat/networking_websocket.md`
