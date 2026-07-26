# Implementation Log: task-260726211007-pion-phase-2-pipeline-websocket-clients

## Completion Summary

- Consul/fallback resolverと4つのtyped WebSocket clientを実装し、binary protocol、固定上限、
  terminal event、context/Closeによるgoroutine joinを追加した。
- audio pipeline契約とAudioBroker移行文書を同期し、commit `eeb4cc1c`へまとめた。

## Verification

- Go moduleの`gofmt`、`go vet`、通常/race test、`go mod tidy -diff`はPASS。
- clean commit SHAで`npm run gate`、`npm run tasks:check`、`npm run commit:check`はPASS。

## Not Run

- 実Python 4 serviceとのend-to-endとproduction Pion session配線は後続Phaseのため未実行。

## attempt 1

### 判断と申し送りへの対応

- discoveryのservice名を正本にし、client側のnamed `Service` constantsは一箇所で明示変換した。health eventと
  lookup対象の文字列が別々に増殖しない構造とした。
- Consul base URL空文字は意図的な無効化として`consul_disabled` fallbackにし、設定済みURLの構文不正は
  constructor errorにした。注入された`*http.Client`もcopyして`CheckRedirect`を拒否へ上書きするため、
  callerのredirect policyで保護が失われない。
- fallbackはConsulを実際に使えない時点で検証する。欠損・不正時のerrorには対象service名を含める一方、
  credential、response body、service payloadは含めない。Consulの5xx、不正JSON、1 MiB超過、不正worker endpointは
  `request_failed`、0件だけを`no_healthy_instance`とした。
- `coder/websocket.ErrMessageTooBig`を`errors.Is`で判定し、close statusの文字列には依存せず
  `EventMessageTooLarge`へ分類した。上限ちょうどはprotocol decoderへ到達し、上限+1はtyped eventになるtestを置いた。
- close handshake helperは設定timeout後に`CloseNow`へ切り替えた後、開始したhelperの結果channelを必ず受けてjoinする。
  connection reader/pingもclient lifetimeの`WaitGroup`でjoinし、result/event channelのclose ownerをbase clientだけにした。
- Synthesizerは`Raw`非空だけをdecode成功の証拠にせず、`DecodeProcessorResult(value.Raw)`を再実行してdecoded sessionと
  DTO sessionの両方をclient sessionへ照合する。送信bytesは再encodeせず元`Raw`をそのまま渡す。
- 仕様からの逸脱はない。個別client内のretry、backoff、generation、queue、4接続一括resetは追加していない。

### Verification

- `go test ./internal/pipeline/discovery ./internal/pipeline/client`: PASS
- `go test -race ./internal/pipeline/discovery ./internal/pipeline/client`: PASS
- module root `go vet ./...`: PASS
- module root `go test ./...`: PASS
- module root `go test -race ./...`: PASS
- module root `go mod tidy -diff`: PASS
- module root `gofmt -l .`: output empty
- repository root `npm run gate`: PASS（lint / frontend build / 79 passed + 1 skipped test files）
- repository root `npm run tasks:check`: PASS（263 task directories）

### Documentation sync

- `documents/design/contracts/audio-pipeline-websocket.md`へGo clientの固定endpoint利用、binary-only、
  ping/dial/write/close timeout、有限上限、context/Closeによるjoin、個別clientがretryしない責務境界を同期した。
- `documents/design/backend/services/audio-broker.md`へ移行中のGo discovery/client packageを追記し、
  Python AudioBrokerがまだproduction接続・再接続を所有していて置換未完了であることを明記した。
- 公開barrel、生成型、OpenAPI、compose/envの変更はないため生成物同期は不要。Go module dependencyは
  `go mod tidy`で直接dependencyとして同じcommitへ同期した。

### Comment audit

新規production codeのため`current comment`は全件「なし」。構造と命名を先に整理したうえで、局所コードだけでは
読めない契約、失敗条件、observable output、ownership、retry非責務をdoc commentまたは近接flow commentへ追加した。

