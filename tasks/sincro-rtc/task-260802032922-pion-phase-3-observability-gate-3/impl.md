# Implementation Log: task-260802032922-pion-phase-3-observability-gate-3

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断・申し送り対応

- Prometheusは`internal/observability`のprivate registryだけへ登録し、default global registryを使用しない。
  Recorderのlabel入力は各method内の有限集合へ正規化し、未知値はpayloadを保持せず既定enumへ落とす設計にした。
- readinessはlistenerへ渡す直前にstartup検証済みとして公開し、下流Python serviceの一時障害を含めない。
  shutdownでは`BeginDrain`をHTTP shutdown/process cancelより先に実行し、dispatch済みinitial Offerも503にする。
- recoverはSession所有goroutine/Pion callbackとHTTP request goroutineを対象とした。runtime fatal error、
  cgo crash、第三者library内部の未wrap goroutineは回復不能であり非対象である。
- freshness申し送りどおり、既存の`run`→`serve`分割、OfferRegistry join、`Session.startRTCPDrain`を維持して
  process stateと順序だけを接続した。既存startup validation（Frontend dir、FFmpeg、timeout/cache/session上限）
  はlistener前に完了する現行境界を再利用した。
- review Low指摘に対し、panic値・raw error・SDP/candidate/chat/audio本文をstructured logへ出さず、
  `reason`/`stage`の正規化済み分類へ置換した。payload markerをmetrics/logへ投入するprivacy testで漏えいがないことを確認した。
- 仕様逸脱なし。外部Prometheus/Grafana、alert、runtime fatal/cgo recoveryは明示されたスコープ外のまま。

### Comment audit

| path                                                      | symbol/block/decision/flow                                       | kind                                 | current comment                       | reader question                                                    | required reader knowledge                                              | decision (keep/rewrite/delete/add) | action/omission reason                                                                    | reviewer note                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `internal/observability/registry.go`                      | package / `Recorder` / `Registry`                                | public boundary / metric schema      | 新規                                  | metricの意味、owner、cardinalityは何か                             | private registry、型付きevent、payload由来label禁止                    | add                                | package commentとdoc commentでglobal registry非使用、有限label、単位とevent境界を説明     | arbitrary metric APIを公開しない                        |
| `internal/observability/registry.go`                      | `NewRegistry`とcollector構築                                     | orchestration / data transformation  | 新規                                  | 確定schemaのname/type/bucketはどこで固定されるか                   | constructorで全collectorを一括登録し、後段はeventだけ記録する          | add                                | constructor docと局所helper名でschema ownerを明示。各宣言の逐語説明は省略                 | task固定schemaと照合済み                                |
| `internal/observability/registry.go`                      | event methods / `normalize` / enum sets                          | heuristic / privacy boundary         | 新規                                  | 未知labelやpayload値が来た場合にcardinalityは増えるか              | 各dimensionは有限集合、不明値は安全な既定enumへ写像                    | add                                | `Recorder` docと`normalize`名、privacy testで契約を局所化。各1行methodの逐語commentは省略 | session ID/SDP/candidate/chat/audio labelなし           |
| `internal/observability/registry.go`                      | `ObserveInputEvent`                                              | data transformation                  | 新規                                  | media eventをRTP/audio metricへどう写像するか                      | reorder flushとDTX/unavailableの分類                                   | add                                | mapping責務とpayload非受領をdoc comment化                                                 | input payloadを受け取らない                             |
| `internal/signaling/http.go`                              | `ProcessState`とstate methods                                    | public lifecycle / state transition  | 新規                                  | ready/drainingの意味とshutdown時の単調性は何か                     | startup完了後だけready、drain開始後はreadyへ戻らない                   | add                                | type/method docでhealth semanticsとadmission前後関係を説明                                | atomicでhandlerとsignal goroutineを同期                 |
| `internal/signaling/http.go`                              | `Options` / `New` / `Handler`                                    | public boundary / orchestration      | 既存`New`/`Handler` commentあり       | operational dependencyをどこで注入し、route precedenceをどう守るか | optional seamは既存transport test互換、productionは明示注入            | rewrite                            | `Options` docを追加し、既存constructor/route commentを保持                                | static fallbackよりoperational/API routeを優先          |
| `internal/signaling/http.go`                              | statuses/live/ready handlers                                     | HTTP contract                        | 新規                                  | method/status/bodyと下流障害の扱いは何か                           | statuses JSON、live=event loop、ready=startup済みかつ非drain           | add                                | `ProcessState` docとhandler名で契約を説明。単純method guardの逐語commentは省略            | docsとhandler testで公開挙動を同期                      |
| `internal/signaling/http.go`                              | `observeHTTP` / `signalingEndpoint`                              | middleware / metric mapping          | 新規                                  | latency/countのendpointとstatus classをどう確定するか              | 4 signaling endpointだけを有限labelへ写像                              | add                                | Recorder境界のcommentと明示switchでcardinalityを可視化                                    | health/metrics/staticはsignaling metric対象外           |
| `internal/signaling/http.go`                              | `recoverHTTP` / `withSessionMutation`                            | panic boundary / failure flow        | 新規                                  | panic時に500と既知session closeがどう収束するか                    | outer recoverは500、lookup後mutationはsession close後repanic           | add                                | panic限界と二段境界をdoc comment化                                                        | initial CreateはManager/registry ownerのcleanupに委ねる |
| `internal/signaling/http.go`                              | initial Offer draining branch                                    | admission decision                   | 新規                                  | updateを維持しつつinitialだけをいつ503にするか                     | session_id判定後、resource/cache操作前にdrainを確認                    | add                                | `BeginDrain` docと近接branchで前後関係が明確なため追加逐語commentは省略                   | dispatch済みrequestも拒否                               |
| `internal/signaling/http_update.go` / `http_candidate.go` | mutation call boundary                                           | failure flow / privacy               | 既存handler flow commentあり          | session特定後panicと通常errorをどう分けるか                        | `withSessionMutation`がpanicだけをclose、typed errorは従来statusへ写像 | keep                               | 既存handler docを保持しraw error logをreasonへrewrite                                     | payload markerをlogへ出さない                           |
| `internal/rtc/safe.go`                                    | `Session.Go` / `goReserved` / `SafeCallback`                     | public lifecycle / panic boundary    | 新規                                  | WaitGroup ownershipとpanic close-onceはどう成立するか              | lifecycle lock下予約はAdd/Wait競合を避け、panic値はlogしない           | add                                | 各boundaryの入力、side effect、非対象をdoc comment化                                      | runtime fatal/cgo/third-party goroutineは非対象         |
| `internal/rtc/readiness.go`                               | Pion callback inventory / `launchPipeline`                       | event source / orchestration         | 既存flow commentあり                  | 全callback/pipeline startが共通recoverを通るか                     | connection/ICE/track/DataChannel/openとpipeline Startをwrapperへ接続   | rewrite                            | 既存readiness全体コメントを保持し、raw error fieldをreasonへ変更                          | callback inventoryをtaskと照合                          |
| `internal/rtc/outbound.go`                                | outbound/pipeline consumer goroutines                            | orchestration / pipeline             | 既存flow commentあり                  | clock/generation/text/synth panicがsessionへ収束するか             | transport eventで予約済み5 worker、各stage名でrecover                  | keep                               | `startOutbound`のpipeline位置説明を保持しwrapperへ配線                                    | raw errorは正規化reasonへ変更                           |
| `internal/rtc/media.go`                                   | `startRTCPDrain`                                                 | protocol classification / goroutine  | 既存drain commentあり                 | RTCP種別とread終了をどう扱うか                                     | SR/RR/NACK/other分類、未知packetはcloseしない、予期せぬread終了はclose | rewrite                            | commentをpacket分類を含む責務へ同期し、loopは共通wrapperへ接続                            | unknown feedbackは`other` metricのみ                    |
| `internal/rtc/media.go`                                   | `startInbound`                                                   | goroutine / failure flow             | 既存flow commentあり                  | panic/EOF/read errorのsession結果は何か                            | cancel/EOF正常、その他はmedia_read_error                               | keep                               | 既存commentが入力・出力・失敗・pipeline位置を覆うため保持                                 | raw error本文をlogしない                                |
| `internal/rtc/recovery.go` / `lifecycle.go`               | ICE state/deadline metrics                                       | state transition / event source      | 既存recovery commentあり              | transitionのfrom/toと期限切れstageをどこで記録するか               | lifecycle mutexでprevious stateを保持、restart期限を有限stageへ記録    | keep                               | 既存state machine commentを保持しmetric side effectを実装へ追加                           | Pion enumだけをlabelに使用                              |
| `internal/rtc/negotiation.go` / `readiness.go`            | pre-connect/media-readiness deadline callbacks                   | lifecycle decision                   | 既存deadline commentあり              | deadline metricとclose-onceの順序は何か                            | callbackでstage記録後、state再確認してclose                            | keep                               | 既存timer競合説明が十分で、metric callは命名で明白                                        | stopped timerのlate callbackはstate guardで無害         |
| `internal/rtc/manager.go`                                 | `ManagerConfig.Recorder` / `Limit` / `Recorder` / `CloseSession` | public dependency / process boundary | 新規と既存Manager comment             | recorder owner、status limit、HTTP panic closeはどう接続されるか   | process-wide recorder、read-only limit、known session close            | add                                | exported APIへdoc comment追加、Manager owner commentを保持                                | nil recorderはNopへ正規化                               |
| `internal/rtc/manager.go` / `session.go`                  | session created/closed/close duration flow                       | lifecycle / metric ownership         | 既存Create/cleanup commentあり        | gaugeをいつ増減し、failed reasonをどう有限化するか                 | registry公開後created、全resource join後closed、reason enum正規化      | rewrite                            | cleanup commentを保持し`normalizeCloseReason`でmappingを局所化                            | close-onceにつき各metric 1回                            |
| `internal/rtc/session.go`                                 | privacy log rewrite / `metrics` helper                           | privacy / helper                     | raw error fieldを含む既存logあり      | cleanup/panic診断にpayload由来errorを残さず何を記録するか          | session ID、reason/stage/countだけを記録                               | rewrite                            | raw error/talk mode/transition詳細を正規化fieldへ置換                                     | review Lowへ直接対応                                    |
| `cmd/pion-poc/main.go`                                    | `runWithBoundaries`→`serve` process state/registry wiring        | process orchestration / drain order  | 既存startup/shutdown flow commentあり | listener前検証と5秒drain順序は何か                                 | registry/state生成、startup完了、drain、accept停止、owner/session join | rewrite                            | 既存serve commentとshutdown直前commentを同期                                              | downstream一時障害はreadyを落とさない                   |
| `documents/design/contracts/frontend-rtc.md`              | statuses/cleanup contract                                        | documentation                        | aiortc/Pion差分が未記載               | Pion statuses schemaとcleanup非実装は何か                          | Pionはclose時自動除去、state-changing GETを追加しない                  | rewrite                            | endpoint表と直後の説明を同期                                                              | current Python設計は置換していない                      |
| `documents/migration/pion/rollout-and-operations.md`      | health/metrics/drain operations                                  | documentation                        | metric名/health/drain順序が不足       | Gate 3運用者は何をscrapeし、shutdownをどう判定するか               | health semantics、prefix/unit/privacy、5秒join順序                     | add                                | 専用節とShutdown手順を同期                                                                | codeと同一commit                                        |

