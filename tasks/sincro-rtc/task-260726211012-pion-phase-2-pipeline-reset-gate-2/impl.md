# Implementation Log: task-260726211012-pion-phase-2-pipeline-reset-gate-2

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断と申し送り対応

- commit `7e446e7fdd6c3203ca175ae6f498375d1f6ec29f` を実装の正本とする。
- review申し送りのProcessor intermediate/final排他は、request identityを共通条件にし、
  intermediateはrequest history同一、finalはrequest history + responseだけを受理する形にした。
- production factoryはretryごとに4 clientを新規生成し、Extractorだけへ`now`を渡す。
  Extractor → Recognizer → Processor → Synthesizerの順で接続し、失敗時は逆順close / joinする。
- `Activate`とCoordinatorの`running`遷移を同じstate lock内へ置いた。factoryのevent gateは
  building中のeventで接続contextをcancelし、published後のhandlerはstate lock解放後にruntime resetへ入る。
  event channelの正常closeはfailureとして扱わない。
- external outputはsession lifetime channelを維持し、`outputMu`をgeneration更新・旧buffer drain・enqueue再確認の
  barrierにした。Closeはstate確定とsession cancelを先に行い、全producer join後だけchannelをcloseする。
- full race実行で既存clientのwrite timeoutとreader failureが競合し、因果となる`write_failed`より
  `read_failed`が先勝ちする問題を再現した。同期writeの完了barrierを追加し、readerがwrite結果のterminal分類を
  待つようにした。対象race testを5回反復してから全race testを再実行した。
- 仕様からの意図的な逸脱はない。ただし実Python 4-service Gate 2は環境不足でFAILであり、
  Phase 2 exit gateをPASSとは扱わない。

### Gate 2実service

- 固定build-tag entrypointは4 origin未設定をskipせずtest failureにすることを確認した。
- `docker` command、起動済み4 origin、Recognizer model/GPU、VoiceVox/S3/Consulを含むbackendを
  このworktreeで用意できなかった。production composeや外部環境は変更していない。
- fixture原本は24 kHz / mono / 16-bit PCM、SHA-256
  `3f9169ec597de0f8fc17b4b6e4f89ea05e8792f42bfb48bfa7c33277318d3759`、
  deterministic 16 kHz変換後は171,008 byte、SHA-256
  `a0375e761e7a483117a7535a5da7ed0ef0036611916a0b0e534403e551789933`と一致した。
- 実service image / commit、stage deadline、reset前後connection count、Close後active connectionは未観測である。
  詳細とFAIL理由は`artifacts/gate-2-result.md`を参照する。

### 検証

- `gofmt -l .`: PASS（出力なし）
- `go vet ./...`: PASS
- `go test ./...`: PASS
- `go test -race ./...`: PASS
- `go mod tidy -diff`: PASS（差分なし）
- `go test -race ./internal/pipeline/... -count=1`: PASS
- `go test -race ./internal/pipeline/client -run '^TestWriteTimeoutIsTerminalAndDoesNotLeaveHelper$' -count=5`: PASS
- `go test -tags=gate2 ./internal/pipeline -run '^TestDoesNotExist$'`: PASS（Gate 2 entrypointのcompile確認）
- 固定Gate 2 command: FAIL（4 origin未設定。skipなし）
- `npm run gate`: commit `7e446e7f`のclean worktreeでlint / build / test PASS
- `npm run tasks:index:check`: PASS
- `npm run tasks:check`: PASS
- `npm run commit:check`: PASS
- 最終worktree: clean

### ドキュメント同期

- `documents/migration/pion/roadmap.md`と`implementation-phases.md`へ実装package、fixture、
  Gate 2 artifactの導線、および実4-service PASSまでPhase 3条件未達であることを同期した。
- `documents/design/contracts/audio-pipeline-websocket.md`へgeneration reset、bounded queue、
  confirmed history / partial破棄、retry、output barrier、close semanticsを同期した。
- `documents/design/backend/services/audio-broker.md`へGo Coordinatorの責務と、Phase 3統合までは
  Python AudioBrokerがproduction正本である境界を同期した。