| path                    | symbol / block / decision / flow                        | kind                     | current comment | reader question                             | required reader knowledge                                                 | decision | action / omission reason                                       | reviewer note                           |
| ----------------------- | ------------------------------------------------------- | ------------------------ | --------------- | ------------------------------------------- | ------------------------------------------------------------------------- | -------- | -------------------------------------------------------------- | --------------------------------------- |
| `discovery/resolver.go` | package flow                                            | navigation / boundary    | なし            | pipeline全体のどこまで担当するか            | lookupのみで接続/watch/retryを持たずsource/reasonを返す                   | add      | package commentへ責務境界を追加                                | client側へretryが漏れていないか         |
| 同上                    | `Service`と4 constants                                  | API / constraint         | なし            | 任意文字列をlookupできるか                  | 許可するPython service名は4値だけ                                         | add      | typeと各constantへ許可境界を追加                               | unknown serviceを拒否するか             |
| 同上                    | `EndpointSource` / `FallbackReason`とconstants          | API / fallback           | なし            | fallback成功をどう観測するか                | errorではなくsource/reasonでdisabled/request/0件を区別する                | add      | 各typed valueの意味を追加                                      | 5xxを0件へ偽装しないか                  |
| 同上                    | `Endpoint`                                              | API / ownership          | なし            | HostをURLとして再解釈してよいか             | validation済みhost/port、Source時のreason invariant                       | add      | field間contractをdoc comment化                                 | external path混入がないか               |
| 同上                    | `Resolver`                                              | API / lifecycle          | なし            | cache/watch/retryも所有するか               | 1回解決だけで接続はcaller責務                                             | add      | observable outputと非責務を追加                                | interfaceが過大でないか                 |
| 同上                    | `ResolverConfig`                                        | API / validation         | なし            | 空URLと不正URLの差は何か                    | 空はdisable、設定済みoriginは厳格検証、timeout正数                        | add      | zero/validation意味を追加                                      | constructorとResolveの検証時点          |
| 同上                    | `NewResolver`                                           | API / security           | なし            | 注入clientはredirectを許すか                | copy後にredirect拒否、nil chooserはcrypto/rand、network I/Oなし           | add      | 副作用、error、default dependencyを追加                        | credential転送を防ぐか                  |
| 同上                    | `Resolve`                                               | API / fallback           | なし            | 何がfallbackで何がerrorか                   | typed reason、service-specific invalid fallback error、payload非露出      | add      | 戻り値とfailure分類を追加                                      | fallback reasonの網羅性                 |
| 同上                    | `lookup` flow                                           | boundary / data          | なし            | HTTP bodyをどこまで信頼するか               | timeout、2xx、1 MiB、JSON schema、全worker endpoint検証の順序             | add      | function分割と境界処理で段階を局所化                           | body/worker値がerrorへ出ないか          |
| 同上                    | `validateBaseURL` / `validateHost`                      | constraint / security    | なし            | URL component injectionをどう防ぐか         | origin限定、host/IP限定、scheme/path/query/userinfo拒否                   | add      | 名前と固定errorで境界を明確化、逐語commentは省略               | IPv6とDNS hostを許可するか              |
| 同上                    | `cryptoChoose`                                          | heuristic                | なし            | worker選択は偏るか                          | crypto/randの`[0,n)`一様選択、0件拒否                                     | add      | production chooserの根拠をNewResolver commentで包含            | injected chooser範囲も検証するか        |
| `client/client.go`      | package flow                                            | navigation / lifecycle   | なし            | 個別clientとcoordinatorの境界は何か         | 1接続I/O/joinのみ、retry/generation/queueは非責務                         | add      | package commentへ全体位置を追加                                | generic client化し過ぎていないか        |
| 同上                    | `Service`と4 constants                                  | API / mapping            | なし            | discovery名とevent名が乖離しないか          | discovery constantsから一箇所で明示変換                                   | add      | 各constantへ正本関係を追加                                     | review申し送りの一元化                  |
| 同上                    | `EventKind`とconstants                                  | API / event              | なし            | terminal sourceをどう判別するか             | remote/ping/read/write/decode/limitの排他的分類                           | add      | 各event sourceを追加                                           | limitがread_failedへ潰れないか          |
| 同上                    | `Event`                                                 | API / observable output  | なし            | eventが何回・いつ出るか                     | 最初のunexpected failureだけ、明示close/cancelでは出さない                | add      | payload非露出とchannel close意味を追加                         | buffer 1でblockしないか                 |
| 同上                    | `Config`                                                | API / unit               | なし            | duration単位/default/zeroは何か             | production既定値、test短縮可、全duration正数、limit非公開                 | add      | 単位とvalidationを追加                                         | magic timeoutが残らないか               |
| 同上                    | `ErrAlreadyConnected` / `ErrNotConnected` / `ErrClosed` | API / state              | なし            | state別に何を判定できるか                   | connecting/open/closedごとのsentinel                                      | add      | 各errorの発生stateを追加                                       | `errors.Is`可能か                       |
| 同上                    | `connect` / `establish` flow                            | lifecycle / boundary     | なし            | Close競合時に途中socketは誰が閉じるか       | new→connecting→open、cancel、connectDone、resolve→dial→limit→init順       | add      | flow分割と近接commentを追加                                    | initがreader前・1件だけか               |
| 同上                    | `send` flow                                             | lifecycle / ownership    | なし            | queue/並行write/timeout時stateはどうなるか  | caller同期、mutex直列化、slice非保持、timeoutはterminal                   | add      | state guardと固定limitを局所化、docは各sendへ追加              | send-after-terminalを拒否するか         |
| 同上                    | `readLoop` / `pingLoop`                                 | lifecycle / event source | なし            | goroutine終了とerror分類は何か              | lifetime cancelで終了、binary-only、typed limit、ping timeout             | add      | owner/終了はpackageとfinalize comment、sourceはEventKindへ追加 | result blockをcancelで解除するか        |
| 同上                    | `terminal`                                              | state transition         | なし            | reader/ping/sendの重複eventをどう防ぐか     | state lock + once、event enqueue後cancel                                  | add      | state machineを構造化、近接flowから読めるため逐語comment省略   | raceでevent channel closeと競合しないか |
| 同上                    | `close` / `closeHandshake`                              | lifecycle / shutdown     | なし            | handshake timeout後helperが残らないか       | intentional state、2秒相当config、CloseNow、helper join、全goroutine join | add      | close順序とhelper joinを近接comment化                          | review申し送りのjoin要件                |
| 同上                    | `finalizeWhenCanceled` / `finalize`                     | lifecycle / ownership    | なし            | channel close ownerと順序は誰か             | baseのみがresult→event→doneをonce close                                   | add      | cancel時state遷移とclose順序を追加                             | parent cancelでeventを出さないか        |
| `client/extractor.go`   | `Extractor`                                             | API / ownership          | なし            | zero value/channel/retry contractは何か     | constructor必須、result 0/event 1、clientがclose owner                    | add      | type docへlifecycleを追加                                      | buffer値が固定か                        |
| 同上                    | `NewExtractor`                                          | API / validation         | なし            | mode/clock/network side effectは何か        | chat=1000、sincro=600、nil clock拒否、I/Oなし                             | add      | validationとquery写像を追加                                    | external値をpathへ混ぜないか            |
| 同上                    | `Extractor.Connect`                                     | API / lifecycle          | なし            | clock/init/read開始順は何か                 | nowを有効Connectで1回、初回binary init後reader/ping                       | add      | state error、副作用、init順を追加                              | 二重Connectでclockを呼ばないか          |
| 同上                    | `Extractor.SendPCM`                                     | API / boundary           | なし            | frame単位とownershipは何か                  | 640 byte、even/nonempty、16k mono s16le、slice非保持                      | add      | reject条件とstate errorを追加                                  | invalid frameをwriteしないか            |
| 同上                    | `Extractor.Results` / `Events` / `Close`                | API / lifecycle          | なし            | channel backpressure/close/join/retryは何か | result 0、event 1、cancel解除、idempotent join、retryなし                 | add      | 3 symbolを個別doc comment化                                    | close-before-connectを収束するか        |
| `client/recognizer.go`  | `Recognizer` / `NewRecognizer`                          | API / constraint         | なし            | endpoint/limit/ownershipは何か              | fixed recognize path、1 MiB、I/Oなし、queue/retryなし                     | add      | typeとconstructorへ追加                                        | configでlimitを無制限化できないか       |
| 同上                    | `Recognizer.Connect`                                    | API / lifecycle          | なし            | state別errorとgoroutine ownerは何か         | newから1回、parent context lifetime、自動reconnectなし                    | add      | side effectとerrorを追加                                       | Close競合でErrClosedか                  |
| 同上                    | `Recognizer.SendExtraction`                             | API / boundary           | なし            | requestを送る前のdomain validationは何か    | session一致、ID非負、int16/16k/2byte/mono、slice非保持                    | add      | reject条件とobservable failureを追加                           | invalid requestをwireへ出さないか       |
| 同上                    | `Recognizer.Results` / `Events` / `Close`               | API / lifecycle          | なし            | stream ownerとshutdown順は何か              | client close owner、unbuffered result、single event、join                 | add      | 3 symbolを個別doc comment化                                    | 二重Close/race testと一致するか         |
| `client/processor.go`   | `Processor` / `NewProcessor`                            | API / mode               | なし            | modeとURLが乖離しないか                     | constructorでchat/sincro固定path、2 MiB、history非所有                    | add      | type/constructorへ境界を追加                                   | modeをsend時に差し替えないか            |
| 同上                    | `Processor.Connect`                                     | API / lifecycle          | なし            | 接続は何回・retryするか                     | newから1回、reader/ping join、自動retryなし                               | add      | Connect docを追加                                              | state errorが共通contractか             |
| 同上                    | `Processor.SendRequest`                                 | API / boundary           | なし            | session/history ownershipとencode失敗は何か | session一致、historyはencode中のみ、nil listはprotocol error              | add      | 入力境界とevent/error観測先を追加                              | requestをqueueへ保持しないか            |
| 同上                    | `Processor.Results` / `Events` / `Close`                | API / data / lifecycle   | なし            | Raw ownershipとchannel shutdownは何か       | Rawはdecoder copy、result 0/event 1、idempotent join                      | add      | 3 symbolを個別doc comment化                                    | Synthesizerへ元bytesを渡せるか          |
| `client/synthesizer.go` | `Synthesizer` / `NewSynthesizer`                        | API / constraint         | なし            | Raw転送以外の責務を持つか                   | fixed synthesize path、32 MiB、container処理/retry非責務                  | add      | type/constructorへ追加                                         | payload limitが固定か                   |
| 同上                    | `Synthesizer.Connect`                                   | API / lifecycle          | なし            | connection lifetime ownerは誰か             | parent contextとClose、newから1回、reader/ping join                       | add      | Connect docを追加                                              | state errorsが一貫するか                |
| 同上                    | `Synthesizer.SendResult`                                | API / data boundary      | なし            | Raw非空でdecode成功を証明できるか           | Rawを再decode、decoded/value/client session照合、再encode禁止             | add      | review申し送りをdocと実装へ追加                                | byte-for-byte同一testがあるか           |
| 同上                    | `Synthesizer.Results` / `Events` / `Close`              | API / lifecycle          | なし            | 音声slice/channel/goroutineのownerは誰か    | decoder/result client所有、event single、Closeでjoin                      | add      | 3 symbolを個別doc comment化                                    | close後にsocketが残らないか             |