### 検証

- targeted:
    - `go test ./internal/observability ./internal/signaling -run 'TestRegistry|TestOperational|TestMutation|TestOffer|TestCandidate'` PASS
    - 非network RTC lifecycle/recovery subset PASS
- full:
    - `/tmp/go1.26.5-toolchain/bin/go test ./internal/... ./cmd/pion-poc` PASS
    - `/tmp/go1.26.5-toolchain/bin/go test -race ./internal/... ./cmd/pion-poc` PASS
    - `/tmp/go1.26.5-toolchain/bin/go vet ./...` PASS
    - `/tmp/go1.26.5-toolchain/bin/go mod tidy -diff` PASS（差分なし）
    - `npm run tasks:check` PASS
    - `npm run gate` PASS（commit `d7f5b37ab83aa2b38837562539b892ba778cdbf9`、lint/build/test）
    - `npm run commit:check` PASS
- sandbox内の標準`go`は`/usr/lib/go-1.26`の標準libraryと既定cacheが利用不能だったため、
  既存検証用`/tmp/go1.26.5-toolchain`と`/tmp`配下の隔離GOCACHE/GOMODCACHEを使用した。
  Pion socket/netlinkを使うfull/race testは権限付き境界で実行した。

### ドキュメント同期

- `documents/design/contracts/frontend-rtc.md`へPion版statuses schemaとcleanup非実装差分を同期した。
- `documents/migration/pion/rollout-and-operations.md`へhealth semantics、metric prefix/unit/privacy、
  readiness→draining→HTTP accept停止→Offer/session joinの順序を同期した。
- Gate 3前のため`documents/design/backend/services/sincro-rtc.md`はPythonからPionへ置換していない。
- 公開生成物・barrelは変更しておらず、再生成対象なし。

### コミット

- `d7f5b37ab83aa2b38837562539b892ba778cdbf9` `feat(rtc): add Gate 3 process observability`

## attempt 2

### 判断・評価申し送り対応

- 評価で未接続と判定されたmetricを宣言だけでなくproduction eventへ接続した。session/queue gaugeは
  admission/enqueueでownershipを取得し、terminal close/dequeue/purge/closeで解放する。未知の
  outcome/labelはRecorder内部で有限enumへ正規化し、全20 familyをpayload markerと0復帰を含むtestで確認した。
- RTCP Receiver Reportはfraction lostを`FractionLost / 256`へ変換し、compact NTPの32-bit wrapを保つ
  RFC 3550演算でRTT secondsを求める。LSRがないreportはlossだけを観測し、未知feedbackは`other`として
  sessionを継続する。
- sessionが直接・間接に所有するfirst-party goroutine/callbackを再inventoryした。Session、pipeline
  coordinator/client、DataChannel worker/callback、deadline、resource closer、Offer ownerをrecover境界へ
  接続し、panic値を記録せずclose-onceまたはowner errorへ収束させた。runtime fatal、cgo crash、
  third-party library内部goroutineは仕様どおり非対象である。
