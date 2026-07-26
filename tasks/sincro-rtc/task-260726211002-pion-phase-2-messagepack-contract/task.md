# Pion Phase 2のMessagePack互換層を固定する

## 背景 / 目的

Phase 1の `task-260726150803-pion-codec-poc-gate-1` は、Pion v4、pure Go Opus decode、
mediadevices同梱static libopus encode、half-trickle signaling、DataChannel、close-once lifecycleを
Google Chromeで成立させ、Gate 1をPASSした。Phase 2ではRTCへ直結する前に、Goから既存Python下流serviceを
利用する境界を固定する必要がある。

現在のpipeline契約はPythonのPydantic modelと `to_msgpack()` の実装が実質的な正本であり、
`documents/design/contracts/audio-pipeline-websocket.md` はmodel名までしか記載していない。
Go側でPython classを逐語移植すると、使わないfieldまで二重所有し、将来の変更時に乖離しやすい。

本タスクでは、Phase 2の最初のsliceとして、実際に各WebSocket方向で必要な限定DTO、MessagePack codec、
Python生成golden fixture、双方向互換testを追加する。WebSocket接続とpipeline lifecycleは後続タスクに分離し、
serialization不具合をtransport不具合から独立して検出できる状態にする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol/` を追加し、
      `dto.go` に下記「限定DTO」、`msgpack.go` に各wire direction専用のencode / decodeを実装する。
      DTOとcodecはこのGo moduleの `internal` に閉じ、Pythonのmethod構造や推論用modelを公開APIとして複製しない。
- [ ] `github.com/vmihailenco/msgpack/v5 v5.4.1` を直接dependencyとして `go.mod` / `go.sum` に固定する。
      JSON経由の変換や独自MessagePack parserは採用しない。dependency追加後に `go mod tidy -diff` が空になる。
- [ ] `internal/pipeline/protocol/testdata/generate_fixtures.py` が現在の `sincro_models` classと
      `to_msgpack()` を使い、固定入力から次の6 fixtureを生成する。
      `extractor_initialize.msgpack`、`extractor_result.msgpack`、`recognizer_result.msgpack`、
      `text_processor_request.msgpack`、`text_processor_result.msgpack`、
      `voice_synthesizer_result.msgpack`。生成時刻、ULID、音声byte列は固定値を明示的に渡し、
      同じcommitとPython環境で2回生成したSHA-256が一致する。
- [ ] `testdata/manifest.json` にfixtureごとのproducer、consumer、wire direction、主要field、
      byte length、SHA-256を記録する。generatorは一時directoryへの再生成とmanifest比較を行う
      `--check` modeを持ち、差分がある場合はnon-zeroで終了する。fixtureを手編集しない。
- [ ] Go compatibility testはPython producer / Go consumerである
      `extractor_result.msgpack`、`recognizer_result.msgpack`、`text_processor_result.msgpack`、
      `voice_synthesizer_result.msgpack` を確定済みproduction decoderでdecodeし、整数、float、bool、UTF-8 text、binary、
      `nil`、list、nested mapを期待値と照合する。特に `voice` はMessagePack binary、
      recognizerの `result` は文字列とscoreの2要素配列、optional fieldは明示的なnilとして検証し、
      `map[string]any` をprotocol package外へ返さない。
- [ ] Python compatibility testはGoがencodeした
      `SpeechExtractorInitializeRequest`、`SpeechExtractorResult`、`TextProcessorRequest` を対応する
      `from_msgpack()` でdecodeし、固定したPydantic modelと一致することを確認する。
      Goがproducerでない `TextProcessorResult` と `VoiceSynthesizerResult` は再encodeせず、
      Python生成bytesをGoがdecodeする方向だけを正本とする。`SpeechRecognizerResult` もGoではconsumerであり、
      Goはそこから別modelの `TextProcessorRequest` を生成するためproduction encode APIを追加しない。
- [ ] `TextProcessorResult` はroutingに必要な最小fieldをdecodeすると同時に受信したMessagePack bytesを
      `Raw` として保持できる。後続VoiceSynthesizer clientはこの `Raw` を変更せず転送する。
      `query` 全体をGo structへ複製せず、`VoiceSynthesizerResult` は `speech_id`、`message`、
      `mora_queue`、`speaking_time`、`voice`、`audio_format` だけを型付けし、未知fieldを無視する。
- [ ] decodeは空payload、top-level非map / non-string key、trailing object、必須field欠損、field型不正、textで来たvoice、
      不正なrecognizer tupleをerrorにする。未知map keyはPython側field追加とのforward compatibilityのため
      top-levelと全nested mapで無視する。payload全体のerror pathは `$`、field errorは
      `ProcessorResult.response_message.speech_id` のようなDTO名から始まる固定pathとする。
      errorにはmodel名とpathを含めるが、音声・認識文・chat本文の値は含めない。
- [ ] Python testは
      `sincromisor-server/sincro-models/tests/test_go_pipeline_protocol_compat.py`、
      Go producer helperは
      `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol/testdata/generate_go_payloads.go`
      に置く。Python test自身が `tempfile.TemporaryDirectory` を作り、repository内の固定module pathをcwdとして
      `go run ./internal/pipeline/protocol/testdata/generate_go_payloads.go --output-dir <temp>` を実行してから
      Pydanticでdecodeする。clean checkoutのrepository rootから、pytestを所有するroot dev groupを明示した
      `uv run --group dev --package sincro-models pytest sincromisor-server/sincro-models/tests/test_go_pipeline_protocol_compat.py`
      の1 commandで再現でき、既存 `.venv` や任意の環境変数へ依存しない。
- [ ] Python fileのlintをclean checkoutで再現するため、root `pyproject.toml` のdev dependencyへ
      `ruff>=0.12.5` を追加し `uv.lock` を更新する。versionの正本はlockfileとし、検証は
      `uv run --group dev --package sincro-models ruff check ...` と
      `uv run --group dev --package sincro-models ruff format --check ...` で行う。
- [ ] `documents/design/contracts/audio-pipeline-websocket.md` にwire direction別model、
      field名・型・optional / required、raw PCMだけがmodelなしのbinary frameであること、
      fixtureとgeneratorのpath、unknown field / malformed payloadの扱いを同期する。
      endpoint pathと既存Python payloadの意味は変更しない。
- [ ] production code変更とchange comprehension surfaceをcomment auditする。対象は新規
      `internal/pipeline/protocol/*.go` と、変更する `go.mod` に関係するdependency判断である。
      `impl.md` のauditは `path`、`symbol / block / decision / flow`、`kind`、`current comment`、
      `reader question`、`required reader knowledge`、`decision（keep / rewrite / delete / add）`、
      `action / omission reason`、`reviewer note` を持つ。package / exported symbol、wire direction、
      raw保持、unknown field、binary / nil表現、validation順序を説明し、逐語説明は追加しない。
      全新規package / exported type / field / functionをsymbol単位で監査する。各codec APIは責務、wire direction、
      入力境界、戻り値、error条件、allocation / defensive copy、副作用、提供しない逆方向codecを記述する。
      DTO fieldは秒単位のUnix time、sample rate / byte / channel単位、nil / zero / emptyの意味、
      `Raw` / `Voice` slice ownershipを記述する。private、短さ、型、test、既存codeの無commentを
      単独の省略理由にしない。comment追加前に命名、関数分割、型、package境界で明確化できるか確認し、
      構造改善だけをreader-oriented commentの省略理由にしない。stale commentは更新または削除し、
      TODOを追加する場合は理由、削除条件、canonical task ID、期限または判断基準を含める。
      評価者は変更対象とcomprehension surfaceを全件照合し、不適合ならFAILとする。
- [ ] module rootで `gofmt -l .` が空、`go vet ./...`、`go test ./...`、
      `go test -race ./...`、`go mod tidy -diff` が成功する。repository rootでfixtureのPython
      compatibility test、`npm run gate`、`npm run tasks:check` が成功する。

## 設計判断（着手前に確定済み）

### 所在と限定DTO

追加先はPhase 1で作成・検証済みの同一Go module
`sincromisor-server/sincro-rtc-pion-poc` とする。Phase 2だけの別 `go.mod` は作らない。
module renameとPoC commandのproduction化はRTC統合を行うPhase 3の責務であり、本タスクでは行わない。

`internal/pipeline/protocol/dto.go` の最小schemaを次に固定する。wire field名は
`msgpack:"..."` tagでsnake_caseへ固定する。

| DTO                   | 最小field                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExtractorInitialize` | `SessionID string`、`StartAt float64`、`VoiceSamplingRate int64`、`VoiceSampleBytes int64`、`VoiceChannels int64`                                                                                               |
| `ExtractorResult`     | `SessionID string`、`SpeechID int64`、`SequenceID int64`、`StartAt float64`、`Confirmed bool`、`Voice []byte`、`VoiceDType string`、`VoiceSamplingRate int64`、`VoiceSampleBytes int64`、`VoiceChannels int64`  |
| `RecognizerResult`    | `SessionID string`、`SpeechID int64`、`SequenceID int64`、`StartAt float64`、`Confirmed bool`、`Result []RecognitionToken`                                                                                      |
| `RecognitionToken`    | `Text string`、`Score float64`。wire上はmapではなく2要素array                                                                                                                                                   |
| `ChatMessage`         | `SpeechID int64`、`MessageID string`、`MessageType string`、`SpeakerID string`、`SpeakerName string`、`ExpressionCode *int64`、`Message string`、`CreatedAt float64`                                            |
| `ChatHistory`         | `Messages []ChatMessage`                                                                                                                                                                                        |
| `ProcessorRequest`    | `SessionID string`、`SequenceID int64`、`Confirmed bool`、`History ChatHistory`、`RequestMessage ChatMessage`                                                                                                   |
| `ProcessorResult`     | `SessionID string`、`SequenceID int64`、`Confirmed bool`、`History ChatHistory`、`RequestMessage ChatMessage`、`ResponseMessage ChatMessage`、`EndOfResponse bool`、`VoiceText *string`、`Raw []byte`（wire外） |
| `SynthesizerMora`     | `Vowel *string`、`Length float64`、`Text *string`                                                                                                                                                               |
| `SynthesizerResult`   | `SpeechID int64`、`Message string`、`MoraQueue []SynthesizerMora`、`SpeakingTime float64`、`Voice []byte`、`AudioFormat string`                                                                                 |

Pythonの `VoiceVoxQuery` はGo側でrouting、音声decode、mora同期に使わないためDTO化しない。
`TextProcessorResult` はPython producerからVoiceSynthesizerへ同じbytesを渡せるため、decode後の再encodeを禁止する。
これによりPython nested modelの完全複製案を退ける。

`internal/pipeline/protocol/msgpack.go` のproduction APIを次に固定する。method receiverや汎用
`Encode(any)` / `Decode(any)` は追加しない。

```go
func EncodeExtractorInitialize(value ExtractorInitialize) ([]byte, error)
func EncodeExtractorResult(value ExtractorResult) ([]byte, error)
func DecodeExtractorResult(payload []byte) (ExtractorResult, error)
func DecodeRecognizerResult(payload []byte) (RecognizerResult, error)
func EncodeProcessorRequest(value ProcessorRequest) ([]byte, error)
func DecodeProcessorResult(payload []byte) (ProcessorResult, error)
func DecodeSynthesizerResult(payload []byte) (SynthesizerResult, error)
```

encodeは返却sliceをcaller所有、decodeはpayload中の全binary / string / listを新規allocationへcopyして
返却DTO所有とする。`ProcessorResult.Raw` も同じ防御的copyであり、入力sliceを参照しない。

### field presence / nullable matrix

現在のPython `to_msgpack()` が出力するfieldをwire contractのrequired keyに固定する。
Python `from_msgpack()` / Pydanticにdefaultがあっても、Go codecは欠損keyをdefault補完せずerrorにする。
各modelのrequired keyは上記DTO表の全wire fieldであり、wire外の `ProcessorResult.Raw` だけ例外とする。
`SynthesizerResult.query` もrequiredなnon-nil mapとしてpresence / top-level typeだけ検証して破棄する。

| field群                                                                                   | 明示nil | empty                                                        | 欠損  |
| ----------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------ | ----- |
| `ChatMessage.expression_code`、`ProcessorResult.voice_text`、`SynthesizerMora.vowel/text` | 許可    | stringは許可                                                 | error |
| `ChatHistory.messages`、`RecognizerResult.result`、`SynthesizerResult.mora_queue`         | 不可    | empty listを許可                                             | error |
| `ExtractorResult.voice`、`SynthesizerResult.voice`                                        | 不可    | codec層ではempty binaryを許可。domain validationは後続client | error |
| その他のstring / number / bool / nested object                                            | 不可    | stringは許可、nested objectは型一致が必要                    | error |

nilとempty list / binaryは区別してtestする。全Python integerはGo `int64`へdecodeし、signed `int64` 範囲外を
codec errorにする。負値やdomain上限はwire表現として受理し、session / speech / formatの妥当性は後続client /
coordinatorへ委ねる。

### MessagePack解釈

- map keyはstring、field名は現在のPython `to_msgpack()` と完全一致させる。
- Python `int` はGoの `int64` で受け、wire上の符号付き・符号なし幅の違いは数値一致で検証する。
  `int64` 範囲外はcodec層で拒否する。
- Python `bytes` / NumPy `tobytes()` はMessagePack binaryとして扱い、stringへの暗黙変換をしない。
- `None` はnilで保持する。missing required fieldとnil optional fieldを同一視しない。
- `TextProcessorResult.Raw` は防御的copyを保持し、callerによる元slice変更で転送内容が変化しない。
- decoderは単一MessagePack objectを最後まで消費したことを確認する。trailing bytesを許可しない。

### fixture所有

fixtureのproducerはPythonである。Go testがgolden fileを書き換える方式は採らない。
Python generatorは現在のmodel classを直接importするため、model変更時にfixture、manifest、
Go compatibility testの更新が同じdiffへ現れる。音声fixtureは短い人工PCM / encoded byte列だけを使い、
実ユーザー音声、会話、秘密情報を含めない。

## スコープ境界

本タスクに含むもの:

- Go限定DTOとMessagePack codec
- Python生成golden fixtureとPython / Go compatibility test
- MessagePack契約文書のfield-level明確化

本タスクに含めないもの:

- WebSocket dial、Consul、fallback、ping、timeout
- 4 clientのgoroutine / close lifecycle
- pipeline queue、generation、reset、reconnect
- synthesized voice containerのdecode / resample（本タスクはencoded bytesとmoraの互換decodeまで）
- RTC、Opus RTP、DataChannel、Frontend、compose、現行Python service production codeの変更
- Protocol Buffers、OpenAPI、schema code generation

後続 `task-260726211007-pion-phase-2-pipeline-websocket-clients` は本タスクのprotocol APIとfixtureを利用し、
serializationを再実装しない。`task-260726211012-pion-phase-2-pipeline-reset-gate-2` が4 clientを束ね、
Gate 2を判定する。

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/implementation-phases.md:78` から `:100` がPhase 2の作業とGate 2、
  `documents/migration/pion/contracts-and-types.md:89` から `:117` が既存MessagePack維持、
  限定DTO、双方向fixtureの方針である。
- `sincromisor-server/sincro-models/src/sincro_models/SpeechExtractorInitializeRequest.py:8` から `:29` が
  初期化payload、`SpeechExtractorResult.py:10` から `:75` が抽出結果payloadである。
- `sincromisor-server/sincro-models/src/sincro_models/SpeechRecognizerResult.py:17` から `:77` が
  recognizer payloadと2要素tupleの表現である。
- `sincromisor-server/sincro-models/src/sincro_models/TextProcessorRequest.py:12` から `:48` と
  `TextProcessorResult.py:10` から `:144` がnested chat/historyを含むprocessor payloadである。
- `sincromisor-server/sincro-models/src/sincro_models/VoiceSynthesizerResult.py:10` から `:102` が
  mora、encoded voice、audio formatを含むsynthesizer responseである。
- `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizerWorker.py:41`
  から `:71` は `TextProcessorResult` bytesを受け、`VoiceSynthesizerResult` bytesを返す。
  Go専用の `VoiceSynthesizerRequest` wire modelへ置き換えない。
- `sincromisor-server/sincro-rtc-pion-poc/go.mod:1` から `:12` がPhase 1の単一Go moduleと直接dependencyである。
  同moduleへMessagePack dependencyを追加する。

## テスト

- Go golden decode:
    - Python producer / Go consumerの4 fixtureのfield値、nested model、nil、binary、tupleを
      production decoder経由のtable-driven testで照合する。
    - malformed、missing、wrong type、trailing bytes、unknown fieldを個別caseで検証する。
- Go encode / Python decode:
    - Go helperが3 producer DTOを一時directoryへ書き、Python testが対応Pydantic modelでdecodeする。
    - fixture generatorの `--check` を2回実行し、manifestとSHA-256が不変であることを確認する。
- ownership:
    - `ProcessorResult.Raw` が防御的copyであり、元payload変更後も保持bytesが変わらない。
    - codec APIがmutableな内部sliceや `map[string]any` を外へ返さない。
- gates:
    - module: `gofmt -l .`、`go vet ./...`、`go test ./...`、`go test -race ./...`、
      `go mod tidy -diff`
    - Python変更レイヤは次の3 command:

        ```sh
        uv run --group dev --package sincro-models ruff check sincromisor-server/sincro-models/tests sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol/testdata/generate_fixtures.py
        uv run --group dev --package sincro-models ruff format --check sincromisor-server/sincro-models/tests sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol/testdata/generate_fixtures.py
        uv run --group dev --package sincro-models pytest sincromisor-server/sincro-models/tests/test_go_pipeline_protocol_compat.py
        ```

    - repository: `npm run gate`、`npm run tasks:index:check`、`npm run tasks:check`

## ドキュメント同期の要否

要。公開済みWebSocket pathとPython payloadの意味は変えないが、Go consumerが依存するfield-level契約と
compatibility fixtureが正本として増えるため、`documents/design/contracts/audio-pipeline-websocket.md` に
wire direction、schema、validation、fixture pathを同期する。

Frontend RTC契約、compose、env sample、現在のPython service挙動は変更しないため同期不要である。