### ハマった点・残リスク

- sandbox内のGo実行はHomebrew GOROOTとuser build cache、localhost socketへアクセスできず失敗したため、
  許可済みのescalated `go test` / `go vet`経路で検証した。コード上の失敗ではない。
- `coder/websocket`のread limit errorはclose statusではなくexported `ErrMessageTooBig`をwrapして返すため、
  `errors.Is`で分類する必要があった。
- production Pion sessionへの配線と実Python 4 serviceのend-to-endは意図的に本タスク外であり、後続phaseまで
  localhost stubによるwire/lifecycle検証が残る。現時点の追加リスクや未実行の必須checkはない。

### attempt 1追補（構造監査）

最終差分監査で共通型とconnection flowを同居させた`client.go`が構造規約のfile thresholdを超えることを検出した。
挙動を変えず、公開config/event/state ownerとconstructorを`client.go`（非comment code 107行）へ残し、
connection I/O/state transition/shutdown flowを`connection.go`（同279行）へ分割した。上表の
`client/client.go`に記録した`connect`から`finalize`までのflow行は、最終配置では
`client/connection.go`を指すものとして監査した。責務・reader question・判断・reviewer noteは変わらない。

- `client.go`のpackage/API/owner説明: keep（分割後もpackage入口とstate ownerを局所的に説明する）。
- `connection.go`のconnect/establish/send/read/ping/terminal/close/finalize説明: keep（接続開始からshutdownまでを
  1つのchange comprehension surfaceとして追え、各flowの前後関係とjoin invariantを保持する）。

