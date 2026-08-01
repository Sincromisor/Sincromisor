# Implementation Log: task-260802032903-pion-phase-3-inbound-audio-pipeline

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断・申し送り対応

- `acceptAudioTrack` が既に `wg.Add(1)` を行う ownership を維持し、`startInbound` では追加予約せず
  `InputProcessor.Run` だけを起動した。これにより track 受理から reader を開始しつつ、非同期
  `Session.cleanup` が PeerConnection close で RTP read を解除してから同じ WaitGroup を join できる。
- process-shared observer は `main -> ManagerDependencies -> SessionDependencies/newSession -> Session
-> NewInputProcessor` の順に注入した。nil は Manager と InputProcessor の両境界で拒否し、各 event
  は破棄判断位置で同期的に1回通知する。
- media readiness 前にも inbound reader が動くため、`Coordinator.SubmitPCM` の
  `ErrPipelineUnavailable` は frame を保持・再送せず `pipeline_unavailable` へ1件加算する。
  成功を返す Coordinator queue overflow は InputProcessor event にせず、Coordinator 側の責務を維持した。
- observer panic は `InputProcessor.Run` の goroutine boundary で error 化し、decode/submit error と同じ
  `Session.Close("media_error")` へ合流させた。cancel、PeerConnection close、WaitGroup join、registry
  remove の既存 close-once 順序は変更していない。
- RTP sequence は最初の値を `next` とし、`[next,next+63]` をbuffer、`next+64` 到着時に欠番を
  `missing` 確定する。送出済み履歴とmissing確定位置を分離し、再到着をそれぞれ
  `duplicate` / `late` に分類する。EOF/SSRC変更は連続prefixだけ送出し、gap以後をpacket単位の
  `buffered_drop` とした。context cancelはdecode/submitせずbufferを破棄する。
- SSRCごとにdecoder、FIR history/phase、端数frameを所有し、変更時に全stateを作り直す。
  sequence/timestamp unwrapの初期epochを1つ先に置き、低い初期値の直前packetもunsigned underflowなしで
  分類しつつ、16/32-bit wrapを通常の単調増加として継続する。
- FIRは仕様どおり63 tap、Kaiser beta=5.0、cutoff 7.2 kHz、DC gain正規化後1e-12丸めのliteralを正本とした。
  48 kHz入力index `n % 3 == 2` だけを出力し、packetを跨いでhistory/phaseを保持、EOF zero paddingなし、
  `math.Round` 後にint16へclampする。
- 仕様からの逸脱はない。初回 `bun run gate` は展開済みfrontend依存がなく `biome: not found` で停止したため、
  worktree内でlockfileどおり `npm ci` を行い再実行した。code/test failureではない。

### Comment audit