- known-session mutationはdecode/validation後の全適用区間を`withSessionMutation`で囲み、HTTP responseは
  middleware内でcommit前bufferingする。部分的なsuccess bodyを書いた後のpanicも破棄して500を返し、
  candidate/update対象sessionを`panic`でcloseする。initial Create panicはManagerがreservationと部分resourceを回収する。
- review Lowおよび評価指摘に従い、change comprehension surfaceのraw error/payload logを
  `stage`/`reason`/`count`の有限分類へ置換した。SDP/candidate/chat/audio markerを実際のreject/panic経路へ
  通し、captured logとmetricsに現れないことを確認した。
- 仕様逸脱なし。0/1/100 session drainはattempt 1の既存process/lifecycle検証を維持し、attempt 2では
  FAILの直接原因だったmetric、panic、privacy、RTCP、comment/doc同期を追加検証した。

### Comment audit

attempt 1のauditは評価で未接続surfaceと実装不一致が判明したため、下表をattempt 2時点の正本とする。

| path                                                                  | symbol/block/decision/flow                                    | kind                                        | current comment                           | reader question                                             | required reader knowledge                                             | decision (keep/rewrite/delete/add) | action/omission reason                                                                                                         | reviewer note                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------ |
| `internal/observability/registry.go`                                  | `Recorder`全method / `Discard`                                | public metric boundary                      | method単位の意味が不足                    | 各eventのownership、有限入力、単位、副作用は何か            | arbitrary metric APIを公開せずpayloadを受けない                       | rewrite                            | 全exported methodへevent固有のGo docを追加し、no-opの用途とproduction非対象を説明                                              | attempt 1の一括省略判断を撤回              |
| `internal/observability/registry.go`                                  | `NewRegistry` / collector schema                              | public constructor / schema owner           | global registry非使用のみ                 | 20 familyのtype/bucketを誰が固定するか                      | isolated registryへ一括登録し、後からfamilyを追加しない               | rewrite                            | observable outputと非対象をconstructor docへ明記、宣言はtask schemaと照合                                                      | 20 family以外を登録しない                  |
| `internal/observability/registry.go`                                  | event methods / enum sets / `normalize`                       | privacy / cardinality / data transformation | outcome正規化が不足                       | 未知値でcardinalityやpayload漏えいが起きないか              | dimensionごとの有限enum、安全なfallback、gauge増減                    | rewrite                            | 各Registry method docと有限集合を同期し、`outcome`も`closed                                                                    | failed`へ正規化                            | marker testで全dimensionを確認 |
| `internal/observability/registry.go`                                  | `ObserveInputEvent`                                           | event mapping                               | 既存説明あり                              | input eventをaudio/RTPへどう分けるか                        | accepted/dropとduplicate/late/missing/reorder flush                   | keep                               | payload非受領とmapping責務を既存docが覆う                                                                                      | input.goのdecode/acceptedを追加接続        |
| `internal/media/input_metrics.go` / `input.go`                        | `inputTelemetry` / decode-submit flow                         | private boundary / pipeline                 | 新規、局所commentなし                     | decoder failureとaccepted ownershipをどこで観測するか       | observerがRecorderを任意実装し、PCM本文を渡さない                     | add                                | interface名と2 helperへ責務を分離。単純type assertionの逐語commentは、入力・出力・失敗・副作用が命名と型で局所完結するため省略 | `decode_in`と`in/accepted`を接続           |
| `internal/media/output_contract.go`                                   | `OutputObserver`全method                                      | public event boundary                       | 新規                                      | pacing/queue/audio/codecの意味と単位は何か                  | output processorはpayload-free eventだけを同期通知                    | add                                | interfaceと全exported methodへGo docを追加                                                                                     | nilはdiscard実装へ正規化                   |
| `internal/media/output.go`                                            | constructor observer injection                                | public constructor / dependency             | 既存constructor comment                   | optional observerの既存caller互換と副作用は何か             | variadic先頭だけを使用、productionはRecorderを注入                    | rewrite                            | constructor signatureとOutputObserver docで境界を示し、既存clock契約を保持                                                     | arbitrary observer追加はしない             |
| `internal/media/output.go`                                            | enqueue/purge/close/dequeue                                   | queue ownership / state transition          | queue flow commentあり                    | speech gaugeがいつ増減し0へ戻るか                           | accepted enqueue +1、completion/abort/purge/close -1、overflow reject | rewrite                            | ownership callを各state changeへ近接配置し、既存queue commentを保持                                                            | observer callはpayloadを受けない           |
| `internal/media/output.go`                                            | pacing/write/abort flow                                       | heuristic / media pipeline                  | lag/drop理由commentあり                   | lag、generation、codec、sent/dropをどう分類するか           | positive lag seconds、abort reason、encode/write成功点                | rewrite                            | lag heuristic commentを保持しmetric side effectを同期、raw `lag_ms` logを削除                                                  | write成功後だけ`sent`                      |
| `internal/pipeline/coordinator.go`                                    | `Observer` / `ConfigureRuntime`                               | public runtime boundary                     | 新規                                      | Session recorder/panic ownerをいつ固定するか                | Start前だけ設定し全generationでimmutable                              | add                                | interface全methodとConfigureRuntimeへ入力、失敗、side effectのGo docを追加                                                     | Start後reconfigureを拒否                   |
| `internal/pipeline/coordinator.go`                                    | `goCoordinator` / `goWork` / `goDetached` / `safeCallback`    | orchestration / panic boundary              | 新規private helper                        | WaitGroup ownershipとpanic転送はどう成立するか              | counted owner別にDoneし、detached closeはjoin対象を待つ側             | add                                | helper名と近接するcloseOnContext commentで全体像を説明。各deferの逐語commentは同一抽象を反復するため省略                       | stageだけをownerへ渡す                     |
| `internal/pipeline/coordinator.go` / `queue.go` / `runtime.go`        | input queue enqueue/dequeue/close                             | queue ownership / data flow                 | queue契約commentあり                      | reset/closeを跨いでgaugeが残らないか                        | drop-oldestはdepth不変、normal enqueue +1、pop/close -N               | rewrite                            | 既存SubmitPCM/Close commentを保持しownership転送を全exitへ追加                                                                 | queue closeがremaining countを返す         |
| `internal/pipeline/reset.go`                                          | `requestReset` reconnect lifecycle                            | state transition / telemetry                | raw error logと直接goroutineあり          | start/success/failureと旧generation回収の順序は何か         | reset owner予約、old queue解放、client join、再接続                   | rewrite                            | 共通workerへ移し、3結果metricと有限logへ変更                                                                                   | shutdown中ErrClosedもfailureで完結         |
| `internal/pipeline/connect.go`                                        | generation workers / client callback / retry waiter           | goroutine and callback sources              | direct launchあり                         | 全stage panicがSessionへ届くか                              | five generation workers、activated client event、retry helper         | rewrite                            | `goWork`/`safeCallback`へ統一。retry helperは自身のerror channelへpanicを変換                                                  | random jitter自体は同期処理                |
| `internal/pipeline/client/client.go` / `connection.go`                | `EventPanic` / read-ping-finalize workers                     | client lifecycle / panic boundary           | worker ownership commentあり              | client内部panicをgeneration resetへどう渡すか               | read/pingはWaitGroup所有、finalizeはdoneを待つowner                   | rewrite                            | `goWorker`でpanicをterminal EventPanicへ正規化、raw fallback fieldを有限化                                                     | recovered値は破棄                          |
| `internal/pipeline/client/set.go`                                     | event watcher                                                 | callback bridge / goroutine                 | building/published flow commentあり       | watcher panicをどのhandlerへ伝えるか                        | publish前後とclosed guardをlockで判定                                 | rewrite                            | watcher deferでEventPanicをactive handlerへ転送、既存state commentを保持                                                       | payload/errorをEventへ含めない             |
| `internal/pipeline/client/shutdown.go`                                | WebSocket close helper                                        | resource closer goroutine                   | timeout/join commentあり                  | helper panicでCloseが永久待機しないか                       | buffered result、force close、必ずreceiveしてjoin                     | rewrite                            | panicを固定errorへ変換するdeferを追加し既存ownership commentを維持                                                             | runtime fatalは非対象                      |
| `internal/rtc/data_channel.go`                                        | `DataChannelDispatcherOptions`                                | public dependency boundary                  | 新規                                      | metricとSession panic ownerをどう注入するか                 | payload-free recorder、close後も安全なcallback                        | add                                | typeと各fieldへGo docを追加                                                                                                    | nilはdiscard/no-op                         |
| `internal/rtc/data_channel.go`                                        | attach callbacks / worker / backpressure                      | callback and goroutine inventory            | direct callbacks/worker                   | OnClose/low-water/send panicをどう収束するか                | safe callback、worker recover、sendMuはpanicでも解放                  | rewrite                            | callback wrapperとworker boundaryへ接続し、send critical sectionをdefer unlock化                                               | panic testがlock残留も検出                 |
| `internal/rtc/data_channel.go` / `data_channel_payload.go`            | text/telop enqueue/pop/purge/close/send                       | queue ownership / failure policy            | 既存policy commentあり                    | reliable/unreliableのoverflow/sendとgaugeはどう違うか       | text reject-close、telop drop-oldest、pop/purge/close解放             | rewrite                            | existing dispatcher docを保持しmetric callsをstate changeへ近接、raw queue/action logを有限化                                  | send errorはchannel enumのみ               |
| `internal/rtc/safe.go`                                                | `Go` / `goReserved` / `SafeCallback` / `startCleanup`         | Session panic and lifecycle boundary        | cleanup wrapper不足                       | Add/Wait競合を避けつつpanicをclose-onceへ収束できるか       | lifecycle lock下予約、cleanupは待つ側なのでdetached                   | rewrite                            | 各boundaryにGo doc、cleanup panicはprocess crashを防ぎstageだけをlog                                                           | third-party goroutine非対象を明記          |
| `internal/rtc/session.go`                                             | coordinator/DC/output runtime wiring                          | orchestration / ownership                   | dependency flow commentあり               | downstreamのpanic/metrics ownerは同じSessionか              | recorderとpanic close callbackを構築時に固定                          | rewrite                            | newSessionで全componentへ同一Recorder/Session closeを注入                                                                      | ConfigureRuntime失敗は作成resourceを回収   |
| `internal/rtc/session.go`                                             | cleanup/resource closer/close duration                        | lifecycle / resource join                   | direct closer goroutine、duration分類不足 | close deadlineと正常joinをexactly onceでどう観測するか      | close start時刻、closer panic containment、Manager timeout競合        | rewrite                            | closerをrecoverし、`closeMetricOnce`でsuccess/timeoutを一度だけobserve                                                         | SessionClosedは全join後                    |
| `internal/rtc/manager.go`                                             | `Create` panic cleanup / `ErrSessionPanic`                    | public admission / failure flow             | initial panic cleanup不足                 | reservation/Coordinator/Sessionの部分所有を誰が回収するか   | ownership段階をnamed localで追跡、deferで最深ownerをclose             | rewrite/add                        | Create doc flowを維持しexported errorへcleanup済み契約を記載                                                                   | signalingは500へ写像                       |
| `internal/rtc/manager.go`                                             | `CloseAll` deadline / `Limit` / `Recorder`                    | process lifecycle / public accessors        | accessor commentが名前の言い換え          | close deadlineを未完了sessionへどう帰属させるか             | process recorder、immutable ceiling、各Session duration once          | rewrite                            | accessorsへobservable output/非対象を追記、timeout時にdeadlineとpending durationを記録                                         | sessionごとのlate successはonceで抑止      |
| `internal/rtc/media.go`                                               | RTCP read/classify/quality                                    | protocol transformation / event source      | packet分類のみ                            | RR loss/RTTと未知packet/read終了をどう扱うか                | FractionLost、compact NTP wrap、LSR absence、other class              | rewrite                            | record helper docとwrap理由の局所commentを追加                                                                                 | malformed/unknownはsessionを閉じない       |
| `internal/rtc/negotiation.go` / `readiness.go` / `recovery.go`        | pre-connect/media/disconnect/restart timers                   | timer callback / state transition           | callback recover不足                      | late/panic callbackがlifecycleを壊さないか                  | state guard、SafeCallback、deadline stage記録後close                  | rewrite                            | 全timerをSafeCallbackへ接続しcleanup launchを共通化                                                                            | restartは同じ有限stage                     |
| `internal/signaling/offer_registry.go`                                | `OfferRegistryConfig.Recorder` / owner `create`               | process owner / deadline / panic boundary   | gather metric/panic cleanup不足           | timeoutとowner panicでentry/waiter/reservationは収束するか  | process context、entry identity guard、done close、Manager cleanup    | rewrite/add                        | Recorder field doc、gather deadline、owner recoverでentry削除とwaiter解放                                                      | panic payloadをerror/logへ出さない         |
| `internal/signaling/http.go`                                          | `responseBuffer` / `recoverHTTP`                              | HTTP commit / panic boundary                | response直接commit                        | partial response後も確実に500にできるか                     | middlewareはHeader/status/bodyをbufferしsuccess時だけflush            | rewrite                            | buffering helperへ責務分離しrecover docと実装を同期                                                                            | streaming endpointは対象に存在しない       |
| `internal/signaling/http.go` / `http_update.go` / `http_candidate.go` | `withSessionMutation` full mutation interval                  | request failure flow                        | service callだけを部分wrap                | mutation後panicで既知sessionをcloseできるか                 | validation後からresponse構築完了までsession identity既知              | rewrite                            | update/candidateの全apply区間をwrapし、test hookをresponse後へ置く                                                             | typed通常errorは従来statusを維持           |
| `cmd/pion-poc/main.go`                                                | OfferRegistry recorder injection                              | process composition                         | registry生成済み                          | gather deadlineをprocess registryへどう接続するか           | Manager/HTTP/Offer ownerが同じRecorderを共有                          | rewrite                            | startup wiringへRecorderを追加、既存drain順序commentを保持                                                                     | global registry不使用                      |
| `documents/migration/pion/rollout-and-operations.md`                  | exact metric operations table                                 | public operations documentation             | prefix/categoryのみ                       | 運用者がname/type/unit/label/bucket/ownershipを検証できるか | task固定20 familyとproduction event                                   | rewrite                            | exact 20 family表と増減/0復帰規則を同一commitで同期                                                                            | frontend contract文書はattempt 1で同期済み |
| production test files / docs以外                                      | `observability_test.go`群、registry/signaling/lifecycle tests | test-only                                   | 対象外                                    | production reader向けcomment audit対象か                    | acceptance対応のfocused testでproduction APIではない                  | keep                               | test/fixtureだけのsymbolはsource comment規約のproduction audit対象外。テスト名とhelper名でscenarioを表現                       | acceptance directoryは変更していない       |