### Commit

- `eeb4cc1c` `feat(rtc): add typed audio pipeline websocket clients`
- commit後のclean SHAに対して`npm run commit:check`、`npm run gate`、`npm run tasks:check`を再実行しPASS。

## attempt 2

### FAIL残課題への対応

| eval残課題                                      | 対応                                                                                                                                                                                               | 検証                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `CloseNow`が先行`Conn.Close`を中断せず約5秒待つ | WebSocket dial専用transportでunderlying `net.Conn`を捕捉し、`CloseTimeout`時はsocketを直接closeする。library `Close` helperのresultを必ず受けてからlifetime cancelとreader/ping/channel joinへ進む | 30 ms設定で通常約30 ms、race約40 ms。server socket、result/event channel、反復5回のhelper/goroutine収束を期限付き観測 |
| force-close競合error                            | timeout時のlibrary close errorはsocket中断の想定結果として内部でjoinし、transport自身の想定外close errorだけを返す                                                                                 | timeout acceptanceで`Close()` errorなし                                                                               |
| production既定timeoutがcommentだけ              | `DefaultConfig(sessionID, talkMode)`と単一const群を追加し、5s/5s/10s/5s/2sのコード正本とした                                                                                                       | exact value test、constructorのzero/negative rejectは既存test                                                         |
| terminal/error path test不足                    | remote close、decode、text、ping、32 MiB write timeout、concurrent event sources、close timeoutをfocused testへ追加                                                                                | client package通常/race PASS                                                                                          |
| 全service limit境界不足                         | Extractor/Recognizer/Processor/Synthesizerごとにinbound/outboundのexactと+1を検証                                                                                                                  | exactはdecoder/wireへ到達、+1は`EventMessageTooLarge`                                                                 |
| 入力reject/初期化精度不足                       | Extractor exact DTO/clock/1件順、PCM、Recognizer全field/nil voice、Processor session/nil history、Synthesizer Raw provenance/sessionをwire観測付きで検証                                           | invalid input後にserverが追加application messageを受けないことを確認                                                  |
| stale close comment                             | `CloseNow` fallback記述を削除し、captured transport close→helper join→goroutine/channel joinへ更新                                                                                                 | production commentと設計契約を実装に照合                                                                              |
| struct context保存の理由不足                    | `lifetimeCtx`直前へ規約形式の`// reason:`と解消条件を追加                                                                                                                                          | parent contextをreader/ping/finalizerへ同一connection lifetimeとして共有する例外を明記                                |

