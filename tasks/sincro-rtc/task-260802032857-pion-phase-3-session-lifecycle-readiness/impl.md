# Implementation Log: task-260802032857-pion-phase-3-session-lifecycle-readiness

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断と申し送り対応

- review.md の申し送りどおり、lifecycle mutex の取得順を timeout / connected / readiness / Close の
  linearization point とした。timer callback は state 確認と closing 遷移を同じ lock 内で行い、
  Stop と同時発火しても check-then-close race を作らない。
- 同じ track / DataChannel object と同じ open state の再通知は no-op、別 object の同種 media は
  `duplicate_media` close とした。closing 後の OnOpen は smoke payload も送信しない。
- `Session.Close` は timer stop と context cancel までを同期的に確定して返し、PeerConnection、codec、
  Coordinator の close を並行開始する。WaitGroup の Add は lifecycle lock 内で予約してから callback
  goroutine を開始し、cleanup の Wait との競合を防いだ。
- `Manager.CloseAll` は caller の context deadlineを返しても `done` と registry removeを操作せず、
  Session cleanupを継続させる。process entrypoint は既定の5秒contextを渡す。
- `talk_mode` は `chat` / `sincro` を PeerConnection 作成前に検証し、session専用Coordinatorの
  `Start`へ変更せず渡す。
- typed transition error は stateを変更せず、Sessionがclose判断を行う境界で
  `from` / `to` / `event` を一度だけstructured logへ記録する。

### 仕様・文書同期

- endpoint、JSON、SDP、DataChannel payload契約は変更していない。
- タスク本文は設計文書の同期不要としていたが、production entrypointがreadiness後にlocal Consul経由の
  pipeline factoryを注入するため、PoC READMEの「下流Python serviceへ接続しない」がstaleになった。
  現在挙動と後続のPCM投入境界だけを同一commitで最小同期した。migration正本文書の追加変更は不要と判断した。
- 仕様からの機能的逸脱はない。local Consul障害時はserviceごとにportが異なるため誤接続する共通fallbackを
  設定せず、Coordinatorの既存retry中にSession.Closeでcancel/joinできる形にした。

### 検証

- `go test -race ./internal/rtc ./internal/pipeline -count=1`: PASS
- `go vet ./...`: PASS
- `go test -race ./... -count=1`: PASS
- fake clock unitで許可/拒否遷移、全非terminalからのclose、15秒/10秒timer交換、nil/zero拒否、
  Timer.Stopと発火の100回競合を確認した。
- readiness 3条件の6順列、重複promotion、pipeline factory 1回、`chat` / `sincro`伝播、
  invalid talk modeのresource作成前拒否、CloseAll deadline時のdone/registry維持を確認した。
- 既存close競合testを100 callerへ拡張した。

### Change comprehension surface comment audit