### 検証

- targeted:
    - `go test ./internal/observability ./internal/media` PASS
    - `go test ./internal/rtc -run 'Test(RTCPClassification|DataChannelWorkerMetrics|SessionRecover|ManagerCreatePanic)'` PASS
    - `go test ./internal/pipeline -run TestCoordinatorWorkerPanic` PASS
    - `go test ./internal/signaling -run 'Test(Operational|Mutation|RecoverHTTP)'` PASS
- full（commit `a93b85e9070283461d43b57459f92961cdf03595`）:
    - `/tmp/go1.26.5-toolchain/bin/go test ./internal/... ./cmd/pion-poc` PASS
    - `/tmp/go1.26.5-toolchain/bin/go test -race ./internal/... ./cmd/pion-poc` PASS
    - `/tmp/go1.26.5-toolchain/bin/go vet ./...` PASS
    - `/tmp/go1.26.5-toolchain/bin/go mod tidy -diff` PASS（差分なし）
    - `npm run tasks:check` PASS
    - `npm run gate` PASS（clean tree、lint/build/testを同一SHAへ記録）
    - `npm run commit:check` PASS
- system `go`ではなく既存の`/tmp/go1.26.5-toolchain`と`/tmp`内の隔離cacheを使用した。
  Pion/netlink/httptest socketを使うfull/race testのみ権限付き境界で実行した。