### 設計判断

- `coder/websocket.Conn.Close`と`CloseNow`の同時実行には依存しない。HTTP upgrade時のTCP connectionを
  dial layerで捕捉し、configured timeout時だけownerが直接closeする。TLSの場合もwrapperの下層socketを閉じるため
  handshake waitを中断できる。
- 正常peerでは従来どおり`Conn.Close`のclose handshakeを完了する。timeout時だけtransportを強制closeし、
  helperをjoinしてからconnection lifetimeをcancelするため、close helperとfinalizerの`CloseNow`を競合させない。
- connection flowが構造閾値を超えないよう、resolve/dial/read/write/pingを`connection.go`、
  terminal state/explicit shutdown/finalizeを`shutdown.go`へ分割した。
- acceptance artifactは変更せず、同じ30 ms scenarioにserver socket/channel観測を加えた
  `close_timeout_test.go`としてproduction testへ取り込んだ。
- 仕様からの逸脱はない。production Pion配線と実Python service E2Eは引き続き後続Phaseの責務である。

### Verification

- focused `go test -count=1 ./internal/pipeline/client`: PASS
- focused `go test -race -count=1 ./internal/pipeline/client`: PASS
- module root `gofmt -l .`: output empty
- module root `go vet ./...`: PASS
- module root `go test -count=1 ./...`: PASS
- module root `go test -race -count=1 ./...`: PASS
- module root `go mod tidy -diff`: PASS
- repository root `npm run gate`: PASS（lint / build / 534 passed、2 skipped）
- repository root `npm run tasks:check`: PASS（263 task directories）

