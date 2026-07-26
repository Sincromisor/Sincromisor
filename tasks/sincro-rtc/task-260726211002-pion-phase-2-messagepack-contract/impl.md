# Implementation Log: task-260726211002-pion-phase-2-messagepack-contract

## Completion Summary

- direction 専用の Go MessagePack DTO/codec、Python production model 生成 fixture、
  Go/Python 双方向 compatibility test を追加した。
- required/nullable、固定 error path、unknown field、int64 範囲、binary/Raw slice ownership を検証し、
  WebSocket field-level 契約文書と Ruff/lockfile を同期した。

## Verification

- Go format/vet/test/race/tidy-diff、Python Ruff/pytest、fixture `--check` 連続 2 回が PASS。
- clean commit `ed34d3d2747a8e10e61c28744ebf36f781a87516` で `npm run gate`、
  `tasks:index:check`、`tasks:check`、`commit:check` が PASS。

## Not Run

- 実サービスへの WebSocket 接続、Consul、reset/reconnect lifecycle、RTC 統合は後続タスクのスコープ。

## attempt 1

### 判断と申し送り対応

- wire direction を API で分離し、task.md で固定された 7 codec だけを production surface にした。
  `RecognizerResult`、`ProcessorResult`、`SynthesizerResult` の encode と、test-only の逆方向
  decoder は追加していない。`ProcessorResult.Raw` は decode 時に防御的 copy し、再 encode
  せず VoiceSynthesizer へ渡す契約を維持した。
- Python producer fixture は現在の `sincro_models` class と `to_msgpack()` から生成した。
  Go producer の 3 payload は一時 directory で helper を実行し、既存 `from_msgpack()` で検証した。
- required key の presence と nullable を別々に検証した。unknown key は nested map を含めて破棄し、
  integer は signed `int64` 範囲へ正規化する。error は model と固定 path だけを含み、payload 値を含めない。
- `uv 0.11.28` は `--package sincro-models` 指定時に選択 member の dependency group を解決するため、
  task 指定の root dev group への Ruff 追加に加え、`sincro-models` に pytest/Ruff の dev group を明示した。
  これにより指定の clean-checkout command が既存 `.venv` へ依存せず成立する。仕様上の codec
  契約からの逸脱はない。
- fixture generator は固定時刻、固定 ID、人工 PCM/encoded bytes だけを使う。`--check` を連続 2 回
  実行し、fixture と manifest の byte/SHA-256 が決定的であることを確認した。

### ドキュメント同期

- `documents/design/contracts/audio-pipeline-websocket.md` に wire direction、field schema、
  required/nullable、raw PCM frame、unknown/malformed payload、slice ownership、fixture/generator path
  を同期した。endpoint path と既存 Python payload の意味は変更していない。
- Frontend RTC、compose、env sample は公開面を変更していないため同期不要。公開 barrel/生成型/配布生成物も
  変更していないため再生成不要。

### Comment audit

