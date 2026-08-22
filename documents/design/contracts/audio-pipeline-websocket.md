# Audio Pipeline WebSocket Contract

## Summary

- Go pipeline coordinator と SpeechExtractor / SpeechRecognizer / TextProcessor / VoiceSynthesizer 間の WebSocket 契約を定義する。
- 4 系統の WebSocket は msgpack binary を使い、coordinator がキューで中継する。
- model 互換が壊れる変更は、`sincro-models` と各 sender / receiver / worker を同時更新する。

## Producers / Consumers

- Producer:
    - Go pipeline coordinator: audio frame、認識結果、応答テキスト
    - Downstream services: extraction / recognition / text / voice synthesis result
- Consumer:
    - SpeechExtractor、SpeechRecognizer、TextProcessor、VoiceSynthesizer、Go pipeline coordinator

## Compatibility Policy

- WebSocket path、msgpack model、必須 field の変更は破壊的変更として扱う。
- `sincro-models` の変更は各サービスとGo pipeline coordinatorを同時に確認する。
- TextProcessor の chat / telop 契約変更は frontend RTC 契約にも影響する。

## Endpoints / Channels

| サービス         | Endpoint                                             | 用途                                       |
| ---------------- | ---------------------------------------------------- | ------------------------------------------ |
| SpeechExtractor  | `/api/v1/SpeechExtractor/extract?max_silence_ms=...` | audio frame から speech segment を抽出     |
| SpeechRecognizer | `/api/v1/SpeechRecognizer/recognize`                 | speech segment を text へ変換              |
| TextProcessor    | `/api/v1/TextProcessor/{talk_mode}`                  | 認識 text から応答 text / telop 情報を生成 |
| VoiceSynthesizer | `/api/v1/VoiceSynthesizer/synthesize`                | 応答 text を音声化                         |

## Payloads

- model payload は MessagePack binary frame とする。
- SpeechExtractor の初期化後に送る raw PCM だけは model を持たない binary frame とする。
- TextProcessor の response bytes は Go で routing field を decode した後も再 encode せず、
  同じ bytes を VoiceSynthesizer へ渡す。

### Wire direction

| Direction                             | Model                              | 用途                                                       |
| ------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Go → SpeechExtractor                  | `SpeechExtractorInitializeRequest` | session と入力 PCM format の初期化                         |
| Go → SpeechExtractor                  | model なしの raw PCM binary frame  | 連続音声 input                                             |
| SpeechExtractor → Go                  | `SpeechExtractorResult`            | 発話区間の PCM と確定状態                                  |
| Go → SpeechRecognizer                 | `SpeechExtractorResult`            | 認識対象の発話区間                                         |
| SpeechRecognizer → Go                 | `SpeechRecognizerResult`           | text/score tuple の列                                      |
| Go → TextProcessor                    | `TextProcessorRequest`             | 認識文と chat history                                      |
| TextProcessor → Go → VoiceSynthesizer | `TextProcessorResult`              | routing field を decode し、元 bytes を変更せず TTS へ転送 |
| VoiceSynthesizer → Go                 | `VoiceSynthesizerResult`           | encoded voice、mora timing、audio format                   |

`SpeechRecognizerResult`、`TextProcessorResult`、`VoiceSynthesizerResult` は Go consumer 専用である。
Go は recognizer result から別 model の `TextProcessorRequest` を生成するため、
`SpeechRecognizerResult` を再 encode しない。`TextProcessorResult` と
`VoiceSynthesizerResult` にも Go production encode API を設けない。

### Field schema

表の `required, nullable` は key 自体が required で、値に MessagePack nil を許すことを表す。
その他の required field は nil を許さない。string の empty、list の empty、
binary の empty は codec 層で許可し、domain 上の範囲や format の妥当性は各 client が検証する。