| path                              | symbol/block/decision/flow                                 | kind                                 | current comment                       | reader question                                         | required reader knowledge                                   | decision | action/omission reason                                                               | reviewer note                        |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| `internal/media/audio.go`         | package comment                                            | module/change surface                | PoC decode/encodeだけを記載           | production inbound変換のownerはどこか                   | packageがordering/PCM変換も所有する                         | rewrite  | RTP/Opus ordering・PCM変換をpackage責務へ追加                                        | staleなPoC限定表現を解消             |
| `internal/media/audio.go`         | `DecodeRemote`                                             | public boundary                      | reorder/resampleを「後続phase」と記載 | 新InputProcessorとの使い分けは何か                      | arrival-order diagnostic契約を維持する                      | rewrite  | productionはInputProcessor、DecodeRemoteは低水準diagnosticと明記                     | 既存public API契約を維持             |
| `internal/media/input_metrics.go` | `InputEvent` と各定数                                      | public telemetry contract            | 新規                                  | 各eventは何を1件と数えるか                              | duplicate/late/missing/drop/DTX/unavailableの境界           | add      | enum全種へ発生条件を記載                                                             | overflowを非対象と明記               |
| `internal/media/input_metrics.go` | `InputObserver`                                            | public concurrency/failure boundary  | 新規                                  | 通知単位、並行性、failure経路は何か                     | process共有、同期通知、panic合流                            | add      | eventごと1回、concurrent safe、戻り値なし、panic処理を記載                           | review申し送りを反映                 |
| `internal/media/input_metrics.go` | `InputCounterObserver` / constructor / observer / snapshot | public lifecycle/data transformation | 新規                                  | counter ownerとunknown event時の挙動は何か              | process lifetime atomic集計、payload非保持                  | add      | ownership、atomic snapshot、unknown event panicを記載                                | production初期observer契約           |
| `internal/media/input.go`         | `SubmitFunc`                                               | public downstream boundary           | 新規                                  | downstream frame契約は何か                              | 20 ms / 16 kHz / mono / s16le                               | add      | 入力表現とCoordinator位置を記載                                                      | queue ownershipは含めない            |
| `internal/media/input.go`         | `InputProcessor` / `NewInputProcessor`                     | public owner/dependency boundary     | 新規                                  | queueを持つか、observerをどう保持するか                 | synchronous pipeline、nil拒否、payload非通知                | add      | owner、変換段階、非対象、failureを記載                                               | task確定APIどおり                    |
| `internal/media/input.go`         | `Run`                                                      | public orchestration/lifecycle       | 新規                                  | ordering終端、SSRC reset、DTX、submit errorはどうなるか | window、prefix flush、state reset、drop/retry policy        | add      | 入力境界、終了条件、副作用、非対象を局所記載                                         | main change comprehension surface    |
| `internal/media/input.go`         | `inputStream` / `newInputStream`                           | private state transition             | 新規                                  | SSRC変更で何を捨てるか、wrap基準は何か                  | ordering/decoder/FIR/frameを同一streamで所有                | add      | reset対象と初期epoch理由を記載                                                       | privateでもlifecycle説明が必要       |
| `internal/media/input.go`         | `accept` / window advance                                  | private decision/heuristic           | 新規                                  | 64 packet境界で何をmissing確定するか                    | `[next,next+63]`、codec変更前分類                           | add      | bounded分類とcodec state非変更を記載                                                 | thresholdの失敗modeをtestで固定      |
| `internal/media/input.go`         | `flushPrefix` / `remember` / `dropBuffered`                | private flow/state transition        | 新規                                  | どの経路だけがdecodeでき、duplicateとlateをどう分けるか | contiguous prefix、送出履歴、gap後drop                      | add      | decoder mutationの唯一経路、履歴目的、packet単位通知を記載                           | EOF/SSRC/cancel cleanupを包含        |
| `internal/media/input.go`         | `decode` / `downmixStereo`                                 | private data transformation          | 新規                                  | codec出力からdownstream表現まで何段階か                 | stereo出力、mono複製、int32平均、FIR/frame化                | add      | 変換順とmono/stereo共通化、overflow回避を記載                                        | 左右反相zeroをgolden固定             |
| `internal/media/input.go`         | `unwrap16` / `unwrap32`                                    | private data representation          | 新規                                  | wrapでresetせずepochをどう選ぶか                        | reference最近傍のmodulo表現                                 | add      | sequence/timestampそれぞれの単調化を記載                                             | wrap通常系を局所理解可能             |
| `internal/media/resample.go`      | FIR coefficient table                                      | heuristic/decision                   | 新規                                  | tap/cutoff/window/roundingを変える影響は何か            | alias transition、DC gain、golden/SHA正本                   | add      | 数値根拠と変更時検証を記載                                                           | magic literal tableの安全変更面      |
| `internal/media/resample.go`      | `streamingResampler` / `process` / `clampPCM`              | private state/data transformation    | 新規                                  | packet境界、phase、先頭/EOF、丸めはどう扱うか           | streaming history、n%3、zero paddingなし、saturation        | add      | 入出力数とstate保持、round/clamp順を記載                                             | golden許容値と一致                   |
| `internal/rtc/manager.go`         | `ManagerDependencies` / `NewManager`                       | public dependency boundary           | factory/clock/loggerのみ              | observerの共有範囲と並行性は何か                        | process-shared observerを全sessionへ再利用                  | rewrite  | observer field、nil拒否、同期並行利用を記載                                          | mainからの配線を明示                 |
| `internal/rtc/manager.go`         | `Create` dependency flow                                   | orchestration                        | SessionDependencies既存flow           | observerはどこでsession ownerへ渡るか                   | Manager dependencyからnewSessionへの伝播                    | keep     | named fieldとconstructor引数でflowが局所的に追え、既存Create docのresource順序も有効 | stale commentなし                    |
| `internal/rtc/session.go`         | `SessionDependencies`                                      | public dependency boundary           | pipeline/clockのみ                    | observer payload/ownerは何か                            | process共有、drop decisionのみ                              | rewrite  | observer fieldと非保持契約を記載                                                     | reviewのowner指定を反映              |
| `internal/rtc/session.go`         | `Session` / `newSession`                                   | owner/lifecycle                      | Peer/Coordinator/codec owner          | InputProcessorを誰が作り保持するか                      | Session lifetimeでprocessorを1つ所有                        | rewrite  | owner一覧とconstructor組立対象へInputProcessorを追加                                 | nil observerをresource作成前に拒否   |
| `internal/rtc/session.go`         | cleanup summary stats removal                              | stale comment/data surface           | decode statsをclose logへ出力         | 新pipelineで旧arrival statsは有効か                     | InputProcessor telemetryが正本                              | delete   | staleなDecodeRemote stats state/logを削除                                            | cleanup順序コメントはkeep            |
| `internal/rtc/media.go`           | `startInbound`                                             | goroutine/lifecycle/orchestration    | DecodeRemote statsとcodec_error       | wg owner、readiness前drop、failure合流はどうなるか      | acceptAudioTrack予約、SubmitPCM unavailable、Close解除/join | rewrite  | 重複Add禁止、開始時期、正常/異常終了、close reasonを記載                             | freshness申し送りを直接反映          |
| `cmd/pion-poc/main.go`            | observer construction in `run`                             | process orchestration                | run全体のowner説明あり                | process-shared instanceはどこで一度作るか               | Manager dependency structがownershipを表現する              | keep     | `NewInputCounterObserver()`をManager生成位置で一度だけ評価し、追加逐語コメントは省略 | run docとnamed fieldで必要知識を充足 |
| production tests                  | 全変更test                                                 | test-only                            | 対象外                                | production理解に必要なcommentか                         | test名・table case・assertionが期待値を表す                 | keep     | comment audit対象外。意図が名前から読めないfixture helperだけ既存規約に従う          | acceptance directoryは未変更         |