| path                           | symbol / block / decision                                     | kind                                     | current comment                                             | reader question                                                       | required reader knowledge                                                                                   | decision | action / omission reason                                                                                                                             | reviewer note                                                        |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `internal/rtc/lifecycle.go`    | `Timer` / `Clock` / `SystemClock`                             | API / time boundary                      | 新規のためなし                                              | Stopとcallback競合を誰がdrainするか                                   | TimerはdrainせずSession mutexがlate callbackを無害化し、duration正数・nil Timer禁止                         | add      | exported contractへownership、入力制約、非対象を追加                                                                                                 | fake clockが同じ最小契約だけでraceを再現すること                     |
| `internal/rtc/lifecycle.go`    | `preConnectTimeout` / `mediaReadinessTimeout`                 | threshold / fallback                     | 新規のためなし                                              | 15秒/10秒がどのhalf-open資源を制限するか                              | Answer後はtransport、connected後は3 media条件を待ち、どちらもpipeline接続前にcloseする                      | add      | 値、起点、失敗modeを各定数に追加                                                                                                                     | timer開始点がcandidate収集完了/connected callbackと一致すること      |
| `internal/rtc/lifecycle.go`    | `sessionState` / `validSessionTransition` / `TransitionError` | state transition / API                   | 新規のためなし                                              | track/channel到着順がstateを飛ばすか、closedから復帰するか            | latchは順序を吸収し、直列chainと全非terminalからclosingだけを許可する                                       | add      | state machine全体の位置、禁止遷移、typed診断を追加                                                                                                   | skipped/reverse遷移がstateを変更しないこと                           |
| `internal/rtc/lifecycle.go`    | `deadlineController.replace/stop`                             | lifecycle / timer                        | 新規のためなし                                              | 2 timerが同時生存するか、Stop後のcallbackは安全か                     | pre-connectとmedia timerは交換され、closingで停止、発火済みcallbackはmutexでstate再確認する                 | add      | controller commentへ交換関係とrace invariantを集約。private methodはこの直上contractと局所名で入力/出力/順序/副作用が読めるため個別逐語commentを省略 | nil/zero validationとtimer交換testを照合すること                     |
| `internal/rtc/lifecycle.go`    | `sessionLifecycle` / readiness fields                         | lifecycle / data                         | 新規のためなし                                              | connected前のmediaを保持するか、duplicate判定に何を保存するか         | object identity、channel open state、state、timerを単一mutexで所有する                                      | add      | latch表現、AND条件、duplicate policyを追加                                                                                                           | fieldがtyped Pion objectであり別objectを識別すること                 |
| `internal/rtc/session.go`      | `SessionDependencies` / `Session`                             | API / ownership                          | 旧Session commentはcodec中心でpipeline/timer/done条件が不足 | 全resource ownerとClose返却時点はどこか                               | factoryはStartまでI/Oせず、SessionはPC/Coordinator/codec/timer/goroutineをclosedまで所有する                | rewrite  | exported dependency契約を追加し、Session commentを非blocking closeとjoin後公開へ更新                                                                 | zero value不可とnil拒否がconstructor経路にあること                   |
| `internal/rtc/session.go`      | `newSession` / `negotiate` / `answerReady`                    | orchestration / boundary                 | Answerのcandidate集約block commentのみ存在                  | validation、resource公開、HTTP ctxからsession timerへの引継ぎ順は何か | talk mode/dependencyをresource前検証し、candidate収集成功後だけanswer_readyと15秒timerを開始する            | add      | setup rollbackとrequest/session lifetime境界を各flowへ追加、既存candidate commentはkeep                                                              | Answer失敗が同じCloseへ入りregistry removeはjoin後であること         |
| `internal/rtc/readiness.go`    | `installCallbacks` / `transportReady`                         | event source / state transition          | 旧callback全体のnavigationなし                              | Pion eventがどのstateとdeadlineへ変換されるか                         | connectedはtimer交換、ICE terminalはClose、track/channelは先着latch、重複connectedはno-op                   | add      | callback orchestrationとconnected transitionを追加                                                                                                   | disconnected即closeの現行判断を維持すること                          |
| `internal/rtc/readiness.go`    | `acceptAudioTrack`                                            | lifecycle / duplicate decision           | 新規flowのためなし                                          | 同じtrack再通知と2本目をどう区別するか                                | 最初のobjectだけdecoder開始権を持ち、別objectはduplicate_media、WaitGroupをlock内予約する                   | add      | identity、no-op、close、pipeline前後関係を追加                                                                                                       | decoderが2本目で開始されないこと                                     |
| `internal/rtc/readiness.go`    | `registerDataChannel` / `dataChannelOpened`                   | lifecycle / event source                 | 旧DataChannel commentは属性とsmoke送信だけ                  | 到着とopenのどちらがreadinessか、late OnOpenは送信するか              | object登録とopen latchを分け、closing/重複callbackはpipelineもsmokeも開始しない                             | add      | 2段階latch、identity、送信権を追加                                                                                                                   | text/telop両方の別object拒否と同一object no-opを照合すること         |
| `internal/rtc/readiness.go`    | `promoteMediaReadyLocked` / `launchPipeline`                  | orchestration / concurrency              | 新規flowのためなし                                          | 3条件とtimeout/Close競合でfactoryが何回作られるか                     | AND成立時にstate/timer/WaitGroup予約を同一lockで確定し、専用goroutineからStartを1回だけ呼ぶ                 | add      | pipeline開始のlinearization、Start失敗、成功後runningを追加                                                                                          | 6順列とfactory count、close中Startのjoinを照合すること               |
| `internal/rtc/data_channel.go` | `handleDataChannel` / `OnOpen`                                | protocol boundary / callback             | 旧commentは属性、固定JSON、send errorを説明                 | pipeline readinessとsmoke sendがclosing後に進むか                     | 属性検証後にobject登録し、最初のOnOpenだけreadiness/送信を許可する                                          | rewrite  | open latch、duplicate object、closing no-opへ更新。固定JSONの既存commentはkeep                                                                       | payload/属性契約自体は不変であること                                 |
| `internal/rtc/media.go`        | outbound track / tone / inbound decoder flows                 | goroutine / media lifecycle              | 旧RTCP drainとpacing commentは一部ownershipのみ             | 各goroutineの開始条件、終了条件、join ownerは誰か                     | RTCPはPC close、toneはconnected/cancel/error、decoderは唯一track/cancel/errorで終了し全てSessionがjoinする  | rewrite  | file分割後に各flowのpipeline内位置、failure、joinを追加し、既存理由commentをkeep                                                                     | WaitGroup AddがCloseのWaitより先に予約されること                     |
| `internal/rtc/session.go`      | `Close` / `beginCloseLocked` / `cleanup` / `closeIfState`     | shutdown / concurrency                   | 旧Close commentは同期resource closeと非同期joinを説明       | nonblocking保証、close開始順、done/remove条件、timer raceをどう保つか | closing/timer stop/cancelがlinearization point、3resource closeを並行開始し、全join後だけclosed/remove/done | rewrite  | public Closeと内部3flowを現在順序へ更新、check-then-close禁止理由を追加                                                                              | Close100 caller、deadline時registry維持、race detectorを照合すること |
| `internal/rtc/manager.go`      | `ManagerDependencies` / `NewManager`                          | API / dependency boundary                | 旧NewManagerはloggerのみでnil/zero条件なし                  | Coordinator/clock/loggerをいつ検証・共有するか                        | dependencyは起動時必須、network/PC/CoordinatorはCreateまで開始しない                                        | rewrite  | exported optionsとconstructor error/side effect/non-targetを追加                                                                                     | nil dependency全caseとsessionごとCoordinator 1個を確認すること       |
| `internal/rtc/manager.go`      | `Create` talk mode / Coordinator ownership                    | boundary / orchestration                 | 旧commentはOffer/Answerとerror cleanupのみ                  | invalid modeがPC前に拒否され、modeがStartまで保持されるか             | chat/sincroだけをresource前検証し、専用CoordinatorとclockをSessionへ渡す                                    | rewrite  | validation順、所有移譲、join後removeへ更新                                                                                                           | invalid modeでfactory/registryが0、両modeのStart引数が一致すること   |
| `internal/rtc/manager.go`      | `CloseAll` / `remove`                                         | API / registry lifecycle                 | 旧CloseAllは無期限wait、removeはcommentなし                 | deadline時にdone/removeを偽装するか、lockを待機中保持するか           | snapshot後全Closeを開始しctxで待つ。cleanupだけがjoin後にtombstoneへ移す                                    | rewrite  | exported deadline contractとprivate remove順序を追加                                                                                                 | timeout後Countが残り、cleanupは独立継続すること                      |
| `cmd/pion-poc/main.go`         | `run` / `newPipelineFactory` / `serve`                        | process orchestration / network boundary | 旧run commentはHTTP/signalのみ                              | factoryはいつI/Oし、shutdown deadlineを誰が渡すか                     | local Consul resolver構築はI/Oせず、readiness後Start、signal時HTTP停止後5秒CloseAll                         | rewrite  | run責務を分割し、fallbackを設定しない理由とprocess error判断を追加                                                                                   | Consul不在時に誤service接続せずCloseでretryをjoinすること            |
| `internal/rtc/session.go`      | `addCandidate`                                                | protocol boundary                        | 既存commentなし                                             | closing後のlate candidateがPionへ届くか                               | session contextを先に確認しactive時だけPionへ渡す                                                           | add      | active/late境界を追加                                                                                                                                | Managerのunknown/closed判定とは別段であること                        |
| `internal/rtc/session.go`      | `logTransitionError`                                          | observability                            | 新規flowのためなし                                          | typed errorを何層で何回logするか                                      | state machineはerrorを返し、close判断を行うSessionだけがstructured logする                                  | add      | 単一運用境界を明記                                                                                                                                   | 同じerrorをManager/handlerで重複logしないこと                        |

