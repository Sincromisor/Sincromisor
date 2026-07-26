# Implementation Log: task-260726150803-pion-codec-poc-gate-1

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断とreview申し送りへの対応

- reviewはAPPROVEDであり、initial Offerだけを実装した。session ID付きOfferは501、unknown / closed sessionのcandidateはHTTP 200 + `status:false` とし、新規sessionへfallbackさせていない。
- repository rootでFrontendをbuildし、Go module rootから `--frontend-dir ../../sincromisor-frontend/dist` を指定した。同一origin以外のproxy、production Caddy / Consul / composeは変更していない。
- DataChannelはFrontend initiatorの `text_ch`（ordered / reliable）と `telop_ch`（unordered / maxRetransmits 0）を検証し、task.md固定payloadをserverからtext messageで1回だけ送った。Frontend返信は要求していない。
- comment auditは新規Go production codeとその直接のhelper / state / event / lifecycle / data transformationだけに限定した。既存Python / Frontend codeへ拡大していない。
- Chrome / local host candidate / inbound 100 packet / 1秒tone / 10 close / raceで判定した。NAT、Firefox、ICE restart、impairment、soak、性能比較、下流Python接続はPhase 2から4のまま戻していない。

### 実装上の判断

- inboundは `github.com/pion/opus v0.1.0` のpure Go decoderを48 kHz / 2 channel出力で使い、cgoをoutbound encoderだけへ限定した。
- outboundは `github.com/pion/mediadevices v0.10.0` 同梱static libopusを通常buildで使用した。`dynamic` build tagとsystem libopusは使用していない。
- browser入力から独立した20 ms tickerが、runtime生成した48 kHz mono / 1秒 / 440 Hz / -12 dBFS相当PCMを50 frame送る。
- `Session.Close`のcancel → PeerConnection / encoder close → goroutine join → registry removalをclose-onceへ統合した。callback自身からのcloseでself-joinしないようjoinとregistry removalはcleanup goroutineが担当し、`CloseAll`はdoneを待つ。
- closed sessionのcandidate判定用tombstoneはPoC process lifetimeだけ保持する。TTL / 上限とretry契約は `offer_request_id` / `offer_revision` とともにPhase 3で設計する。

### 実browserで詰まった点

1. STUN未指定時に `iceServers:null` を返してFrontend Zod schemaが拒否した。常にJSON array（未指定時は `[]`）を返すよう修正し、testを追加した。
2. Pionの `DataChannel.Send([]byte)` はChromeでArrayBufferとなり、Frontend parserが `[object ArrayBuffer]` をJSONとして拒否した。`SendText`へ変更し、固定JSONが画面に表示されinvalid payload warningが消えることを再確認した。
3. ChromeはOpus DTX中に空RTP payloadを送ることがあり、pure Go decoderへ渡すとcodec errorになった。空payloadは音声frameではないためdecode数へ含めず、次のnon-empty packetを待つよう修正した。malformed non-empty Opusは引き続きcodec errorとしてsessionをcloseする。
4. build済みFrontendのMediaPipe camera asset 404によりCharacterGazeは停止したが、microphone audio track、RTC接続、DataChannel、remote audioは成立した。本PoC判定には影響しない既存Frontend static asset境界としてartifactへ記録した。

### Manual Chrome smoke

- 環境: macOS 26.5.2 arm64、Google Chrome 150.0.7871.184 stable、Go 1.26.5。
- `npm --prefix ./sincromisor-frontend run build` 成功。
- module rootで `go run ./cmd/pion-poc --http 127.0.0.1:8080 --frontend-dir ../../sincromisor-frontend/dist` を起動し、`http://127.0.0.1:8080/simple-vrm/index.html` を開いた。
- ICEは `connected`、server registryは `active_sessions=1`。
- inboundは `packets=100 sample_rate=48000 channels=2 non_zero_samples=164174`。別の成立runでも `non_zero_samples=170100` を観測した。
- outboundは20 ms x 50 frameを送り、server logは `duration_ms=1000`。Chrome remote MediaStreamへ接続したAudioContext analyzerは `maxDeviation=33`（無音なら0）。
- `text_ch` / `telop_ch` の固定JSONがFrontend画面に `DataChannel smoke` と表示され、修正後runでinvalid payload warningなし。
- 通常page reload closeを10回連続実行し、10/10でconnectedと固定payload受信後、各回 `session registry updated active_sessions=0` へ収束した。
- SIGINT停止時は `initial_goroutines=3`、`final_goroutines=8`、差分+5、`active_sessions=0`。
- 判定はPASS。詳細は `artifacts/poc-result.md`。