- Frontend RTC契約、compose、env sampleは公開実行経路を変更していないため同期不要と判断した。
- Gate 2実行結果はmain checkout側の`artifacts/gate-2-result.md`へ記録した。

### Comment audit

| path                                     | symbol / block / decision / flow         | kind                         | current comment             | reader question                                                  | required reader knowledge                                    | decision | action / omission reason                                           | reviewer note                         |
| ---------------------------------------- | ---------------------------------------- | ---------------------------- | --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------ | ------------------------------------- |
| `internal/pipeline/coordinator.go`       | package / `Coordinator`                  | package・ownership           | 新規                        | sessionを跨ぐstateとgeneration stateの所有者は誰か               | Start context、4 client、history、external channelのlifetime | add      | package commentとtype docへ所有範囲、再利用禁止、join後closeを記載 | zero valueを補完しない                |
| 同上                                     | client interface aliases                 | public API boundary          | 新規                        | 各stageは何を送受信し、どこまでを所有するか                      | result/event channel、raw Processor bytes                    | add      | 4 interfaceをsymbolごとにdoc化                                     | concrete clientの再接続責務を混ぜない |
| 同上                                     | `ClientSet` / `ClientSetFactory`         | public lifecycle boundary    | 新規                        | partial set、attempt、closeの契約は何か                          | attemptごとの新規set、逆順join、Activate                     | add      | partial set禁止とfactory内cleanupを記載                            | fakeとproductionの共通seam            |
| 同上                                     | `Output`                                 | public data boundary         | 新規                        | reset後にconsumerが旧値を識別できるか                            | generation envelope、stable channel                          | add      | fieldを含めgenerationの意味を記載                                  | 既に渡った値は撤回しない              |
| 同上                                     | `NewCoordinator`                         | public constructor           | 新規                        | I/O開始、nil、zero valueの扱いは何か                             | fixed production hooks                                       | add      | validationと副作用なしを記載                                       | public optionは追加しない             |
| 同上                                     | `Start`                                  | public lifecycle             | 新規                        | 同期範囲、context所有、state別errorは何か                        | initial retry、session lifetime、Close race                  | add      | ErrAlreadyStarted / ErrClosed / ctx.Errと成功境界を記載            | Close中Start testあり                 |
| 同上                                     | `SubmitPCM`                              | public input boundary        | 新規                        | format、slice ownership、満杯/reset中の挙動は何か                | 640 byte、copy、drop-oldest、queue交換                       | add      | input単位と非running拒否を記載                                     | PCM以外を受けない                     |
| 同上                                     | `TextResults` / `SynthResults`           | public output boundary       | 新規                        | channel owner、順序、reset時交換の有無は何か                     | generation barrier、close order                              | add      | symbolごとにobservable outputとclose ownerを記載                   | container decodeはPhase 3             |
| 同上                                     | `Close`                                  | public lifecycle             | 新規                        | cancel / join / channel closeの順序は何か                        | close-once、retry停止、producer barrier                      | add      | closed先行と全state idempotenceを記載                              | 戻り時にowner goroutineなし           |
| `internal/pipeline/connect.go`           | connect / Activate / publish flow        | orchestration・linearization | 新規                        | eventがConnect / Activate / runningのどこに分類されるか          | state lock、building event gate                              | add      | attempt ownershipとlinearization pointをblock comment化            | generationは成功まで不変              |
| 同上                                     | retry cap / jitter                       | heuristic・time              | 新規                        | attempt 5以降とoverflow時の値は何か                              | 1秒起点、30秒飽和、crypto/rand                               | add      | exported constantsとloop意図を説明                                 | waiterはsession contextでcancel       |
| `internal/pipeline/client/set.go`        | `SetFactory.Connect`                     | external I/O lifecycle       | 新規                        | 4接続の順序とpartial failure cleanupは何か                       | client API、接続context、reverse close                       | add      | type / constructor / event monitoringへ説明を追加                  | retryごと新factory result             |
| 同上                                     | `Activate` event gate                    | concurrency decision         | 新規                        | publication前eventとchannel closeをどう分類するか                | building/published gate、handler ownership                   | add      | failure cancelとclose非failureを実装コメント化                     | handler nilを拒否                     |
| 同上                                     | `Close`                                  | lifecycle・join              | 新規                        | 同時Closeが途中で戻らないか                                      | `sync.Once`、`closeDone`、watcher join                       | add      | reverse closeと全caller joinを構造で表現                           | stale commentなし                     |
| `internal/pipeline/generation.go`        | state transitions / generation increment | state machine・invariant     | 新規                        | 許可edge、0/wraparound時の扱いは何か                             | typed error、terminal close                                  | add      | state値を全件doc化し、transitionを単一関数へ集約                   | panicしない                           |
| `internal/pipeline/queue.go`             | PCM drop-oldest / queue交換              | queue ownership・threshold   | 新規                        | なぜtextと違いdropを許すか                                       | 20 ms、500 ms低遅延窓                                        | add      | 最新音声維持の理由をblock comment化                                | outputはsilent dropしない             |
| `internal/pipeline/conversation.go`      | extraction / recognition identity        | protocol state transition    | 新規                        | speech/sequenceをどこまで結合・照合するか                        | accumulated speech、outstanding sequence                     | add      | 型と関数分割で表現し、非自明なconfirmed/outstanding関係を保持      | mutexでstage間raceを防止              |
| 同上                                     | Processor intermediate / final           | protocol decision            | 新規                        | streaming resultとhistory commitの排他条件は何か                 | exact request identity、history prefix/response              | add      | validation関数へ条件を集約                                         | final後追加を拒否                     |
| `internal/pipeline/runtime.go`           | 5-stage goroutine flow                   | pipeline・event source       | 新規                        | 各goroutineのpipeline位置とretry責務は何か                       | generation context、in-flight非再送                          | add      | file先頭flow commentで全段とcancel境界を説明                       | 各loopの逐語commentは省略             |
| 同上                                     | external output enqueue                  | concurrency・backpressure    | 新規                        | stale outputと5秒満杯をどう扱うか                                | output mutex、generation再確認、reset                        | add      | barrierのlock orderと責務をblock comment化                         | silent dropなし                       |
| `internal/pipeline/reset.go`             | single-flight reset                      | state transition・lifecycle  | 新規                        | generation更新、drain、client close、join、reconnectの順序は何か | state/output lock order、WaitGroup Add/Wait                  | add      | reset順序とterminal invariantの非同期Close理由を記載               | old workを再利用しない                |
| `internal/pipeline/client/connection.go` | write/read terminal race                 | concurrency decision         | 既存comment不足             | write timeout時にevent sourceをどう確定するか                    | coder/websocketがWrite timeoutでtransportを閉じる            | add      | `writeDone` barrierの因果分類を実装コメント化                      | targeted race 5回PASS                 |
| `internal/pipeline/protocol/*`           | DTO変換                                  | comprehension surface        | 既存docあり・コード変更なし | coordinatorがwire fieldを独自変換したか                          | Raw ownership、既存encode/decode                             | keep     | DTOは変更せず既存docとfixtureを利用                                | 独自schemaを追加していない            |
| `internal/pipeline/*_test.go`            | fake / Gate 2 helpers                    | test・fixture                | 新規                        | production comment規約の対象か                                   | test-only fake time/proxy/WAV変換                            | add      | fixture hash、Gate failure、proxy位置の契約だけcomment化           | production optionへ露出しない         |