### 残リスク

- 本タスクはreadiness後のpipeline接続/lifecycleまでであり、decode済み48 kHz PCMの16 kHz変換と
  `Coordinator.SubmitPCM`接続はスコープ外である。
- local Consul URLはPoC entrypointの既存ローカル実行境界として固定した。production compose設定、
  service別fallback、metrics、ICE restartは後続Phase 3タスクの責務である。

### attempt 1 verification addendum

- 実装commit: `4276216`
- `npm run commit:check`: PASS
- `bun run tasks:check`: PASS（273 task directories）
- gate build相当の `npm run build`: PASS
- gate test相当の `npm run test`: PASS（79 files passed / 1 skipped、534 tests passed / 2 skipped）
- `bun run gate`: FAIL。lint内のBiomeは583 filesを警告ゼロでPASSしたが、Prettierが下記の
  review済み/他task artifact 11件を既存不整合として検出した。今回のproduction差分とREADMEは
  警告対象ではない。`task.md`変更禁止と他task非所有を守り、整形していない。
    - `tasks/sincro-rtc/task-260802032857-pion-phase-3-session-lifecycle-readiness/task.md`
    - `tasks/sincro-rtc/task-260802032903-pion-phase-3-inbound-audio-pipeline/task.md`
    - `tasks/sincro-rtc/task-260802032908-pion-phase-3-outbound-audio-datachannel/review.md`
    - `tasks/sincro-rtc/task-260802032908-pion-phase-3-outbound-audio-datachannel/task.md`
    - `tasks/sincro-rtc/task-260802032912-pion-phase-3-initial-signaling-idempotency/review.md`
    - `tasks/sincro-rtc/task-260802032912-pion-phase-3-initial-signaling-idempotency/task.md`
    - `tasks/sincro-rtc/task-260802032916-pion-phase-3-backend-ice-restart/review.md`
    - `tasks/sincro-rtc/task-260802032916-pion-phase-3-backend-ice-restart/task.md`
    - `tasks/sincro-rtc/task-260802032918-pion-phase-3-frontend-ice-restart/task.md`
    - `tasks/sincro-rtc/task-260802032922-pion-phase-3-observability-gate-3/task.md`
    - `tasks/sincro-rtc/task-260802033116-pion-phase-3-synthesized-audio-decode/task.md`