### Comment audit

| path                           | symbol / block / decision / flow                          | kind                                        | current comment | reader question                                                    | required reader knowledge                                                 | decision（keep / rewrite / delete / add） | action / omission reason                                                                                                           | reviewer note                                                               |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------- | --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `cmd/pion-poc/main.go`         | package / `run`                                           | orchestration / process lifecycle           | 新規のためなし  | HTTP serve、signal、session cleanupは誰がどの順で所有するか        | config失敗とlisten失敗はmainへ返し、HTTP shutdown後に全sessionをjoinする  | add                                       | package commentと`run` doc commentへ入力、失敗、side effect、signal時のshutdown順序、production非対象を追加                        | `os.Exit`がmainだけにあり、goroutineにroot lifecycleとerror観測先があること |
| `internal/config/config.go`    | `Config` / `Load`                                         | API / boundary / validation                 | 新規のためなし  | path、STUN、timeoutはどこで拒否され、下流は何を仮定できるか        | static dirはabsolute既存directory、timeoutは正、STUNのみ、未知flagはerror | add                                       | package / type / function docとboundary validationを近接配置                                                                       | static不在、file指定、TURN、0 timeoutが起動前errorになること                |
| `internal/media/audio.go`      | constants / `GenerateTestPCM`                             | data / unit / constraint                    | 新規のためなし  | sample rate、frame duration、tone条件と後段変換は何か              | 48 kHz、20 ms、1秒、mono、440 Hz、-12 dBFS相当、resampleなし              | add                                       | exported constantとfunctionへ単位、波形、出力表現、非対象を記述                                                                    | `SampleRate` / `FrameDuration`がencoderとRTP pacingで共有されること         |
| `internal/media/audio.go`      | `ToneEncoder` / `NewToneEncoder` / `EncodeNext` / `Close` | API / codec lifecycle                       | 新規のためなし  | native resourceのowner、EOF、packet ownership、build失敗条件は何か | bundled static libopus、CGO/C compiler、50 frame後EOF、Close idempotent   | add                                       | 全exported symbolへ入力、出力、失敗、copy、native close、dynamic非対象を記述                                                       | packetがrelease後も有効なcopyで、二重closeしないこと                        |
| `internal/media/audio.go`      | `DecodeRemote` loop                                       | flow / codec boundary / data transformation | 新規のためなし  | RTPからPCMへ何を変換し、何をしないか、いつ終了するか               | 到着順、48 kHz、ctx/read/decode終了、reorder/resample/PLCなし             | add                                       | function docとChrome DTX空payload decision commentを追加                                                                           | empty payloadはcount/decodeせず、malformed non-emptyはerrorになること       |
| `internal/media/audio.go`      | `pcmReader.Read`                                          | private data flow                           | 新規のためなし  | PCM sliceはencoder frameへどう区切られ、pacingは誰が行うか         | 960 sample frame、padding/loopなし、tickerはsession ownership             | add                                       | privateでもpipeline位置とEOF/alignment failureを説明                                                                               | reader自身がclockを所有しないこと                                           |
| `internal/rtc/manager.go`      | `Offer` / `Answer` / `Candidate`                          | API / serialization boundary                | 新規のためなし  | nil candidate、ULID、JSON fieldは何を意味するか                    | nilはend-of-candidates、Answerはgather済み、既存field維持                 | add                                       | exported boundary typeへ意味と変換先を記述                                                                                         | JSON tagとFrontend契約が一致し追加fieldがないこと                           |
| `internal/rtc/manager.go`      | `Manager` / `NewManager`                                  | API / state / lock                          | 新規のためなし  | registry lock範囲、closed判定、network非対象は何か                 | lock中I/O禁止、process-lifetime tombstone、local host PoC                 | add                                       | type / constructor docへowner、lock、tombstone、TURN/NAT非対象を追加                                                               | commentが有限TTLを誤示せずPhase 3境界を示すこと                             |
| `internal/rtc/manager.go`      | `Create`                                                  | flow / signaling lifecycle                  | 新規のためなし  | sessionはいつregistryへ入り、timeout/error時どう回収されるか       | newSession後登録、negotiate失敗はclose-once、half-trickle待機             | add                                       | remote validationからAnswerまでと失敗時cleanupをdoc comment化                                                                      | invalid SDPでregistryが残らないこと                                         |
| `internal/rtc/manager.go`      | `AddCandidate`                                            | API / fallback                              | 新規のためなし  | unknown / closed / null / malformedをどう区別するか                | unknown/closedはfalse reason、nullはPion空candidate、fallbackなし         | add                                       | observable result、reject、非fallbackをdoc comment化                                                                               | HTTP handlerが200 + status:falseへ変換できること                            |
| `internal/rtc/manager.go`      | `CloseAll` / `remove`                                     | lifecycle / state transition                | 新規のためなし  | shutdownとcallback closeが競合した時、いつregistry=0か             | snapshot後lock外close、done join、remove後active count log                | add                                       | CloseAllへjoin責務、removeは命名と局所処理で明白なmap transitionのため追加doc省略。lock外logで前後関係が局所的に読める             | CloseAll return時にsnapshot sessionのdoneが閉じていること                   |
| `internal/rtc/session.go`      | `Session` / `newSession`                                  | lifecycle / resource ownership              | 新規のためなし  | PC、encoder、ticker、goroutineを誰が所有するか                     | session context、sync.Once、WaitGroup、done、registry callback            | add                                       | type docへclose順と競合contract、constructor flowへ近接commentsを追加                                                              | setup途中失敗でもPC/encoderが回収されること                                 |
| `internal/rtc/session.go`      | `negotiate`                                               | flow / HTTP-WebRTC boundary                 | 新規のためなし  | なぜgather完了までAnswerを返さないか                               | server candidate APIを追加しないhalf-trickle、ctx timeout                 | add                                       | candidateをSDPへ集約するdecision commentを待機直前へ追加                                                                           | timeoutが未完成Answerを返さないこと                                         |
| `internal/rtc/session.go`      | `installOutboundTrack` / `startTone`                      | orchestration / goroutine / pacing          | 新規のためなし  | RTCP readerとtickerのowner、tone開始条件、error遷移は何か          | connectedで一度開始、独立20 ms ticker、RTCP drain、error close            | add                                       | RTCP backpressure理由とpacing ownershipのblock commentを追加                                                                       | input arrivalをclockにせず、ticker stopとgoroutine joinがあること           |
| `internal/rtc/session.go`      | `installCallbacks` / `startInbound`                       | event / state transition / codec flow       | 新規のためなし  | callbackのevent sourceとclose条件、100 packet観測点は何か          | ICE close/failed/disconnected、audio Opusのみ、decode error close         | add                                       | callback名と型でevent sourceは局所的に読めるため逐語docは省略し、100 packet logとclose条件を実装・Session lifecycle docで接続      | unexpected track、codec errorが同じclose-onceへ入ること                     |
| `internal/rtc/session.go`      | `Close`                                                   | API / lifecycle / concurrency               | 新規のためなし  | close順、self-join回避、registry removal時点は何か                 | cancel→PC/encoder→async join→remove→done、idempotent                      | add                                       | exported methodへ失敗、副作用、順序、callback呼出し時の非同期cleanup理由を追加                                                     | race testで二重closeとregistry収束を確認できること                          |
| `internal/rtc/data_channel.go` | `handleDataChannel` / fixed payload                       | contract / constraint / event               | 新規のためなし  | channel属性とsend時点、binary/text、失敗時の扱いは何か             | in-band、open後1回、SendText、返信なし、属性違反close                     | add                                       | method flow commentとopen直前decision commentを追加                                                                                | task.md固定JSONと完全一致しFrontend parserを通ること                        |
| `internal/signaling/http.go`   | `SessionService` / `Server` / `New` / `Handler`           | API / HTTP boundary                         | 新規のためなし  | API/static precedence、body上限、test seam、副作用は何か           | API prefix優先、1 MiB、Newはlistenしない、static検証済み                  | add                                       | 全exported symbolへ責務、入力前提、失敗、副作用、非汎用化を記述                                                                    | unknown APIがstatic fallbackしないこと                                      |
| `internal/signaling/http.go`   | Offer handler flow                                        | orchestration / timeout / error mapping     | 新規のためなし  | 501 / 400 / 504はどこで決まり、session cleanupは誰が行うか         | schema validation後Create、gather timeout 504、Managerがclose             | add                                       | half-trickle timeout ownershipのblock commentを追加。private handler名とstatus分岐から局所的に読めるvalidationは追加doc省略        | malformed SDP/JSONがpanicせずrequest単位で終わること                        |
| `internal/signaling/http.go`   | Candidate handler flow                                    | fallback / compatibility                    | 新規のためなし  | late candidateをなぜ200で返すか                                    | transport successとapplication rejectを分離、fallback禁止                 | add                                       | 200 + status:false decision commentをresponse直前へ追加                                                                            | unknown / closed reasonが保持されること                                     |
| `internal/signaling/http.go`   | `decodeJSON` / `writeJSON`                                | private boundary / data transformation      | 新規のためなし  | oversized/trailing JSONとresponse失敗をどう扱うか                  | MaxBytesReader、単一JSON value、fixed JSON content type                   | add                                       | flowが3局所段階で読めるためdoc commentは省略。Server type commentが上限/reject契約を説明し、helper名とerror returnで前後関係が明白 | trailing JSONとoversizeが400、encode errorがprocess panicにならないこと     |