stale commentとTODOを変更対象全体で検索し、新規TODOはない。private helperでコメントを省略した箇所は、
境界・heuristic・lifecycleを持たず、命名と上位flow commentから入力、出力、前後関係が局所的に読める
単純なcopy / drain / test assertionに限定した。

### attempt 1 status summary

- Completion Summary: commit `7e446e7fdd6c3203ca175ae6f498375d1f6ec29f`でCoordinator、
  generation reset、bounded queue、conversation validation、production client set、
  fake integration / race / leak test、関連設計文書同期を実装した。
- Verification: Go moduleのformat / vet / test / race / tidy、repositoryの`npm run gate`、
  task checks、commit message checkはPASSした。
- Not Run: 必要な4 origin、container runtime、model / backendを用意できず、
  実Python 4-service Gate 2は未完走でFAIL。skipまたはPASSとして扱わない。

## attempt 2

### 判断とeval申し送りへの対応

- client event callbackへ`Activate`時点のgenerationを閉じ込め、reset後に届いた旧client eventは
  service別のstale dropとして記録して捨てるようにした。ログ属性は`service`と`drop_count`だけに限定し、
  generation、payload、errorを出さない。
- 新規speechは直前speech ID以下を拒否する。speechを跨ぐ回帰をconversation stateが受理していたためで、
  同一speech内のsegment/sequence検証とは独立のsession invariantとして扱った。