## attempt 2

### FAIL原因と修正判断

- gather用HTTP contextは5 msで終了していたが、Pion内部のSTUN transactionは既定timeoutまで継続していた。
  `PeerConnection.Close`とcandidate gather終了が競合するとcleanup完了が3秒を超え、registry removeが
  不収束に見えていた。registryを先に削除する回避は採らず、`Create`でrequest deadlineの残時間を取得し、
  `SettingEngine.SetSTUNGatherTimeout`へ伝播してresource自体を期限内に停止させた。
- transport開始前の`RTPSender.Read`はCloseで解除されないPion経路があるため、RTCP drainをAnswer setup時から
  connected callback後へ移した。connected時にtoneとdrainのWaitGroupを同じlifecycle lock内で予約し、
  CloseのWaitより後からAddされない不変条件を維持した。
- `sessionResourceClosers`はcleanupが所有するPeerConnection、codec、Coordinatorの最小close境界である。
  production wiringはconstructorで固定し、testではblocking closeを注入して、非blocking Close、
  close-once、全resource closeとsession goroutine join後だけのclosed/done/removeを決定的に検証した。

### eval.md指摘への対応

- fake clockを実Sessionの`answerReady` / `transportReady`へ接続し、15秒/10秒callback、close reason、
  `closed`、`done`、registry remove、factory 0回を確認した。