| Model                              | Fields                                                                                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SpeechExtractorInitializeRequest` | `session_id: string`、`start_at: float`、`voice_sampling_rate: int64`、`voice_sample_bytes: int64`、`voice_channels: int64`                                                                                                      |
| `SpeechExtractorResult`            | `session_id: string`、`speech_id: int64`、`sequence_id: int64`、`start_at: float`、`confirmed: bool`、`voice: binary`、`voice_dtype: string`、`voice_sampling_rate: int64`、`voice_sample_bytes: int64`、`voice_channels: int64` |
| `SpeechRecognizerResult`           | `session_id: string`、`speech_id: int64`、`sequence_id: int64`、`start_at: float`、`confirmed: bool`、`result: list<[string, float]>`                                                                                            |
| `ChatMessage`                      | `speech_id: int64`、`message_id: string`、`message_type: string`、`speaker_id: string`、`speaker_name: string`、`expression_code: int64 \| nil`、`message: string`、`created_at: float`                                          |
| `ChatHistory`                      | `messages: list<ChatMessage>`                                                                                                                                                                                                    |
| `TextProcessorRequest`             | `session_id: string`、`sequence_id: int64`、`confirmed: bool`、`history: ChatHistory`、`request_message: ChatMessage`                                                                                                            |
| `TextProcessorResult`              | `session_id: string`、`sequence_id: int64`、`confirmed: bool`、`history: ChatHistory`、`request_message: ChatMessage`、`response_message: ChatMessage`、`end_of_response: bool`、`voice_text: string \| nil`                     |
| `VoiceSynthesizerResult`           | `speech_id: int64`、`message: string`、`query: map`、`mora_queue: list<Mora>`、`speaking_time: float`、`voice: binary`、`audio_format: string`。`Mora` は `vowel: string \| nil`、`length: float`、`text: string \| nil` を持つ  |

すべての Python integer は Go の signed `int64` 範囲で受理する。negative value は wire
表現として許可するが、`int64` を超える unsigned integer は reject する。
`voice` は MessagePack string へ暗黙変換せず binary だけを受理する。

### Compatibility fixture

- fixture: `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol/testdata/*.msgpack`
- manifest: `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol/testdata/manifest.json`
- Python generator:
  `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol/testdata/generate_fixtures.py`
- Go producer helper:
  `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol/testdata/generate_go_payloads.go`

fixture は現在の `sincro_models` class と `to_msgpack()` から固定 ID、時刻、人工音声 byte
だけを使って生成する。generator の `--check` は一時 directory へ再生成し、fixture と
manifest の byte 差分を検出する。fixture を手編集しない。

### Decode validation

- payload は単一の top-level string-key map とし、empty payload、top-level 非 map、
  non-string key、trailing object/bytes を reject する。
- 全 wire field の key presence を要求する。Pydantic default を Go で補完しない。
- nested map を含む未知 key は、Python producer の field 追加に対する forward compatibility
  のため無視する。
- required list/binary の nil、field 型不正、binary field の text、
  recognizer tuple の要素数/型不正を reject する。
- error は model 名と `$` または `ProcessorResult.response_message.speech_id` のような
  固定 field path を含め、音声、認識文、chat 本文の値を含めない。
- decode 結果の binary/list と `TextProcessorResult` の raw payload は Go 側が所有する
  防御的 copy とし、caller が入力 slice を変更しても結果を変えない。

## Error Semantics

- 接続断、decode error、worker 例外は該当 thread の終了として扱う。
- Go pipeline coordinator は通信系の不健全を検知し、4接続を再作成する。
- ユーザーへ見せる必要があるエラーは `text_channel_queue` 経由で `text_ch` へ中継できる。

### Go pipeline coordinator

`sincro-rtc-pion-poc/internal/pipeline/client` は、上表と同じ4 endpointへ
`github.com/coder/websocket` の binary messageだけで接続する。Extractorは接続直後に初期化MessagePackを
1件送り、その後は20 ms単位の16 kHz mono s16le raw PCMだけを送る。他の3 clientは
`internal/pipeline/protocol` の限定DTOを使い、TextProcessor responseはdecode時に保持した元bytesを
VoiceSynthesizerへ変更せず転送する。

各clientは1接続につきreaderを1つ、同期writerをcaller側に1つだけ持つ。read/write payloadにはservice別の
有限上限を適用し、application text message、decode failure、ping failure、remote closeをterminal failureとする。
通常無送信であることだけでは切断せず、10秒間隔のpingを5秒timeoutで確認する。dial/writeのproduction既定は5秒、
close handshakeは2秒で打ち切ってunderlying socketを強制closeする。これらのproduction値はGo packageの
`DefaultConfig`をコード正本とし、test用configでは正数の範囲で短縮できる。

個別clientは再接続、backoff、generation、4接続の一括resetを行わない。`Connect`へ渡したcontextまたは明示
`Close`がreader/pingを停止し、goroutine joinとresult/event channel closeまで完了させる。

`internal/pipeline` のCoordinatorは4 clientをExtractor、Recognizer、Processor、Synthesizerの順で接続し、
全接続の`Activate`が成功した場合だけ同じgenerationとして公開する。途中失敗と公開前eventは部分setを逆順closeし、
generationを変えずに新しいclient setでretryする。running中のterminal eventはsingle-flight resetへ集約し、
lock下でgenerationを先に進めてから旧context、4 client、transient queue / in-flight stateを破棄する。
`Activate`へ渡すcallback closureはclient set公開時のgenerationを捕捉する。resultとevent callback、
external output enqueueは捕捉値と現在値を再確認し、旧generationを次段へ渡さない。stale dropのlogは
service名とservice別の累積drop countだけを持ち、認識文、音声、chat本文、原因errorを含めない。

browser入力は20 ms、16 kHz、mono、s16leの640-byte frameだけを受ける。running以外では保存せず拒否し、
running中は25 frame（500 ms）のbounded queueで最古の未送信frameだけをdropする。text / synthesized outputは
各16件で順序を維持し、5秒のbackpressureをsilent dropせずreset理由にする。external channelはsession lifetimeで
交換せずgeneration envelopeを返し、reset barrierでbuffer済み旧要素をdrainする。PCM overflowも
Coordinatorがqueue交換とは独立したsession累積値として所有し、Extractorのservice名と累積drop countだけを記録する。

confirmed chat historyだけをsession stateに保持する。partial recognition、current user message、
未完了processor response、未送信TTSはgeneration stateでありreset時に破棄する。Processorの中間resultは
request historyとの完全一致、final resultはrequest historyをprefixとするresponse追加済みhistoryとの完全一致を
検証した場合だけ受理し、finalだけをconfirmed historyへcommitする。
最後に受理したExtractorのspeech IDとsequence IDもsession stateとして保持する。sequence IDはgenerationを跨いで
strictly increasingとし、新generationの最初のspeech IDは直前generationより大きい値だけを受理する。
重複または逆行はprotocol failureとして、そのresultが届いた現在generationをresetする。

retryは1秒capから始まるfull jitterで、attempt 5以降は30秒capへ飽和する。`Close`またはStart context cancellationは
retry waiter、generation goroutine、clientをcancel / joinし、全producer終了後にexternal channelをcloseする。
通常経路ではこのCoordinatorがPion sessionに統合される。Python `AudioBroker` はaiortc診断用に残るが、新機能を追加しない。

## Timeout / Retry

- Receiver は timeout 付き recv で監視を継続する。
- coordinator は 1 秒起点、最大 30 秒程度の backoff で4接続を再作成する。
- 過負荷時は低遅延を優先し、古い frame の破棄を許容する。
- 移行中のGo個別clientは自動retryしない。上位coordinatorがterminal eventを受け、4接続を同じgenerationで
  作り直す責務を持つ。

## Versioning

- msgpack model に破壊的変更を入れる場合は、全 downstream service とGo pipeline coordinatorを同一タスクで更新する。
- WebSocket path 変更は compose、Consul service 名、fallback 設定も同時確認する。

## Test Matrix

| 観点          | 確認内容                                              |
| ------------- | ----------------------------------------------------- |
| Extractor     | 初期化 request と audio frame 送信が成立する          |
| Recognizer    | speech segment から confirmed / partial result が返る |
| TextProcessor | `talk_mode` 別 path で応答が返る                      |
| Synthesizer   | 応答 text から voice frame が返る                     |
| reconnect     | 1 系統切断後に4接続を新generationで一括再作成する     |

## References

- `documents/design/backend/services/audio-broker.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/archive/legacy-flat/networking_websocket.md`