test codeはproduction comment audit対象外。新規testの意図はtest名とfailure messageで示し、binary fixture / generated code / TODOは追加していない。stale comment、rewrite/delete対象の既存commentは新規moduleのため存在しなかった。

### ドキュメント同期

- signaling公開schemaは変更していないため `documents/design/contracts/frontend-rtc.md` は更新不要。
- PoC実行要件・cwd・static path・停止方法はmodule READMEへ記録した。
- 採用判断を `ADR-260726-pion-codec-poc.md` にAcceptedとして記録し、`documents/design/index.md` から導線を追加した。
- `roadmap.md`、`implementation-phases.md`、`validation-plan.md`、`risks-and-decisions.md` を趣味プロダクト向けphase boundaryへ同期した。Gate 0詳細baselineを前提から外し、Firefox / NAT / ICE restart / impairment / soak / performance比較をPhase 3 / 4へ移した。
- production compose、Consul、env sample、Python service設計は公開設定・実行経路を変更していないため同期不要。

### 検証

- commit: `42f9142980fa77e9e42f622425fccb1490e260e8`
- `gofmt -l .`: 成功（出力なし）
- `go vet ./...`: 成功
- `go mod tidy -diff`: 成功（差分なし）
- `CGO_ENABLED=1 go build ./cmd/pion-poc`: 成功
- `go test ./...`: 成功
- `go test -race ./...`: 成功
- `npm run gate`: SHA `42f9142` の lint / build / test 全PASS（Frontend 79 files pass / 1 skipped、534 tests pass / 2 skipped）
- `npm run tasks:index:check`: 成功、12 category / 260 task、index変更なし
- `npm run tasks:check`: 成功、260 task directory
- `npm run commit:check`: 成功
- worktree: clean

