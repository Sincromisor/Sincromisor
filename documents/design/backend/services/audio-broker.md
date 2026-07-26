# Backend Service: AudioBroker

## Summary

- AudioBroker は RTC session 内で音声処理 downstream services を束ねる中継層である。
- Extractor、Recognizer、TextProcessor、VoiceSynthesizer へ WebSocket 接続し、キューで結果を中継する。
- WebSocket / msgpack 契約は `contracts/audio-pipeline-websocket.md` を正本とする。

## Scope

- 対象:
    - `AudioBroker`
    - 各 Sender / Receiver thread
    - text / voice queue
- 非対象:
    - 個別 downstream service の推論・生成ロジック
    - WebRTC signaling

## Responsibilities

- AudioBroker:
    - worker discovery、接続、通信健全性監視、再接続、エラー注入。
- Sender threads:
    - deque から WebSocket へ msgpack binary を送信する。
- Receiver threads:
    - WebSocket から msgpack binary を受信し、次段 queue へ格納する。
- `SynthesizerReceiverThread`:
    - 合成音声を `VoiceSynthesizerResultFrame` へ分割する。

### Go移行境界

`sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery` と
`internal/pipeline/client` に、Consul/fallback解決と4つのtyped WebSocket clientを置く。これらは
1接続のbinary I/O、protocol encode/decode、ping、terminal event、close/joinだけを担当し、AudioBroker相当の
queue、chat history、全接続reset、generation、retry backoffは持たない。

このpackageはまだproductionのRTC sessionへ配線されていない。現行productionではPython `AudioBroker` と
Sender/Receiver threadが引き続きdownstream接続と再接続を担当するため、Go clientの存在をproduction置換済みとは
扱わない。4 clientを束ねるcoordinatorとPion sessionへの配線は後続phaseで行う。

## Data / State

- input:
    - raw PCM frame buffer
- intermediate:
    - `SpeechExtractorResult`
    - `SpeechRecognizerResult`
    - `TextProcessorResult`
- output:
    - `text_channel_queue`
    - `voice_frame_queue`

## Interfaces

- 正本:
    - `documents/design/contracts/audio-pipeline-websocket.md`

## Observability / Failure Modes

- 各 thread の start / stop / exception を session id 付きで追う。
- どの downstream 接続が先に失敗したかを確認する。
- 1 系統でも不健全な場合は AudioBroker 全体の再接続対象にする。

## Change Checklist

- msgpack model 変更時は `sincro-models` と全 sender / receiver を同時更新する。
- endpoint path 変更時は compose、Consul、fallback 設定も確認する。
- text / telop 出力の変更は frontend RTC contract へ波及する。

## References

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/backend/services/sincro-rtc.md`
- `documents/design/archive/legacy-flat/backend_audio_broker.md`