### ドキュメント同期

- `documents/migration/pion/rollout-and-operations.md`へ固定20 metric familyのname、type、unit、
  labels、buckets、event増分、session/queue ownershipと0復帰を同期した。
- `documents/design/contracts/frontend-rtc.md`のstatuses/cleanup契約はattempt 1で同期済みで、
  attempt 2の修正はその公開HTTP schemaを変更していない。
- current Python service正本、公開barrel、生成物への変更はないため追加同期・再生成は不要。

### コミット

- `a93b85e9070283461d43b57459f92961cdf03595` `fix(rtc): complete Gate 3 observability coverage`

## attempt 3

### 判断・評価申し送り対応

- input queueをbuffered channelからmutex所有のslice/wakeへ変更し、enqueue、drop-oldest、pop、
  reset/close releaseと`queue_depth`増減を同じlock内へ集約した。consumerが取得済みのframeを
  reset/closeが再度減算できないため、並行pop/closeでも最小値は0未満にならず、generation終了後0へ戻る。
- HTTP middlewareを`observeHTTP(recoverHTTP(mux))`へ変更した。inner recoverがbufferをflushまたは破棄して
  最終500をcommitした後、outer observerが確定statusとdurationをexactly once記録する。
- reconnectは`start`受理後に`sync.Once` terminal ownerを作り、output barrier前のClose、generation overflow、
  async shutdown、connect failure、worker panicを`failure`、running復帰だけを`success`として必ず完結させる。
- Offer owner、TTL sweeper、Wait join helperをfirst-party recover inventoryへ追加した。owner panicはentry削除と
  `done` close、sweeper panicは`sweeperDone` close、Wait helper panicはbounded errorへ変換する。
  Sessionの`onClosed` callback panicは`notifyClosed`で分類し、Manager removal後もSessionClosed、active gauge、
  close duration、`done` closeを継続する。
- task列挙stageに対応するRTCP/inbound/outbound/pipeline goroutine、ICE/connection/track/DataChannel/deadline callback、
  pipeline client read/ping/finalize、Offer owner/sweeper/waitをpanic injection testで明示した。
- `offer_request_id`とpipeline transition `from`/`to`を通常logから除去し、`session_id`/`stage`/`reason`/`count`
  語彙へ正規化した。Offer resolve→session close→tombstoneとinvalid transitionのcaptured logで確認した。
- 仕様逸脱なし。attempt 3は既存の公開HTTP/metric schemaを変更せず、attempt 2文書どおりの増減・commit契約を
  実装へ一致させた。

### Comment audit

attempt 2表のうち評価で不一致とされたsurface、およびattempt 3で変更したproduction codeと直接surfaceを
以下で再監査した。attempt 1/2の未変更範囲は過去表を維持する。