- readiness 6順列をfield直接代入から`acceptAudioTrack`、`registerDataChannel`、
  `dataChannelOpened`経由へ変更し、connected前latchも追加した。
- audio / text / telopごとに同一object/stateの重複no-opと別objectの`duplicate_media` closeを確認した。
- timeout対last readinessを30回競合させ、factory高々1回を確認した。browser closeではfactory 0回、
  pipeline Start中Closeでは開始済みCoordinatorのjoinとretry 0回を確認した。
- blocking resourceとsession goroutineを使い、Closeの即時返却、100 caller競合、各resource close 1回、
  全join後だけのstate/done/removeを確認した。
- `CloseAll` deadline後もregistry/doneを維持してcleanupが継続し、block解除後にremoveへ到達すること、
  通常resourceが5秒context内に収束することを確認した。
- `Manager` typeを下記auditへ独立追加した。曖昧な「Phase 3でtombstoneを設計する」を削除し、
  現在はprocess再起動まで保持してTTL/上限削除しない契約へ具体化した。
- `NewManager`はSTUN URLを再検証せずconfigurationへ反映する実装にcommentを一致させ、構文検証ownerが
  起動時config loaderであることを明記した。

### 検証

- gather timeout cleanup:
    - non-race `count=100`: PASS（3.209s）
    - race `count=10`: PASS（1.808s）
- `go test -race ./internal/rtc ./internal/signaling ./internal/pipeline -count=5`: PASS
- `go vet ./...`: PASS
- `go test -race ./... -count=1 -timeout=120s`: PASS
- `bun run gate`: PASS（lint / build / test）
- `bun run tasks:check`: PASS（273 task directories）
- `npm run commit:check`: PASS
- attempt 2 commit: `a3f2c0bc07dd7864f9b8a300a53ee539f5c6afde`

### ドキュメント同期

- endpoint、JSON、SDP、DataChannel payload、公開設定を変更していない。attempt 1で同期したREADMEと
  migration正本は今回のSTUN gather内部deadline、RTCP開始順、test seamの変更後も整合しており、
  追加の設計文書・schema・生成物同期は不要と判断した。

### Change comprehension surface comment audit