### 逸脱・残リスク

- 仕様からの逸脱なし。
- Chrome smokeのcamera用MediaPipe asset 404は残るがRTC判定項目に影響せず、Frontend production codeはtask scopeどおり変更していない。
- process-lifetime closed-session tombstoneはPoC限定であり、長時間production運用のTTL / size budgetはPhase 3で必要。
- taskで非対象とされたNAT、Firefox、ICE restart、impairment、soak、CPU / memory / latency比較、下流Python接続は未検証。

## attempt 2

### 評価指摘への対応

- 評価FAILの原因だった通常close検証を修正した。`Manager.CloseAll`は`Cleanup`だけに置き、client側PeerConnection close前にserverの対象`Session`を取得して、その`done`がremote close eventによって閉じるまで待つ。10回連続closeの各回でregistryが0へ収束することと、終了時goroutine差分が+5以内であることを確認する。
- SIGTERM検証を実process境界へ引き上げた。test内で`pion-poc` binaryをbuild・起動し、実HTTP Offerでactive sessionを作成してから`syscall.SIGTERM`を送る。5秒以内のexit 0、HTTP listener停止、signal受信から`active_sessions=0`、process停止までのlogを確認する。
- `signaling.Server + rtc.Manager`の実構成で、malformed SDP、malformed non-null candidate、gather timeoutを検証した。malformed SDPとtimeoutはregistry 0へ回収され、candidate reject後に残る有効sessionはtest cleanupで0へ収束する。
- 通常close testを全suiteで実行した際、close eventが先にregistryからsessionを除去してhelper lookupが失敗するraceを検出した。client close前にsession pointerを捕捉し、その`done`を待つ形へ変更して、remote event起点であることと観測raceの両方を解消した。