| path                   | symbol / block / decision / flow        | kind                        | current comment                      | reader question                         | required reader knowledge                                 | decision | action / omission reason                                                         | reviewer note                              |
| ---------------------- | --------------------------------------- | --------------------------- | ------------------------------------ | --------------------------------------- | --------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `protocol/doc.go`      | package `protocol`                      | navigation / boundary       | 新規、なし                           | pipeline のどこを担当するか             | serialization と transport lifecycle の責務境界           | add      | package comment に入力、出力、validation、非対象を記載                           | package comment と後続 client の境界を照合 |
| `protocol/dto.go`      | `ExtractorInitialize`                   | API / data                  | 新規、なし                           | 何を初期化する DTO か                   | Go → SpeechExtractor の direction                         | add      | type doc comment を追加                                                          | direction と用途を照合                     |
| 同上                   | `ExtractorInitialize.SessionID`         | data                        | 新規、なし                           | empty の意味は何か                      | session identifier、empty は codec で許可                 | add      | field comment を追加                                                             | empty policy を照合                        |
| 同上                   | `ExtractorInitialize.StartAt`           | data / unit                 | 新規、なし                           | 時刻基準は何か                          | Unix time 秒                                              | add      | field comment を追加                                                             | 単位を照合                                 |
| 同上                   | `ExtractorInitialize.VoiceSamplingRate` | data / unit                 | 新規、なし                           | 数値の単位は何か                        | samples/second                                            | add      | field comment を追加                                                             | PCM 単位を照合                             |
| 同上                   | `ExtractorInitialize.VoiceSampleBytes`  | data / unit                 | 新規、なし                           | channel を含む byte 数か                | sample/channel あたり byte                                | add      | field comment を追加                                                             | PCM 単位を照合                             |
| 同上                   | `ExtractorInitialize.VoiceChannels`     | data / unit                 | 新規、なし                           | 数値の意味は何か                        | channel 数                                                | add      | field comment を追加                                                             | PCM 単位を照合                             |
| 同上                   | `ExtractorResult`                       | API / boundary              | 新規、なし                           | なぜ双方向 DTO か                       | extractor result は recognizer input にもなる             | add      | type comment に境界用途を記載                                                    | wire 表を照合                              |
| 同上                   | `ExtractorResult.SessionID`             | data                        | 新規、なし                           | 値の lifecycle は何か                   | connection 中一定                                         | add      | field comment を追加                                                             | Python model と照合                        |
| 同上                   | `ExtractorResult.SpeechID`              | data                        | 新規、なし                           | partial 間で何を関連付けるか            | 発話識別子                                                | add      | field comment を追加                                                             | routing 用途を照合                         |
| 同上                   | `ExtractorResult.SequenceID`            | data                        | 新規、なし                           | 何の順序か                              | extractor result の送信順                                 | add      | field comment を追加                                                             | routing 用途を照合                         |
| 同上                   | `ExtractorResult.StartAt`               | data / unit                 | 新規、なし                           | 時刻基準は何か                          | 発話開始 Unix time 秒                                     | add      | field comment を追加                                                             | 単位を照合                                 |
| 同上                   | `ExtractorResult.Confirmed`             | data / state                | 新規、なし                           | true の状態は何か                       | 発話区間確定                                              | add      | field comment を追加                                                             | state を照合                               |
| 同上                   | `ExtractorResult.Voice`                 | data / ownership            | 新規、なし                           | binary、empty、slice owner は何か       | raw PCM、empty 許可、decode DTO 所有                      | add      | field comment に encode/decode ownership を記載                                  | mutation test と照合                       |
| 同上                   | `ExtractorResult.VoiceDType`            | data                        | 新規、なし                           | Voice をどう解釈するか                  | sample 型名、domain validation は後段                     | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `ExtractorResult.VoiceSamplingRate`     | data / unit                 | 新規、なし                           | 単位は何か                              | samples/second                                            | add      | field comment を追加                                                             | PCM 単位を照合                             |
| 同上                   | `ExtractorResult.VoiceSampleBytes`      | data / unit                 | 新規、なし                           | byte 数の基準は何か                     | sample/channel あたり byte                                | add      | field comment を追加                                                             | PCM 単位を照合                             |
| 同上                   | `ExtractorResult.VoiceChannels`         | data / unit                 | 新規、なし                           | 数値の意味は何か                        | channel 数                                                | add      | field comment を追加                                                             | PCM 単位を照合                             |
| 同上                   | `RecognizerResult`                      | API / direction             | 新規、なし                           | なぜ encode しないか                    | Python producer/Go consumer 専用                          | add      | type comment に提供しない逆方向 API を記載                                       | production API 一覧を照合                  |
| 同上                   | `RecognizerResult.SessionID`            | data                        | 新規、なし                           | 値の lifecycle は何か                   | connection 中一定                                         | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `RecognizerResult.SpeechID`             | data                        | 新規、なし                           | 認識元との関係は何か                    | 元発話 ID                                                 | add      | field comment を追加                                                             | routing 用途を照合                         |
| 同上                   | `RecognizerResult.SequenceID`           | data                        | 新規、なし                           | 何の順序か                              | 元 extractor result の順序                                | add      | field comment を追加                                                             | routing 用途を照合                         |
| 同上                   | `RecognizerResult.StartAt`              | data / unit                 | 新規、なし                           | 時刻基準は何か                          | 発話開始 Unix time 秒                                     | add      | field comment を追加                                                             | 単位を照合                                 |
| 同上                   | `RecognizerResult.Confirmed`            | data / state                | 新規、なし                           | true の状態は何か                       | 元発話確定                                                | add      | field comment を追加                                                             | state を照合                               |
| 同上                   | `RecognizerResult.Result`               | data / nullable             | 新規、なし                           | nil と empty の差は何か                 | nil 拒否、empty 許可、tuple 順序保持                      | add      | field comment を追加                                                             | malformed/empty test と照合                |
| 同上                   | `RecognitionToken`                      | API / representation        | 新規、なし                           | wire で map か array か                 | 2 要素 array                                              | add      | type comment を追加                                                              | tuple decoder と照合                       |
| 同上                   | `RecognitionToken.Text`                 | data                        | 新規、なし                           | text の表現は何か                       | UTF-8 string                                              | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `RecognitionToken.Score`                | data                        | 新規、なし                           | codec が範囲を制限するか                | float、domain 範囲は後段                                  | add      | field comment を追加                                                             | validation と照合                          |
| 同上                   | `ChatMessage`                           | API / nested data           | 新規、なし                           | 何のための限定 model か                 | processor nested message                                  | add      | type comment を追加                                                              | Python model と照合                        |
| 同上                   | `ChatMessage.SpeechID`                  | data                        | 新規、なし                           | 発話との関係は何か                      | 元発話 ID                                                 | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `ChatMessage.MessageID`                 | data / constraint           | 新規、なし                           | ULID を codec が検証するか              | 形式検証は非対象                                          | add      | field comment を追加                                                             | domain 境界を照合                          |
| 同上                   | `ChatMessage.MessageType`               | data                        | 新規、なし                           | downstream 用途は何か                   | frontend 表示種別                                         | add      | field comment を追加                                                             | Python model と照合                        |
| 同上                   | `ChatMessage.SpeakerID`                 | data                        | 新規、なし                           | `@` を含むか                            | `@` なし identifier                                       | add      | field comment を追加                                                             | Python model と照合                        |
| 同上                   | `ChatMessage.SpeakerName`               | data                        | 新規、なし                           | ID との違いは何か                       | 表示名                                                    | add      | field comment を追加                                                             | Python model と照合                        |
| 同上                   | `ChatMessage.ExpressionCode`            | data / nullable             | 新規、なし                           | nil と zero の差は何か                  | nil は未指定、zero は有効                                 | add      | field comment を追加                                                             | nullable fixture と照合                    |
| 同上                   | `ChatMessage.Message`                   | data                        | 新規、なし                           | empty は許されるか                      | empty string 許可                                         | add      | field comment を追加                                                             | nullable matrix と照合                     |
| 同上                   | `ChatMessage.CreatedAt`                 | data / unit                 | 新規、なし                           | 時刻基準は何か                          | Unix time 秒                                              | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `ChatHistory` / `Messages`              | API / nullable              | 新規、なし                           | nil と empty の差は何か                 | 時系列 list、nil 拒否、empty は履歴なし                   | add      | type/field comment を追加                                                        | encoder/decoder と照合                     |
| 同上                   | `ProcessorRequest`                      | API / direction             | 新規、なし                           | 何を TextProcessor へ渡すか             | 認識発話と確定履歴                                        | add      | type comment を追加                                                              | Go producer helper と照合                  |
| 同上                   | `ProcessorRequest.SessionID`            | data                        | 新規、なし                           | 値の lifecycle は何か                   | connection 中一定                                         | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `ProcessorRequest.SequenceID`           | data                        | 新規、なし                           | 何の順序か                              | 元認識結果の順序                                          | add      | field comment を追加                                                             | routing 用途を照合                         |
| 同上                   | `ProcessorRequest.Confirmed`            | data / state                | 新規、なし                           | true の意味は何か                       | 元発話確定                                                | add      | field comment を追加                                                             | state を照合                               |
| 同上                   | `ProcessorRequest.History`              | data / flow                 | 新規、なし                           | request 前後どちらの履歴か              | 処理前の確定履歴                                          | add      | field comment を追加                                                             | Python model と照合                        |
| 同上                   | `ProcessorRequest.RequestMessage`       | data / flow                 | 新規、なし                           | 今回処理する message はどれか           | current user message                                      | add      | field comment を追加                                                             | Python model と照合                        |
| 同上                   | `ProcessorResult`                       | API / flow                  | 新規、なし                           | なぜ query を複製しないか               | routing field decode + Raw unchanged forwarding           | add      | type comment を追加                                                              | Raw 転送契約を照合                         |
| 同上                   | `ProcessorResult.SessionID`             | data                        | 新規、なし                           | 値の lifecycle は何か                   | connection 中一定                                         | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `ProcessorResult.SequenceID`            | data                        | 新規、なし                           | 何の順序か                              | processor request 順序                                    | add      | field comment を追加                                                             | routing 用途を照合                         |
| 同上                   | `ProcessorResult.Confirmed`             | data / state                | 新規、なし                           | true の意味は何か                       | request 元発話確定                                        | add      | field comment を追加                                                             | state を照合                               |
| 同上                   | `ProcessorResult.History`               | data / flow                 | 新規、なし                           | どの時点の履歴か                        | result 時点の確定履歴                                     | add      | field comment を追加                                                             | nested decode と照合                       |
| 同上                   | `ProcessorResult.RequestMessage`        | data                        | 新規、なし                           | response との関係は何か                 | 応答対象 user message                                     | add      | field comment を追加                                                             | nested decode と照合                       |
| 同上                   | `ProcessorResult.ResponseMessage`       | data                        | 新規、なし                           | streaming 中も入るか                    | 生成中または生成済み response                             | add      | field comment を追加                                                             | nested decode と照合                       |
| 同上                   | `ProcessorResult.EndOfResponse`         | data / state                | 新規、なし                           | true の状態は何か                       | streaming 終了                                            | add      | field comment を追加                                                             | state を照合                               |
| 同上                   | `ProcessorResult.VoiceText`             | data / nullable             | 新規、なし                           | nil の意味は何か                        | TTS 増分なし                                              | add      | field comment を追加                                                             | explicit nil fixture と照合                |
| 同上                   | `ProcessorResult.Raw`                   | data / ownership            | 新規、なし                           | input slice を参照するか                | DTO 所有の防御的 copy、変更せず転送                       | add      | field comment を追加                                                             | ownership test と照合                      |
| 同上                   | `SynthesizerMora`                       | API / data                  | 新規、なし                           | query 全体との差は何か                  | 同期用最小 timing                                         | add      | type comment を追加                                                              | 限定 DTO を照合                            |
| 同上                   | `SynthesizerMora.Vowel`                 | data / nullable             | 新規、なし                           | nil と empty の差は何か                 | nil は値なし、empty は有効                                | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `SynthesizerMora.Length`                | data / unit                 | 新規、なし                           | 単位は何か                              | 秒                                                        | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `SynthesizerMora.Text`                  | data / nullable             | 新規、なし                           | nil と empty の差は何か                 | nil は値なし、empty は有効                                | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `SynthesizerResult`                     | API / direction             | 新規、なし                           | query をなぜ保持しないか                | required map として検証後に破棄、Python producer 専用     | add      | type comment を追加                                                              | decoder と API 不在を照合                  |
| 同上                   | `SynthesizerResult.SpeechID`            | data                        | 新規、なし                           | 何を関連付けるか                        | 元発話 ID                                                 | add      | field comment を追加                                                             | routing 用途を照合                         |
| 同上                   | `SynthesizerResult.Message`             | data                        | 新規、なし                           | voice との関係は何か                    | 音声生成元 text                                           | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `SynthesizerResult.MoraQueue`           | data / nullable             | 新規、なし                           | nil と empty の差は何か                 | nil 拒否、empty 許可、再生順                              | add      | field comment を追加                                                             | decoder と照合                             |
| 同上                   | `SynthesizerResult.SpeakingTime`        | data / unit                 | 新規、なし                           | 単位は何か                              | 秒                                                        | add      | field comment を追加                                                             | fixture と照合                             |
| 同上                   | `SynthesizerResult.Voice`               | data / ownership            | 新規、なし                           | binary、empty、owner は何か             | encoded binary、empty 許可、DTO 所有                      | add      | field comment を追加                                                             | ownership と type test を照合              |
| 同上                   | `SynthesizerResult.AudioFormat`         | data / constraint           | 新規、なし                           | codec が MIME を検証するか              | domain validation は後段                                  | add      | field comment を追加                                                             | scope 境界を照合                           |
| `protocol/msgpack.go`  | `EncodeExtractorInitialize`             | API / direction             | 新規、なし                           | direction、入力境界、戻り値は何か       | Go → extractor、caller-owned payload、serialization error | add      | function doc comment を追加                                                      | 固定 API と照合                            |
| 同上                   | `EncodeExtractorResult`                 | API / direction / ownership | 新規、なし                           | Voice nil/copy と逆方向はどうなるか     | Go → recognizer、nil reject、返却 storage 独立            | add      | function doc comment を追加                                                      | Python decode test と照合                  |
| 同上                   | `DecodeExtractorResult`                 | API / direction / ownership | 新規、なし                           | unknown/malformed と slice owner は何か | Python → Go、required/type/trailing、DTO-owned slices     | add      | function doc comment を追加                                                      | golden/malformed test と照合               |
| 同上                   | `DecodeRecognizerResult`                | API / direction             | 新規、なし                           | tuple error と逆方向はどうなるか        | Python → Go、2 要素 tuple、encode 非提供                  | add      | function doc comment を追加                                                      | tuple test と API 不在を照合               |
| 同上                   | `EncodeProcessorRequest`                | API / direction / nullable  | 新規、なし                           | nested nil と返却 owner は何か          | Go → Python、nil list reject、optional nil 出力           | add      | function doc comment を追加                                                      | Python decode test と照合                  |
| 同上                   | `DecodeProcessorResult`                 | API / flow / ownership      | 新規、なし                           | Raw はいつ copy されどこへ行くか        | Python → Go → VoiceSynthesizer unchanged、入力非参照      | add      | function doc comment を追加                                                      | Raw mutation test と照合                   |
| 同上                   | `DecodeSynthesizerResult`               | API / direction / ownership | 新規、なし                           | query/voice/逆方向の扱いは何か          | query type のみ検証、binary copy、encode 非提供           | add      | function doc comment を追加                                                      | golden/malformed test と照合               |
| 同上                   | `decodeRoot`                            | boundary / validation flow  | 新規、なし                           | validation の最初に何を確定するか       | 単一 object、string-key map、trailing reject              | add      | block/function comment を追加                                                    | `$` error path と malformed test を照合    |
| `protocol/decode.go`   | model decode flow                       | data transformation         | 新規、なし                           | raw map をどの順で限定 DTO 化するか     | presence/type を field 順に検証し unknown を破棄          | add      | exported codec comment と `requiredMessage` flow comment で前後関係を記載        | fixed path と nested decode を照合         |
| 同上                   | `requiredMessage`                       | nested boundary             | 新規、なし                           | nested path をどう維持するか            | caller path を保持し payload 値を出さない                 | add      | function comment を追加                                                          | `response_message.speech_id` test を照合   |
| `protocol/validate.go` | `requiredValue` validation flow         | constraint                  | 新規、なし                           | missing と nil をどう区別するか         | presence を先に判定、nullable helper で nil を判定        | add      | function comment を追加                                                          | presence matrix を照合                     |
| 同上                   | `asInt64`                               | data transformation         | 新規、なし                           | Python int と wire width をどう扱うか   | signed/unsigned 正規化、MaxInt64 超過 reject              | add      | function comment を追加                                                          | overflow test を照合                       |
| `go.mod` / `go.sum`    | msgpack dependency decision             | dependency                  | 宣言 file のため source comment なし | なぜ直接 dependency か                  | JSON/独自 parser を避け v5.4.1 に固定                     | keep     | `go.mod` の direct require が正本。逐次 comment は module 宣言を重複するため省略 | `go mod tidy -diff` と version を照合      |