| path                        | symbol / block / decision                       | kind                        | current comment                                                                 | reader question                                                           | required reader knowledge                                                                                                 | decision      | action / omission reason                                                                                                                                              | reviewer note                                                         |
| --------------------------- | ----------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `internal/rtc/manager.go`   | `Manager` type / `dependencies` / registry maps | API / ownership / lifecycle | dependency所有の説明なし。tombstoneを「Phase 3で設計」とするstaleな将来記述あり | Managerが共有するものとsession専有resourceは何か。closed IDはいつ消えるか | dependencyはCoordinator生成とclockへ再利用するだけでresourceは共有しない。tombstoneはprocess lifetimeでTTL/上限削除しない | rewrite       | dependency ownershipを追加し、canonical taskや削除条件のない将来記述を現在契約へ置換                                                                                  | `Manager` type独立surfaceとしてfieldとcommentを照合すること           |
| `internal/rtc/manager.go`   | `NewManager`                                    | API / boundary              | STUN URLを「検証する」と実装以上の契約を記載                                    | STUN構文をどこで検証し、constructorは何を行うか                           | config loaderが構文検証し、NewManagerは非空値をPion configurationへ反映するだけ                                           | rewrite       | validation owner、side effect開始点、非対象を実装に一致させた                                                                                                         | invalid STUNの責務をManagerへ誤って追加していないこと                 |
| `internal/rtc/manager.go`   | `Create` request deadline propagation           | boundary / time             | request ctxはcandidate待機だけを制限する説明でPion内部gather継続が不明          | HTTP timeout後にSTUN transactionが残らないか                              | ctx deadline残時間をsession作成時のPion SettingEngineへ渡し、期限切れならPC作成前に拒否する                               | rewrite       | Create commentへSTUN内部上限への伝播を追加                                                                                                                            | 5 ms timeout反復で504とjoin後removeが安定すること                     |
| `internal/rtc/session.go`   | `newPeerConnection`                             | boundary / fallback / time  | 新規flowのためなし                                                              | contextだけ先に返すとなぜcleanupが収束しないか。deadlineなしはどう扱うか  | Pion既定STUN gatherはrequest後も継続し得る。正数だけ上書きし、deadlineなしはPion既定を維持する                            | add           | failure mode、入力単位、zeroの意味、後段cleanupとの関係を追加                                                                                                         | `SetSTUNGatherTimeout`へrequest残時間が渡ること                       |
| `internal/rtc/media.go`     | `installOutboundTrack` / `startRTCPDrain`       | goroutine / lifecycle       | RTCP drainをAnswer setup時に開始しPC Closeで解除すると説明                      | transport未始動でもReadを開始して安全か。誰がAdd/Waitするか               | 未始動ReadはCloseで解除されない経路があるためsenderだけ保存し、connected後にWaitGroup予約済みgoroutineを開始する          | rewrite / add | staleな開始順を置換し、backpressure目的、開始/終了条件、join ownerを追加                                                                                              | gather timeout sessionがRTCP goroutineを所有しないこと                |
| `internal/rtc/readiness.go` | `transportReady` RTCP/tone reservation          | lifecycle / event source    | connected時のtimer交換とpipeline promotionのみ説明                              | helper呼出しとPion実callbackをどう区別し、WaitGroup raceを防ぐか          | Pion stateが実connectedのときだけtone/drainを2件予約し、state/timer/pipeline promotionと同じlock acquisitionで確定する    | rewrite       | connected eventのresource開始順とtransport未始動時のfailure modeをblock commentへ追加                                                                                 | actual callbackでは2 goroutine、fake helperではdeadlineだけが進むこと |
| `internal/rtc/session.go`   | `sessionResourceClosers` / `cleanup`            | lifecycle / test seam       | concrete resourceを直接closeする説明のみ                                        | closeを何個開始し、非blocking Closeと全join後公開をどう独立観測するか     | constructorで固定した3closerを並行開始し全結果、WaitGroupの順にjoinする。test差替えはresource lifecycle検証だけに限定する | add / rewrite | 最小境界のproduction wiringとtest利用目的を追加。cleanup全体commentはkeep                                                                                             | 各closer 1回、worker join前にdone/removeしないtestを照合すること      |
| `internal/rtc/lifecycle.go` | `sessionLifecycle.closeReason`                  | diagnostic data             | lifecycle全体commentはstate/latch/timerを説明済み                               | timeout/duplicate/browser closeのどのeventがclosingを確定したか           | beginCloseのmutex内で最初のreasonだけ保存し、重複Closeでは上書きしない                                                    | keep          | fieldは同じlifecycle owner内のstate付随診断値で、`beginCloseLocked`の既存linearization commentと型・名前から入力/更新/副作用が局所的に読めるため個別逐語commentを省略 | testsが最初のreasonとclosed stateを同じlockで読むこと                 |
| `internal/rtc/*_test.go`    | attempt 2 coverage files                        | test / fixture              | production comment規約の対象外                                                  | test-only helperにproduction contractを誤って持たせていないか             | fake clock、blocking closer、actual Pion objectは外部I/Oを行わずevent/cleanup順を観測する                                 | keep          | test / fixtureのみでproduction codeではないためproduction comment audit対象外。非自明なWaitGroup代替だけ局所commentを追加                                             | acceptance directoryを変更していないこと                              |

### 残リスク

- process-lifetime tombstoneは現在のPoC契約として無制限に保持する。bounded retry/revision契約と合わせた
  evictionは後続signaling taskの責務であり、本attemptでは暗黙のTTLを導入していない。
- PCM resample/SubmitPCM、ICE restart、metrics、production compose統合は引き続き後続Phase 3の範囲である。