- retryとoutput backpressureを同じinjectable waiter seamへ統一した。productionはtimerを使うが、
  testでは時刻を進めず期限到達を決定論的に制御できる。
- resetと`Close`がoutput barrier上で競合した際、reset側がlock取得前に観測したworkを
  `Close`後に使用しないよう、lock取得後にstate/generation/work identityを再検証する。
  全pipeline race testでこの競合によるnil dereferenceを発見し、修正した。
- fake integrationをproduction WebSocket client setとproduction codecを通る4つの
  `httptest` WebSocket serviceへ置き換えた。6つすべてのPython生成MessagePack fixtureを読み、
  各service boundaryで受信schemaまたは前段fixtureとの意味的同値を検証する。
  Processor responseはdynamic request identity/historyだけをgeneric MessagePack map上で差し替え、
  成功経路用のGo DTOを独自作成しない。
- 4 serviceそれぞれのnormal close / malformed frame / remote error、同時障害、8回連続reset、
  event publicationの3 window、reset/connect中とoutput backpressure中のClose matrixを追加した。
  各resetでgenerationが一度だけ進み、4接続が再作成され、旧queue/work/conversationを再利用せず、
  transient stateと外部output bufferを破棄し、confirmed historyだけを維持することを確認した。
- 仕様からの逸脱はない。評価者専用`acceptance/`は変更していない。

### 検証

- `gofmt -l .`: PASS
- `go vet ./...`: PASS
- `go test ./...`: PASS
- `go test -race ./...`: PASS
- `go mod tidy -diff`: PASS
- `npm run gate`: PASS（lint / build / test）
- `npm run tasks:index:check`: PASS
- `npm run tasks:check`: PASS
- 固定Gate 2 command: FAIL（4 origin未設定。skipなし）

### ドキュメント同期

- `documents/design/contracts/audio-pipeline-websocket.md`へcallback generation capture、
  stale callback/outputのdrop count、PCM overflow count、およびログのprivacy boundaryを同期した。
- `documents/design/backend/services/audio-broker.md`へ同じreset観測契約とログ属性制約を同期した。
- 公開endpoint、wire schema、compose、env sample、frontend RTC契約は変更していないため、
  それらの同期や生成物再生成は不要と判断した。
- 実Python 4-service Gate 2は引き続き未完走であり、fake WebSocket検証を代替PASSとせず、
  `artifacts/gate-2-result.md`へattempt 2結果を追記した。

### Comment audit