| path                                       | symbol/block/decision/flow                           | kind                                    | current comment                                 | reader question                                              | required reader knowledge                                                 | decision (keep/rewrite/delete/add) | action/omission reason                                                                                                                                                       | reviewer note                                      |
| ------------------------------------------ | ---------------------------------------------------- | --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `internal/pipeline/queue.go`               | `frameQueue` / `newFrameQueue`                       | ownership boundary / state              | channel容量の実装だけ                           | queue itemとgaugeのownerは誰で、close/pop競合をどう防ぐか    | slice mutationとmetric deltaを同じmutexで直列化し、wakeは状態通知だけ     | add/rewrite                        | type commentでsole telemetry owner、generation終了時0復帰、consumer transferを説明。constructorのobserver先頭/nil正規化はtypeと同一局所flowで明白なため個別逐語commentは省略 | channel `len` snapshotを廃止                       |
| `internal/pipeline/queue.go`               | `push` / `pop` / `close`                             | data transformation / queue lifecycle   | pop/closeなし                                   | enqueue/drop/dequeue/closeのどの時点でownershipが移るか      | drop-oldestはdepth不変、popはextractorへ移管、closeは未取得分だけ一括解放 | add                                | pop/closeへ競合理由とobservable gauge side effectを近接comment化。pushはtype commentと単一mutex blockで同じ契約を直接実装するため重複commentを省略                           | race testでminimum>=0、final=0                     |
| `internal/pipeline/connect.go`             | generation `frameQueue` construction                 | orchestration / dependency              | queue生成のみ                                   | queueはどのRecorderへeventを出すか                           | ConfigureRuntime済みのimmutable observerをgenerationごとに注入            | rewrite                            | `newFrameQueue(c.observer)`へ変更。接続flowの既存commentとframeQueue docが前後関係を覆う                                                                                     | reset後も同じprocess recorder                      |
| `internal/pipeline/runtime.go`             | `pcmLoop` input dequeue                              | pipeline / ownership transfer           | channel receiveと別metric call                  | context cancel、close、dequeueをどう直列化するか             | `pop(ctx)`がwaitと-1を所有し、loopはSendPCM以降だけを担当                 | rewrite                            | direct channel receiveと重複deltaを削除。file先頭pipeline-position commentと`pop` docで責務分離を説明                                                                        | consumer側にgauge操作なし                          |
| `internal/pipeline/coordinator.go`         | `SubmitPCM` / `Close`                                | public flow / queue owner               | Coordinatorがqueue metricも所有するように読めた | session log countとqueue telemetryの責務差は何か             | frameQueueがitem/gauge、Coordinatorはsession累積overflow count            | rewrite                            | SubmitPCM docをowner分離へ同期、Closeは`frameQueue.close`へ委譲                                                                                                              | stale「全exitでCoordinatorが減算」を解消           |
| `internal/pipeline/coordinator.go`         | `transitionLocked` log                               | privacy / state transition              | raw `from`/`to` field                           | state調査にpayload/cardinality不要で何を残すか               | stage=`pipeline_state`、reason=`invalid_transition`で分類可能             | rewrite                            | 許容語彙へ正規化し、TransitionError内部だけにtyped from/toを保持                                                                                                             | captured JSON logでfield非露出                     |
| `internal/pipeline/reset.go`               | `requestReset` sync phase / terminal owner           | lifecycle / metric transaction          | start後early returnがterminalなし               | accepted reconnectを全exitでどうexactly once完結するか       | sync.Once、async handoff、default failure、successはrunning復帰だけ       | rewrite/add                        | start直後にterminal ownerを確立し、handoff前deferとasync deferを説明。局所commentでshutdown/panic/cancelを列挙                                                               | shutdown barrier競合testあり                       |
| `internal/pipeline/reset.go`               | old input close                                      | queue lifecycle / generation transition | remaining snapshotをCoordinatorが減算           | old generationの未取得frameを誰が解放するか                  | frameQueue closeがpopと同じlockで一括解放                                 | rewrite                            | remaining/delta logicを削除しqueue ownerへ委譲                                                                                                                               | double release不可                                 |
| `internal/pipeline/client/connection.go`   | `goWorker` read/ping/finalize                        | direct recover surface                  | attempt 2でwrapper追加済み                      | 各client worker panicはどのeventへなるか                     | counted workerはWaitGroup解放、全stageはpayload-free EventPanic           | keep                               | 実コードは既に共通boundaryとstageを保持。attempt 3で3 stageの1対1 injection testを追加したためproduction comment変更不要                                                     | third-party websocket内部は非対象                  |
| `internal/media/output.go`                 | `NewOutputProcessor` / `NewOutputProcessorWithClock` | exported constructor / observer input   | observer入力境界がdocにない                     | nil、未指定、複数指定、通知副作用は何か                      | 先頭のみ、nilはdiscard、eventは同期payload-free、Run後immutable           | rewrite                            | 両exported constructorとshared hookへsemantics/side effectを追加                                                                                                             | evaluator指摘と実コードを一致                      |
| `internal/signaling/http.go`               | `Handler` middleware composition                     | HTTP orchestration / metric commit      | 順序の説明なし                                  | panic 500をcount/latencyへ含めるownerは誰か                  | recoverが最終responseをcommitし、outer observeがreturn後に記録            | add/rewrite                        | composition直前にcommit順序とexactly onceを説明し`observe(recover(mux))`へ変更                                                                                               | panic offerで5xx counter/histogram countをassert   |
| `internal/signaling/http.go`               | `responseBuffer` / `flush`                           | private response transaction            | helperにflow commentなし                        | header/status/bodyはいつnetworkへ出て、panic時どうなるか     | 全responseを保持、successだけflush、panicは全破棄、streaming非対応        | add                                | typeとflushへcommit ownership、非対象、破棄条件をreader-orientedに記載                                                                                                       | partial success testを維持                         |
| `internal/signaling/http.go`               | `recoverHTTP` / `observeHTTP` / `statusWriter`       | panic and observation boundary          | recover非対象だけ                               | middleware前後関係とobservable outputは何か                  | inner buffer、fresh 500、outer final status capture                       | rewrite/keep                       | recoverHTTP docを全面rewrite。observe/statusWriterは単一purposeの既存名・処理で、Handler/recover docから前後関係を局所追跡できるため重複commentを省略                        | streaming/Flusher/Hijacker非対象を明記             |
| `internal/signaling/offer_registry.go`     | `create` owner / entry `done`                        | goroutine / waiter ownership            | success/failureのみ                             | owner panicでwaiter、entry、retryはどう収束するか            | defer owners.Done、identity guard、entry delete、error確定、done close    | rewrite                            | create docへpanic、全waiter、retry、OnClosed前後関係を追加しnormalized panic logを追加                                                                                       | owner panic testでentry=0                          |
| `internal/signaling/offer_registry.go`     | `startSweeper` / `sweep`                             | process worker / join                   | direct goroutine、doneはnormal exitのみ         | Clock/sweep panic後もWaitできるか                            | wrapperが全exitでsweeperDone close、panic値は破棄                         | add/rewrite                        | wrapper docにownership/output/非対象を記載、sweep docをwrapper関係へ同期                                                                                                     | panic clock testでWait成功                         |
| `internal/signaling/offer_registry.go`     | `Wait` / `startJoin`                                 | shutdown helper / recover               | direct helper goroutine                         | helper panicやcaller deadlineでgoroutineをstrandingしないか  | buffered error result、owner+sweeper join、caller ctxは待機だけを制限     | add/rewrite                        | startJoin docへbounded errorとexactly-one resultを記載、Waitはtyped resultを返す                                                                                             | helper panic injectionあり                         |
| `internal/signaling/offer_registry.go`     | `sessionClosed` log                                  | lifecycle callback / privacy            | request IDを通常logへ出す                       | tombstone診断に許容語彙だけで何を残すか                      | session IDとnormalized session_closed reason                              | rewrite                            | `offer_request_id`を削除。既存sessionClosed docはstate/TTL変換を正確に説明するため保持                                                                                       | lifecycle log marker testあり                      |
| `internal/rtc/manager.go` / `contracts.go` | Manager removal→`offer.OnClosed`                     | callback ownership / direct surface     | callbackはresource join後通知                   | callback自身のpanic ownerは誰か                              | Manager removalを先に完了し、Session boundaryが後続cleanupを保証          | keep                               | Manager wrapper順序とOffer contractは正確。recover責務は新しいSession `notifyClosed` docへ局所化                                                                             | callback後もmanager Count=0                        |
| `internal/rtc/session.go`                  | cleanup terminal publication / `notifyClosed`        | lifecycle / callback panic boundary     | callback panicがouter cleanupを中断             | onClosed panicでもdone/active/close durationをどう解放するか | callbackを局所recoverしreason panicへ変更、metrics/log後にdone close      | rewrite/add                        | notifyClosedへ入力、failure、side effect、後続責務を説明しcleanup順序を変更                                                                                                  | failed/panic、active=0、success duration=1をassert |
| `internal/rtc/safe.go`                     | `startCleanup`                                       | outer recover direct surface            | process crash防止のみ                           | 既知callback panicがoutermostへ漏れてcleanupを止めないか     | notifyClosedが局所分類し、outer boundaryは予期不能panicの最終防壁         | keep                               | 既存docはdetached joinと最終containmentを正確に説明。callback責務はSession側へ分離                                                                                           | runtime fatal/cgoは非対象                          |
| production以外の変更ファイル               | pipeline/RTC/signaling focused tests                 | test-only                               | test名でscenarioを表現                          | comment audit対象か                                          | production API/flowではなくacceptance assertion                           | keep                               | source-comments規約のproduction audit対象外。race ownership、terminal result、metric、privacy、panic stageをtest名とhelperで明示                                             | `<task-dir>/acceptance`は未変更                    |

### 検証