### Documentation sync

- `documents/design/contracts/audio-pipeline-websocket.md`のclose timeoutをunderlying socket強制closeとして具体化し、
  production timeoutのコード正本が`DefaultConfig`であることを同期した。
- public API追加はGo internal packageの`DefaultConfig`だけで、OpenAPI、compose/env、生成型、公開barrelへの影響はない。
  そのため再生成は不要。

### Comment audit

| path                   | symbol / block / decision / flow    | kind                        | current comment                  | reader question                                      | required reader knowledge                                                                          | decision | action / omission reason                         | reviewer note                                 |
| ---------------------- | ----------------------------------- | --------------------------- | -------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------ | --------------------------------------------- |
| `client/client.go`     | production timeout const群          | constraint / unit           | attempt 1ではcomment内の値だけ   | production値の実行時正本はどこか                     | `DefaultConfig`だけが5s/5s/10s/5s/2sを組み立て、overrideは正数に限る                               | add      | const群の近接commentを追加                       | comment/documentだけのdefaultへ戻っていないか |
| 同上                   | `DefaultConfig`                     | API / validation            | 新規                             | 入力、出力、validation分担、副作用は何か             | session/modeを保持したproduction durationを返し、domain validationは各constructor、I/Oなし         | add      | exported doc commentを追加                       | 全duration exact testと一致するか             |
| 同上                   | `baseClient.rawConn`                | boundary / ownership        | 新規                             | WebSocket以外のsocket参照をなぜ持つか                | close timeout時だけlibrary固定waitを中断し、通常closeは`Conn` ownerが行う                          | add      | fieldへtimeout発動条件とownerを追加              | normal/force closeの二重owner条件             |
| 同上                   | `baseClient.lifetimeCtx`            | lifecycle / rule exception  | なし                             | context struct保存がなぜ必要でいつ終わるか           | parent cancellationをreader/ping/finalizerへ共有し、Close/terminal/parent cancelで終了する         | add      | `// reason:`と解消条件を規約形式で追加           | context leakや無期限background化がないか      |
| `client/connection.go` | `establish` / `dialWebSocket`       | boundary / flow             | resolve→dial→limit→init説明あり  | underlying socketをどこで安全に捕捉するか            | cloned default transport、redirect拒否、mutex保護capture、dial失敗時非保持                         | add      | helper分割とtransport capture目的を近接comment化 | URL固定、TLS/proxyでもsocket close可能か      |
| `client/shutdown.go`   | file responsibility split           | navigation / lifecycle      | attempt 1では`connection.go`内   | terminalとexplicit closeの接続関係は何か             | terminalはevent→cancel、explicit closeはhandshake→timeout force→helper join→cancel                 | add      | 責務名fileへ分割し各flow commentで前後関係を記載 | structure threshold内か                       |
| 同上                   | `terminal`                          | state transition / event    | state lock + onceのauditのみ     | concurrent sourceでevent closeが通知を追い越さないか | buffer enqueue後cancel、最初のsourceだけ、finalizeは後段                                           | add      | 近接flow commentを追加                           | concurrent source testと一致するか            |
| 同上                   | `close`                             | lifecycle / shutdown        | `CloseNow`へ切替と記載しstale    | configured timeoutは実際に何を中断するか             | captured socketを直接closeし、library helper結果を受けてから全join                                 | rewrite  | 不成立の`CloseNow`保証を削除し実装順序へ更新     | 30 ms acceptanceと一致するか                  |
| 同上                   | `closeHandshake`                    | boundary / helper ownership | helper joinのみ記載              | helper、socket、errorのownerは誰か                   | timer branchはraw close、result receiveでjoin、競合error非公開、unexpected transport errorのみ返す | rewrite  | timeout/force/error contractを追加               | helper goroutineがreturn後に残らないか        |
| 同上                   | `finalizeWhenCanceled` / `finalize` | lifecycle / ownership       | result→event順とcancel解除を説明 | force close後に何がjoin/closeされるか                | `CloseNow`はhelper完了後、WaitGroup後にresult→event→doneをonce close                               | keep     | 既存commentが新順序でも正確なため維持            | staleな同時Close前提がないか                  |