| path                                                     | symbol / block / decision / flow                            | kind                                 | current comment                       | reader question                                               | required reader knowledge                                                | decision | action / omission reason                                                    | reviewer note                      |
| -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `internal/pipeline/connect.go`                           | `connectWithRetry`のActivate callback                       | event source・generation boundary    | attempt 1のpublication window説明のみ | callbackがreset後に発火した場合、どのgenerationへ帰属するか   | callback closureはclient setより長く生存し得る                           | rewrite  | Activate時点のgenerationをcaptureし、event handlerへ明示的に渡す契約へ更新  | 現在値の再読込は禁止               |
| 同上                                                     | `waiter` / `realWait`                                       | time heuristic・test seam            | 同期wait前提                          | retryとoutput timeoutをどうcancelし決定論的に試験するか       | buffered result channel、context cancellation                            | rewrite  | 非同期result channelの所有権とproduction timer goroutineを記載              | public optionには露出しない        |
| `internal/pipeline/coordinator.go`                       | `staleDrops` / `SubmitPCM` overflow                         | observability・privacy boundary      | drop理由のみ                          | 何を数え、ログへ何を出してよいか                              | service別count、PCM queue overflow                                       | add      | service/countだけを記録する制約を実装とdocへ反映                            | payload/error/generationなし       |
| `internal/pipeline/queue.go`                             | `pcmQueue.push`                                             | bounded queue・threshold             | drop-oldest理由あり                   | 呼出側が累積drop数をどう観測するか                            | queue lock内の単調count                                                  | rewrite  | dropped flagとcountを返す契約を追加                                         | audio contentは返さない            |
| `internal/pipeline/reset.go`                             | `onClientEvent` / `isCurrentGeneration` / `recordStaleDrop` | stale callback・state transition     | generation引数なし                    | 旧client failureが新generationをresetしない保証は何か         | captured generation、service、single-flight reset                        | add      | generation identity checkとservice別drop記録を関数境界で説明                | stale eventはresetしない           |
| 同上                                                     | reset output barrierとCloseの競合                           | lifecycle・lock decision             | lock順序説明あり                      | Closeが先にworkを破棄した場合にresetは何を参照できるか        | outputMu→mu、work identity、terminal state                               | rewrite  | lock取得後のstate/generation/work再検証理由を追加                           | nil work panicを防止               |
| `internal/pipeline/runtime.go`                           | 各stage result受信                                          | pipeline・stale data boundary        | generation context説明のみ            | cancelと競合して届いた旧resultを処理してよいか                | service別generation check、stale counter                                 | add      | 各boundaryでcurrent generationを再検証し、serviceをpublishへ伝播            | payloadをログしない                |
| 同上                                                     | output backpressure barrier                                 | timeout・concurrency                 | 5秒timerとlock order説明              | timeoutをどう注入し、Close/resetと競合させるか                | waiter result channel、outputMu                                          | rewrite  | injected waiterを使うことと、期限後reset requestの責務を更新                | silent dropなし                    |
| `internal/pipeline/conversation.go`                      | speech / sequence state                                     | protocol state machine               | attempt 1では局所条件中心             | speechを跨ぐ単調性と同一speech内の累積をどう区別するか        | last speech ID、accumulated、outstanding sequence                        | rewrite  | session invariantとspeech transitionの全体像をreader-oriented commentで記載 | 型だけでは前後関係が不足           |
| 同上                                                     | current user / Processor intermediate・final                | data transformation・commit decision | identity検証の説明不足                | partial更新とhistory commitはどのidentityを満たす必要があるか | exact request identity、history prefix、final一度だけ                    | rewrite  | currentUserの役割、intermediate非commit、final commit条件を記載             | reset時transient破棄対象           |
| `internal/pipeline/coordinator_test.go`                  | event 3-window / backpressure / Close matrix                | test-only lifecycle proof            | 新規                                  | production concurrency契約をどの競合で固定するか              | fake set publication、controlled waiter、channel ownership               | add      | windowとbarrierの意図をtest名・helper commentで記録                         | production comment省略根拠にしない |
| `internal/pipeline/websocket_integration_test.go`        | Python fixture 4-service harness                            | test-only external boundary          | 新規                                  | production codec/clientを通り各wire boundaryをどう証明するか  | 6 fixture、raw Processor bytes、dynamic identity patch                   | add      | fixture originと各serverの検証責務をcomment化                               | in-memory fakeをGate代替にしない   |
| 同上                                                     | 4×3 fault matrix / simultaneous・repeated reset             | test-only reset flow                 | 新規                                  | reset後の再接続、state破棄、history維持、leakをどう網羅するか | connection counters、generation、queue/work identity、goroutine baseline | add      | matrixと反復試験の観測点をcomment化                                         | real Gate判定とは分離              |
| `documents/design/contracts/audio-pipeline-websocket.md` | reset/logging contract                                      | contract document                    | attempt 1記述                         | callback generationとdrop telemetryの公開契約は何か           | stale event/output、PCM overflow、privacy                                | rewrite  | 実装と同じcapture/drop/log属性を同期                                        | wire schema変更なし                |
| `documents/design/backend/services/audio-broker.md`      | Go Coordinator reset observability                          | design document                      | attempt 1記述                         | 保守者がservice障害とstale dropをどう識別するか               | per-service count、payload非記録                                         | rewrite  | backend責務とprivacy boundaryを同期                                         | Python production境界は維持        |

