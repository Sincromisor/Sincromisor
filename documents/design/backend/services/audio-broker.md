# Backend Service: AudioBroker

## Summary

- Python `AudioBroker` はaiortc診断profileにだけ残る旧RTC経路の中継層である。
- 通常のPion `sincro-rtc` はGo pipeline coordinatorでExtractor、Recognizer、TextProcessor、VoiceSynthesizerへ接続する。
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

### 通常運用のGo pipeline coordinator

`sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery` と
`internal/pipeline/client` に、Consul/fallback解決と4つのtyped WebSocket clientを置く。これらは
1接続のbinary I/O、protocol encode/decode、ping、terminal event、close/joinだけを担当し、AudioBroker相当の
queue、chat history、全接続reset、generation、retry backoffは持たない。

`internal/pipeline` のCoordinatorがsessionごとに4 client set、generation、25-frame PCM queue、
各16件のexternal output、confirmed historyを所有する。1系統のterminal eventで全接続をclose / joinし、
generation更新後にtransient queue、partial user / assistant state、未送信TTSを破棄して全4接続を新規作成する。
初回接続失敗はgeneration 1のまま、runtime failureだけがgenerationを1回進める。確定済みhistoryは防御的copyで
次generationへ継承する。

このCoordinatorは通常のPion RTC sessionへ配線される。Python `AudioBroker` とSender/Receiver threadはaiortc診断profileの
構成だけに残し、新機能を追加しない。Phase 6で旧Python RTC stackとともに削除する。

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
- Go Coordinatorはstale result/eventをservice別、PCM overflowをqueue交換から独立したsession累積値として
  計数し、service名と累積drop countだけを構造化logへ出す。認識文、音声、chat本文、stale eventの原因errorは
  記録しない。
- Extractorの最後に受理したspeech / sequence IDはCoordinatorのsession stateであり、reset後も維持する。
  sequenceの重複・逆行、または新generation最初のspeech ID再利用・逆行は現在generationのprotocol failureとする。
- reset / closeは旧generation goroutineと4 WebSocketのjoin完了を境界とし、再送や旧queue再利用を行わない。

## Change Checklist

- msgpack model 変更時は `sincro-models` と全 sender / receiver を同時更新する。
- endpoint path 変更時は compose、Consul、fallback 設定も確認する。
- text / telop 出力の変更は frontend RTC contract へ波及する。

## References

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/backend/services/sincro-rtc.md`
- `documents/design/archive/legacy-flat/backend_audio_broker.md`