### 残リスク

- transport captureは標準`*http.Transport`をcloneして各WebSocket dial専用に使う。将来global
  `http.DefaultTransport`を別型へ置換する場合はconstructor errorになるため、独自transport注入が必要になった時点で
  dial dependencyを明示API化する。
- production Pion session配線と実Python service E2Eはタスク境界どおり未実行。追加の既知leak、
  未実行の必須check、仕様逸脱はない。

### attempt 2 commit

- `ab687caf` `fix(rtc): bound pipeline client shutdown timeout`
- clean commit SHAで`npm run commit:check`、`npm run gate`、`npm run tasks:check`を再実行しPASS。

## attempt 3

### FAIL残課題への対応

- production timeoutの説明が無関係な`Service`定数群へ付いていたため削除し、実際のtimeout定数群の直前へ移動した。
- 実行時の値、公開契約、制御フローは変更していない。attempt 2のcomment auditで記録した配置と実装を一致させた。

### Verification

- focused `go test -count=1 ./internal/pipeline/client`: PASS
- module root `gofmt -l .`: output empty
- module root `go vet ./...`: PASS
- module root `go test -count=1 ./...`: PASS
- module root `go test -race -count=1 ./...`: PASS
- module root `go mod tidy -diff`: PASS
- repository root `npm run gate`: PASS（lint / build / 534 passed、2 skipped）
- repository root `npm run tasks:check`: PASS（263 task directories）

### Documentation sync

- comment配置だけの修正で、公開API、通信契約、公開挙動、設計内容は変わらない。attempt 2で同期済みの
  `documents/design/contracts/audio-pipeline-websocket.md`も現状の実装と一致するため、追加の文書変更や再生成は不要。

### Comment audit

| path               | symbol / block / decision / flow | kind              | current comment                       | reader question                                | required reader knowledge                                                                 | decision | action / omission reason                           | reviewer note                                |
| ------------------ | -------------------------------- | ----------------- | ------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- | -------------------------------------------------- | -------------------------------------------- |
| `client/client.go` | `Service`定数群                  | API / navigation  | 無関係なtimeout説明が直前に存在       | 各定数がどのpipeline serviceを表すか           | service mappingとproduction timeoutの正本は別の関心事                                     | delete   | timeout説明を削除し、Service doc commentだけを維持 | Service宣言へ無関係なdefault説明が付かないか |
| 同上               | production timeout const群       | constraint / unit | attempt 2で追加した説明の配置が不正確 | production値の実行時正本とoverride条件はどこか | `DefaultConfig`だけが5s/5s/10s/5s/2sを組み立て、constructorは正数overrideだけを受け付ける | rewrite  | 説明を実際のtimeout定数群の直前へ移動              | 値と説明が近接し、audit記録と一致しているか  |

### 残リスク

- コメントのみの変更であり、新たな実行時リスク、仕様逸脱、未実行の必須checkはない。

### attempt 3 commit

- `1c137980` `fix(rtc): align timeout comment with constants`