変更対象のcommentとTODOを再監査し、stale commentおよび新規TODOはない。
コメントを省略したprivate helperは、test assertion、fixture field access、単純なcopy/drainなど、
上表の境界・状態遷移・heuristicを持たず、命名と直接の呼出箇所だけで入力、出力、失敗条件、
副作用、pipeline上の位置が局所的に完結するものに限定した。

### attempt 2 status summary

- Completion Summary: commit `dbb8d7e64c01eb5230d789668e272c3ec8d96957`でevalの実装・
  test・comment・documentation残課題へ対応した。
- Verification: commit SHA上の`npm run gate`、`npm run commit:check`、
  `npm run tasks:index:check`、`npm run tasks:check`はPASSし、worktreeはclean。
  Go moduleのformat / vet / test / race / tidyも同じsource stateでPASSした。
- Remaining Gate: 実Python 4-service Gate 2はoriginとbackend不足のためFAILを維持する。
  詳細と非代替検証の境界は`artifacts/gate-2-result.md`を参照。

## attempt 3

### 判断とeval申し送りへの対応

- 最後に受理したExtractorのgeneration / speech ID / sequence IDをCoordinatorのsession stateへ移した。
  conversationはgeneration-localな発話結合だけを所有し、Coordinator lock下でsession identity検証と
  conversation受理を一つのcommit boundaryとして扱う。
- sequence IDは全generationでstrictly increasing、新generation最初のspeech IDは直前generationより
  strictly largerを要求する。speech再利用・逆行またはsequence重複・逆行はstale扱いせず、
  resultが届いた現在generationのprotocol failureとしてsingle-flight resetへつなぐ。
- WebSocket fixture harnessはPython生成MessagePackをgeneric mapとして読み、2 turn目以降は
  speech / sequence IDだけをstrictly largerへpatchする。Recognizer fixtureも受信したExtractor identityへ
  同じ方法でpatchし、同じID再利用を成功oracleにしない。
- PCM overflow countはgeneration-owned queueから削除し、Coordinatorがsession累積値として所有する。
  reset時のqueue交換では初期化せず、log属性は従来どおり`service`と`drop_count`だけに限定する。
- 仕様からの逸脱はない。評価者専用`acceptance/`は変更していない。

### 検証

- focused `go test -race`（session identity reset、PCM queue交換累積、12-case WebSocket reset matrix）: PASS
- `gofmt -l .`: PASS
- `go vet ./...`: PASS
- `go test ./...`: PASS
- `go test -race ./...`: PASS
- `go mod tidy -diff`: PASS
- `npm run gate`: PASS（lint / build / test）
- `npm run tasks:index:check`: PASS
- `npm run tasks:check`: PASS
- 固定Gate 2 command: FAIL（`SINCRO_GATE2_EXTRACTOR_ORIGIN`未設定。skipなし）

### ドキュメント同期

- `documents/design/contracts/audio-pipeline-websocket.md`へsession-wide Extractor identity、
  reset後のstrict increase、protocol failure/reset、およびPCM session累積countの所有権を同期した。
- `documents/design/backend/services/audio-broker.md`へ同じstate ownershipとobservability契約を同期した。
- wire schema、endpoint、compose、env sample、frontend RTC契約は変更していないため、
  それらの同期や生成物再生成は不要と判断した。
- 実Python 4-service Gate 2は引き続き未完走であり、fixture WebSocket検証を代替PASSとせず、
  `artifacts/gate-2-result.md`へattempt 3結果を追記した。

### Comment audit