### Comment audit

- attempt 2はtest codeとPoC結果artifactのみの変更で、production code、public API、boundary、heuristic、lifecycle、orchestration、state transition、event source、data transformation、private flowは変更していない。そのためproduction comment auditの対象はattempt 1から増えていない。
- testのreader questionは「remote close event単独でcleanupが完了するか」「OS signalからprocess shutdownまで実経路を通るか」「実Managerがsignaling error時にregistryを回収するか」であり、test名、明示的な待機条件、failure messageで必要知識を記録した。production commentの`keep` / `rewrite` / `delete` / `add`判断はすべてattempt 1のまま`keep`で、stale commentとTODOは追加していない。

### ドキュメント同期

- 自動検証の実態に合わせて`artifacts/poc-result.md`を更新し、remote event起点の10回close、実process SIGTERM、実Managerを使うsignaling error / timeout検証を明記した。
- productionの公開API、通信契約、公開挙動、設定、生成物は変更していないため、設計文書、README、API schema、compose、env sampleの追加同期は不要。

### 検証

- commit: `5032523b`（attempt 1からの追加コミット）
- `go test -count=10 ./internal/rtc -run TestManagerTenSequentialNormalClosesConverge`: 成功
- `go test -count=1 ./...`: 成功
- `go test -count=1 -race ./...`: 成功
- `gofmt -l .`: 成功（出力なし）
- `go vet ./...`: 成功
- `go mod tidy -diff`: 成功（差分なし）
- `npm run gate`: SHA `5032523`のlint / build / test全PASS（Frontend 79 files pass / 1 skipped、534 tests pass / 2 skipped）
- `npm run tasks:index:check`: 成功
- `npm run tasks:check`: 成功
- `npm run commit:check`: 成功
- worktree: clean

### 逸脱・残リスク

- 仕様からの逸脱なし。
- local socketを使うGo integration testは、bindが禁止されるsandboxではsandbox外実行が必要である。許可された実行環境では通常testとrace testの両方がPASSした。
- taskで非対象とされたNAT、Firefox、ICE restart、impairment、soak、CPU / memory / latency比較、下流Python接続、およびPoC限定tombstoneのproduction向けTTL / size budgetはattempt 1から変わらない。