- targeted:
    - queue/reconnect/HTTP/Offer/Session/client focused test PASS
    - 同focused集合を`-race -count=10`でPASS
    - RTC recover testは`rtcp_reader`、`inbound_processor`、`outbound_clock`、
      `pipeline_generation|text|synth|start`、`connection_state`、`ice_state`、`track`、
      `data_channel|open`、全deadline stageを個別subtestでPASS
- full（commit `1a9c9771863eba62145f554f2d024bead56933bd`）:
    - `/tmp/go1.26.5-toolchain/bin/go test ./internal/... ./cmd/pion-poc` PASS
    - `/tmp/go1.26.5-toolchain/bin/go test -race ./internal/... ./cmd/pion-poc` PASS
    - `/tmp/go1.26.5-toolchain/bin/go vet ./...` PASS
    - `/tmp/go1.26.5-toolchain/bin/go mod tidy -diff` PASS（差分なし）
    - `npm run tasks:check` PASS
    - `npm run gate` PASS（clean tree、lint/build/testを同一SHAへ記録）
    - `npm run commit:check` PASS
- system `go`ではなく既存の`/tmp/go1.26.5-toolchain`と`/tmp`内の隔離cacheを使用した。
  Pion/netlink/httptest socketを使うfull/race testのみ権限付き境界で実行した。

### ドキュメント同期

- 公開endpoint、JSON、metric name/type/unit/label/bucketは変更していない。attempt 3は
  `rollout-and-operations.md`に既に記載された「response確定時+1」「queue ownership解放後0」の
  実装不一致を修正したため、運用文書の追加差分は不要。
- 公開barrel、生成物、current Python service正本への影響はなく、再生成対象なし。

### コミット

- `1a9c9771863eba62145f554f2d024bead56933bd` `fix(rtc): close Gate 3 concurrency gaps`

## attempt 4

### Completion Summary

- 判定: 実装完了。attempt 3評価で残ったprocess lifecycle logのfield allow-list違反とcomment audit漏れを解消した。
- commit: `36f847638a6ebd071ebc82c845ccc1f7b4c98d16`
- listener開始は`stage=listener_ready,count=<goroutine count>`、signal受信は
  `reason=process_shutdown`、shutdown完了は`stage=shutdown_complete,count=<active session count>`へ固定した。
- captured `slog.Handler` testでproduction helperの全application keyが
  `session_id|reason|stage|count`の部分集合であることと、3 eventのexact field/valueを検査した。
  実processのSIGTERM integrationでも旧6 fieldが出力されないことを確認した。
- 既存のprocess phase、admission、panic containment、共通5秒drain、可観測性実装は変更していない。
- 仕様逸脱、未実行確認、残課題なし。詳細は以下を参照。

### 判断・評価申し送り対応

- `http`、`frontend_dir`、`initial_goroutines`、`signal`、`active_sessions`、
  `final_goroutines`は通常logから削除した。signalの具体値と終了時goroutine数は保持せず、
  task.mdの正規形だけを出力する。
- 3つのlifecycle eventをprivate helperへ集約し、field追加時にstructured-log allow-listと
  privacy契約の先行改訂が必要であることを近接コメントへ残した。
- captured handler testはhelperを複製せず、`serve`が呼ぶproduction helper自体を発火する。
  SIGTERM integrationは正規fieldの存在と旧fieldの非存在をprocess outputで追加確認する。
- attempt 3でPASS済みのmetric ownership、panic response、Offer/Session callback収束、
  RTCP、drain順序には変更を加えていない。

### Comment audit

attempt 4のproduction差分と、その理解に必要なprocess lifecycle/privacy surfaceを次の9列で再監査した。
attempt 1から3の未変更surfaceは過去表を維持する。

| path                   | symbol/block/decision/flow                                                   | kind                               | current comment                                                                   | reader question                                                              | required reader knowledge                                                                                  | decision (keep/rewrite/delete/add) | action/omission reason                                                                                                                 | reviewer note                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `cmd/pion-poc/main.go` | `serve`のlistener開始、signal受信、shutdown完了log                           | process lifecycle / privacy flow   | attempt 3ではprocess composition/drain順序だけを説明し、log field制約の説明がない | 各eventで何を記録でき、address/path/signal名/goroutine数をなぜ記録しないのか | application keyは4種だけで、各eventはtask固定のstage/reason/countへ写像し、環境情報を通常logへ出さない     | rewrite/add                        | 3 eventを正規形helperへ置換し、旧6 fieldを削除。3 helper共通の近接コメントでprivacy境界、除外情報、変更条件を説明した                  | captured handlerのexact attrsとallow-list、実processの旧field非露出を照合する   |
| `cmd/pion-poc/main.go` | `logListenerReady` / `logShutdownRequested` / `logShutdownComplete`          | data transformation / constraint   | 新規helper。共通コメントを先頭helper直前へ配置                                    | runtime/process stateをどの有限なstructured attributeへ変換するのか          | listenerだけは開始時goroutine count、signalは固定reason、完了はactive session countを`count`として記録する | add                                | 隣接する3 helperを一つのprivacy flowとして説明。各helperの逐語docは、共通制約と型付き引数から追加情報がなく重複するため省略した        | helperごとのmessageとfield集合が正規形にexact一致することを照合する             |
| `cmd/pion-poc/main.go` | `processState.BeginDrain`→cancel→HTTP shutdown→Offer wait→`CloseAll`→完了log | shutdown orchestration / lifecycle | 共通5秒deadline、admission先行、未join非正常化を既存`serve` commentが説明         | lifecycle log正規化でcleanup順序や完了判定が変わっていないか                 | 完了logは全段のjoinがerrorなしで終わった後だけ出て、`sessions.Count()`をterminal countとして読む           | keep                               | 既存commentは入力、順序、deadline、失敗条件を正確に説明するため保持。log callだけをhelper化し、cleanup順序とerror joinは変更していない | shutdown error時に完了logを出さない既存flowと、active session countの位置を照合 |
| production以外の変更   | `process_log_test.go` / `main_integration_test.go`                           | test-only                          | test名とfailure messageで契約を表現                                               | production comment audit対象か                                               | production API/flowではなくprivacy契約の回帰assertionである                                                | keep                               | source-comments規約のproduction audit対象外。production helper捕捉、allow-list、正規field、旧field非露出をtest名とtableで明示した      | `<task-dir>/acceptance`は未変更                                                 |

### 検証

- targeted:
    - `go test ./cmd/pion-poc -run '^TestProcessLifecycleLogsUseCanonicalPrivacyFields$' -count=1` PASS
    - `go test ./cmd/pion-poc -run '^TestProcessSIGTERMStopsHTTPAndJoinsActiveSession$' -count=1 -v` PASS
      （sandbox内ではloopback socket禁止だけで失敗し、同一差分を許可済み境界で再実行してPASS）
- full:
    - `/tmp/go1.26.5-toolchain/bin/go test -race ./internal/... ./cmd/pion-poc -count=1` PASS
    - `/tmp/go1.26.5-toolchain/bin/go vet ./...` PASS
    - `/tmp/go1.26.5-toolchain/bin/go mod tidy -diff` PASS（差分なし）
    - `/tmp/go1.26.5-toolchain/bin/gofmt -l <変更Go files>` PASS（出力なし）
    - `git diff --check` PASS
    - `npm run tasks:check` PASS
    - `npm run commit:check` PASS
    - `npm run gate` PASS（clean tree、commit `36f847638a6ebd071ebc82c845ccc1f7b4c98d16`で
      lint/build/testを記録。frontend testは85 file PASS、1 file skip、577 test PASS、2 test skip）