| path                                                     | symbol / block / decision / flow                      | kind                            | current comment                         | reader question                                                  | required reader knowledge                                    | decision | action / omission reason                                                           | reviewer note                     |
| -------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- | --------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------- | --------------------------------- |
| `internal/pipeline/coordinator.go`                       | `Coordinator.extraction`                              | session state ownership         | confirmed historyとgenerationのみ       | resetでconversationを交換しても何を維持するか                    | session identityとgeneration-local conversationの境界        | rewrite  | type docへExtractor identity所有を追加                                             | resetで初期化しない               |
| 同上                                                     | `pcmDrops` / `SubmitPCM`                              | observability・privacy boundary | queue-local count前提                   | queue交換後のcountはどこから継続するか                           | Coordinator lock、session lifetime、drop-oldest              | rewrite  | session累積所有とservice/count-only logを記載                                      | payload/generation/errorなし      |
| `internal/pipeline/conversation.go`                      | `extractionIdentity` / `Coordinator.acceptExtraction` | protocol state transition       | generation-local検証のみ                | stale resultと現在generationのidentity violationをどう区別するか | current generation、last accepted tuple、conversation commit | add      | lock boundary、sequence全session単調性、新generation speech strict increaseをdoc化 | violationは現在generation reset   |
| 同上                                                     | `conversation` ownership comment                      | change comprehension surface    | generation跨ぎstateなしと記載           | identityをCoordinatorへ移した後の責務分界は何か                  | transient maps、confirmed history、session identity          | rewrite  | generation-localとsession-owned stateの前後関係を更新                              | stale commentを解消               |
| `internal/pipeline/queue.go`                             | `frameQueue.push`                                     | bounded queue                   | queue内drop countを返す                 | queueがtelemetryも所有する必要があるか                           | queue交換、Coordinator session counter                       | rewrite  | queueはdrop発生boolだけを返し、count責務を削除                                     | latency heuristic commentはkeep   |
| `internal/pipeline/runtime.go`                           | Extractor result受信                                  | pipeline event source           | generation check後conversation受理      | identity検証とstale判定をどこで原子的に行うか                    | Coordinator acceptance boundary、reset routing               | rewrite  | `acceptExtraction`へ統合してcurrent/errorを分離                                    | downstream送信前にcommit          |
| `internal/pipeline/coordinator_test.go`                  | session identity / PCM count tests                    | test-only invariant proof       | reset後の同じIDを未検証                 | speech reuseとsequence reuseが同generation resetになるか         | fake set identity、generation、queue交換                     | add      | 2 protocol caseと2 queue lifetimeを有限deadlineで検証                              | strict identityでgeneration 3成功 |
| `internal/pipeline/websocket_integration_test.go`        | fixture identity patch / assertion                    | test-only external boundary     | 全turn同一fixture ID                    | Python fixture由来を保ちながら後続発話をどう表すか               | generic MessagePack map、dynamic session identity            | add      | speech/sequenceだけをpatchし全turn strict increaseをassert                         | Go DTOで成功値を偽装しない        |
| `documents/design/contracts/audio-pipeline-websocket.md` | identity / PCM telemetry contract                     | contract document               | identity lifetime未記載、累積範囲が曖昧 | resetを跨ぐ単調性とcount lifetimeは何か                          | session state、generation reset、queue交換                   | rewrite  | 実装と同じsession ownership、failure、privacyを同期                                | wire schema変更なし               |
| `documents/design/backend/services/audio-broker.md`      | Coordinator state / observability                     | design document                 | PCM累積のownerが曖昧                    | backend保守者はreset後のID/countをどう解釈するか                 | Coordinator lifetime、Extractor protocol                     | rewrite  | session stateとsession累積を明記                                                   | Python production境界は維持       |

変更対象のcommentとTODOを再監査し、stale commentおよび新規TODOはない。
コメントを省略したprivate helperは、fixture mapのfield置換、test assertion、単純なqueue operationなど、
上表のstate ownership・protocol decision・observability boundaryを持たず、上位flow commentと命名から
入力、出力、失敗条件、副作用、pipeline上の位置が局所的に完結するものに限定した。

### attempt 3 status summary

- Completion Summary: commit `ef5aff83e5dfc549d1f18a5fe83b9036b27a2de3`でsession-wide
  Extractor identityとPCM session累積countの残課題を修正した。
- Verification: commit SHA上の`npm run gate`、`npm run commit:check`、
  `npm run tasks:index:check`、`npm run tasks:check`はPASSし、worktreeはclean。
  Go moduleのfocused/full/race/vet/format/tidyも同じsource stateでPASSした。
- Remaining Gate: 実Python 4-service Gate 2はoriginとbackend不足のためFAILを維持する。
  詳細と非代替検証の境界は`artifacts/gate-2-result.md`を参照。