### 検証

- `go test ./internal/media -count=1`: PASS
- `go test -race ./internal/media -count=1`: PASS
- `go vet ./...`: PASS
- `go test -race ./internal/media ./internal/rtc ./internal/pipeline -count=1`: PASS
- `go test -race ./... -count=1`: PASS
- `bun run gate`: PASS（lint / build / test）
- `bun run tasks:check`: PASS（273 task directories）

### ドキュメント同期

- 同期不要。公開WebRTC track、Audio Pipeline WebSocket、`Coordinator.SubmitPCM` の640-byte契約、
  `DecodeRemote` APIを変更せず、既存契約の内側へordering/downmix/resample/frame化を接続した。
  public barrel、schema、generated artifactへの影響もない。

### 未実行・残リスク

- 未実行なし（タスク指定の自動検証は全件実行）。
- 実browserからPython 4-serviceへ接続する手動end-to-endは本タスクの自動検証範囲外。
  codec/reorder/golden、Coordinator状態、session cleanupはunit/integration race testで検証した。

### Finalization

- Commit: `8c11ef9a6ba29ab67ee5f9962020952270713a8e`
- commit後のclean SHAに対して `bun run gate` を再実行し、lint / build / testを全件PASS・cache記録した。
- `npm run commit:check`: PASS。subject/body/footerは実改行で、`Refs:` にcanonical task IDを記録した。
- worktreeはclean。`acceptance/`、`task.md`、`meta.yaml`は変更していない。

## attempt 2

### FAIL 指摘への対応判断

- `[next,next+63]` の内側境界は、最初のpacket送出後の`next=1`に対するsequence 64を投入し、
  `missing`なしでEOF時に`buffered_drop`だけとなることを固定した。sequence 65の`next+64`は
  既存caseを明示名へ変更し、`missing` 1件と`buffered_drop` 1件を固定した。
- 実Opus経路は10 ms packetを使い、1 packetあたり160 sampleだけが16 kHz側へ生成される条件で
  packet間端数保持を観測した。mono/stereoそれぞれについて2 packet目で初めてsubmitされること、
  640-byte s16le、代表12 sample、frame全体SHA-256をgoldenとして固定した。
- SSRC resetは旧SSRCの非空10 ms OpusをdecodeしてFIR history / decimation phase / 160-sample frame端数を
  持たせた後、新SSRCのstereo Opus 2 packetを投入した。旧端数が混ざらず3 packet目で初めてsubmitされ、
  新SSRCだけをfresh InputProcessorへ渡したframeと完全一致することを固定した。これによりorderingだけでなく
  decoder、FIR、phase、frame remainderのresetを一続きに検証する。