### ドキュメント同期

- 公開HTTP endpoint、JSON、metric schema、panic/drain挙動は変更していない。
- attempt 1で同期済みの`documents/migration/pion/rollout-and-operations.md`は通常logへ
  session ID、SDP、candidate、chat、音声payloadを出さないprivacy契約を保持しており、
  attempt 4はtask.mdで既に確定したprocess lifecycle正規形へ実装を合わせる残差修正のため追加差分は不要。
- `documents/design/contracts/frontend-rtc.md`のstatuses/health契約にも変更なし。
  公開barrel・生成物・設定への影響はなく、再生成対象なし。

### コミット

- `36f847638a6ebd071ebc82c845ccc1f7b4c98d16` `fix(rtc): normalize process lifecycle logs`

## attempt 5

### Completion Summary

- 判定: 実装完了。attempt 4評価で残った`disconnect_grace` deadline schema、
  event ownership、focused coverage、運用文書同期をすべて解消した。
- final HEAD: `1d09102a0a976d208874e5ce3a42b82aaeac9601`
- `sincro_rtc_deadlines_total`の有限stageは
  `gather|pre_connect|media_readiness|disconnect_grace|restart|close`のexact 6値となった。
- disconnect grace expiryは`disconnect_grace`をexactly once記録し、後続restart expiryだけが
  `restart`を記録する。process log、panic、drain、他metric ownershipは変更していない。
- 仕様逸脱、未実行確認、残課題なし。

### 判断・評価申し送り対応

- `deadlineStages`へ`disconnect_grace`を追加し、未知stageの`close` fallbackを含む既存の
  finite-cardinality境界を維持した。
- grace timer callbackは`recoveryGrace`からのtransitionを確定するlifecycle lock内で
  `Deadline("disconnect_grace")`を記録する。最初の発火でphaseが`recoveryNeedsRestart`へ変わるため、
  同じtimer callbackが重複発火しても再記録しない。
- fixed schema testはinternal setだけでなくPrometheus expositionのstage集合もexact比較する。
  focused expiry testは同じfake timerを2回発火し、`disconnect_grace=1`かつrestart期限前の
  `restart=0`を検査する。
- review/evalの指定どおり、運用文書の20 family表も同じ6 stageへ同期した。

### Comment audit

attempt 5のproduction差分と直接のchange comprehension surfaceを次の9列で監査した。
attempt 1から4の未変更surfaceは過去表を維持する。

| path                                 | symbol/block/decision/flow                                  | kind                                 | current comment                                                                | reader question                                              | required reader knowledge                                                                     | decision (keep/rewrite/delete/add) | action/omission reason                                                                                                                  | reviewer note                                                        |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `internal/observability/registry.go` | `deadlineStages` / `Registry.Deadline`                      | metric schema / cardinality boundary | `Recorder.Deadline`と実装methodが有限lifecycle stageへ正規化することを説明済み | `disconnect_grace`を追加してもlabel集合はtask固定値だけか    | exact 6 stage、未知値は`close`、payload由来labelは禁止                                        | keep                               | 既存doc commentが入力、有限性、normalization責務を覆い、set literalがexact値を局所表示する。個別var commentは値の逐語反復になるため省略 | setのexact比較とPrometheus expositionのexact label集合を照合         |
| `internal/rtc/recovery.go`           | `disconnectGraceExpired`のgrace→restart-required transition | lifecycle / metric event ownership   | grace後にrestart deadlineへ進む説明だけで、2つのdeadline metric ownerが不明    | grace expiryとrestart expiryを誰が何回記録するか             | guardとphase transitionがgrace eventをexactly onceにし、後続callbackだけがrestart eventを所有 | rewrite                            | 近接commentへ`disconnect_grace`、1回、後続`restartDeadlineExpired`の責務を明記し、実callを`restart`から`disconnect_grace`へ修正         | timer重複発火でgrace=1/restart=0、後続既存testでrestart closeを照合  |
| `internal/rtc/recovery.go`           | `restartDeadlineExpired`                                    | lifecycle / terminal event owner     | phase再確認とclose開始を同じlockで確定すると説明済み                           | grace metric修正でrestart expiry ownershipが曖昧にならないか | `recoveryNeedsRestart` guardを通った実restart expiryだけが`restart`を記録する                 | keep                               | 既存commentと隣接grace commentで前後関係、state guard、event ownerを局所的に追えるため実装変更・重複commentは不要                       | grace expiry時点ではrestart counterが0であることをfocused testで確認 |
| production以外の変更                 | `registry_test.go` / `recovery_test.go` / rollout運用文書   | test / documentation                 | fixed family存在testと5 stage文書だけでgrace欠落を検出できなかった             | production comment audit対象か                               | testはschema/ownership assertion、文書は公開運用schemaの同期先                                | keep/rewrite                       | production source comment audit対象外。exact schema test、expiry test、運用表の6 stage化を同じcommitへ含めた                            | `<task-dir>/acceptance`は未変更                                      |

### 検証

- targeted:
    - `go test ./internal/observability ./internal/rtc -run 'TestRegistryDeadlineStagesMatchFixedSchema|TestDisconnectGraceExpiryRecordsDedicatedDeadlineExactlyOnce|TestDisconnectedGraceThenRestartDeadlineCloses' -count=1` PASS
    - `/tmp/go1.26.5-toolchain/bin/go test -race ./internal/observability ./internal/rtc -count=1` PASS
- full:
    - `/tmp/go1.26.5-toolchain/bin/go test ./internal/... ./cmd/pion-poc -count=1` PASS
    - `/tmp/go1.26.5-toolchain/bin/go vet ./...` PASS
    - `/tmp/go1.26.5-toolchain/bin/go mod tidy -diff` PASS（差分なし）
    - `/tmp/go1.26.5-toolchain/bin/gofmt -l <変更Go files>` PASS（出力なし）
    - `npm run tasks:check` PASS
    - `npm run commit:check` PASS
    - `npm run gate` PASS（clean final HEAD
      `1d09102a0a976d208874e5ce3a42b82aaeac9601`でlint/build/testを記録。
      frontend testは85 file PASS、1 file skip、577 test PASS、2 test skip）
- `npm run commit:check`の最初のsandbox内実行は`git` subprocessの`EPERM`だけで失敗し、
  同一HEADを許可済み境界で再実行してPASSした。

### ドキュメント同期

- `documents/migration/pion/rollout-and-operations.md`の
  `sincro_rtc_deadlines_total`をexact 6 stageへ同期した。
- endpoint、JSON、他19 metric family、privacy、panic、drain契約は変更していない。
- 公開barrel、生成物、設定schemaへの影響はなく、再生成対象なし。

### コミット

- `33f1e210574503c0126803e9fcf031eb6098ceff` `fix(rtc): record disconnect grace deadlines`
- `1d09102a0a976d208874e5ce3a42b82aaeac9601` `docs(rtc): clarify deadline metric ownership`