`decode.go` の個々の private scalar helper は、`requiredValue` の presence 段階と型名が局所的に
入力・出力・失敗条件を示し、副作用/resource/domain 固有判断を持たない。validation pipeline の
位置と missing/nil 分離は `requiredValue` comment で説明したため、逐語的な comment は省略した。
stale comment と TODO は追加していない。test、fixture、generator は production comment audit
対象外だが、fixture generator の public Python function には目的、入力/出力、副作用を docstring で記載した。

### Verification

- `gofmt -l .`（出力なし）
- `go vet ./...`
- `go test ./...`
- `go test -race ./...`
- `go mod tidy -diff`（出力なし）
- `uv run --group dev --package sincro-models ruff check ...`
- `uv run --group dev --package sincro-models ruff format --check ...`
- `uv run --group dev --package sincro-models pytest sincromisor-server/sincro-models/tests/test_go_pipeline_protocol_compat.py`
- fixture generator `--check`（連続 2 回）
- `npm run gate`
- `npm run tasks:index:check`
- `npm run tasks:check`

Go full test/race は sandbox 内の loopback/mDNS bind 制限では既存 Pion test が失敗したため、
socket bind を許可した同一 worktree で再実行し PASS した。

### 残リスク

- codec は domain 値（negative ID、sampling rate 上限、audio MIME 対応可否）を意図的に検証しない。
  後続 pipeline client/coordinator が担当する。
- WebSocket transport、Consul、timeout、reset lifecycle は本タスクのスコープ外であり、後続
  `task-260726211007-pion-phase-2-pipeline-websocket-clients` 以降で接続する。