- EOFは非空10 ms Opusをdecodeした未完成frameを0 submitで終了し、cancelは1 packet decode後の次readで
  cancellationを発生させて0 submitを明示assertした。
- READMEはmodule利用・検証文書として同期対象と判断し直した。Summaryへ現行inbound変換とtelemetryを追加し、
  Local Chrome smokeから削除済みstats logを除去、下流SpeechExtractorの640-byte受信と現行error logへ置換した。
  PoC boundariesから実装済みresample / pipeline投入 / RTP reorderを除外した。
- 仕様からの逸脱なし。productionの処理ロジックは変更せず、stale comment、README、focused regression
  coverageだけを修正した。

### Comment audit

| path                      | symbol/block/decision/flow | kind                                             | current comment                                                                 | reader question                                                            | required reader knowledge                                                                                                                  | decision | action/omission reason                                 | reviewer note                                                       |
| ------------------------- | -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `internal/media/audio.go` | `RTPReader`                | exported boundary / change comprehension surface | 「PoCはreorderせずreader順をdecode順」と記載し、production InputProcessorと矛盾 | readerはordering/decodeのどこまでを担い、2つのconsumerは到着順をどう扱うか | readerはnetwork到着順を提供し、InputProcessorはbounded reorder後にdecode、DecodeRemoteだけはdiagnosticとして到着順decode、NACK/PLCは非責務 | rewrite  | 現行consumerごとのordering責務と非対象をsymbol上へ記載 | attempt 1 auditで欠落した独立symbol。eval FAILのstale commentを解消 |

### Test coverage

- `TestInputProcessorOrderingAndTelemetry`
    - `next+63`: window内、`missing=0`、EOF `buffered_drop=1`
    - `next+64`: window外、`missing=1`、EOF `buffered_drop=1`
- `TestInputProcessorOpusToS16LEGolden`
    - mono / stereoの実Opus encoder・pure Go decoder経路
    - 10 ms packetを跨ぐ160 sample端数保持、2 packet目でのみsubmit
    - 320 sample / 640-byte s16le、代表sample列、frame SHA-256
- `TestInputProcessorSSRCChangeResetsCodecFIRPhaseAndFrameRemainder`
    - 旧SSRCの非空Opus partial stateを新SSRCへ持ち越さない
    - 新SSRC frameがfresh decoder/FIR/phase/frame stateと一致
- `TestInputProcessorDoesNotSubmitIncompletePCMAtEOFOrCancel`
    - EOF / context cancelの両方で非空Opus由来の未完成PCMを0 submit

### ドキュメント同期

- `sincromisor-server/sincro-rtc-pion-poc/README.md`をコードと同じ追加commitへ含める。
  公開schemaは不変だが、moduleのSummary、手動smoke、PoC非対象が実装済み機能と矛盾していたため同期が必要。
- API schema、設計契約、public barrel、生成物は変更なし。README以外の追加同期・再生成は不要。

### 検証

- `go test ./internal/media -count=1`: PASS
- `go vet ./...`: PASS
- `go test -race ./internal/media ./internal/rtc ./internal/pipeline -count=1`: PASS
- `go test -race ./... -count=1`: PASS
- `bun run gate`: PASS（dirty treeのlint / build / test）
- `bun run tasks:check`: PASS（273 task directories）

### 未実行・残リスク

- タスク指定の自動検証はcommit前時点で全件実行。commit後のclean SHA gateと`commit:check`は
  Finalizationで追記する。
- goldenはrepositoryが採用するbundled static libopus encoderとpure Go decoderの組合せを固定する。
  別Opus encoder実装のbitstream同一性は要求せず、production browser payloadのformat互換性は既存decode testと
  manual Chrome smokeの範囲に残る。

### Finalization

- Additional commit: `c525dcfaa69eca3a21fe27f0994e398c6f496713`
- commit後のclean SHAに対して`bun run gate`を再実行し、lint / build / testを全件PASS・cache記録した。
- `bun run tasks:check`: PASS（273 task directories）。
- `npm run commit:check`: PASS。追加commitのbodyに変更理由、README同期、検証、goldenの残リスクを記録した。
- worktreeはclean。`acceptance/`、`task.md`、`meta.yaml`は変更していない。
