# Pion Phase 3の可観測性とprocess hardeningを実装する

## 背景 / 目的

媒体、signaling、Frontend ICE restartの統合後にGate 3を機械判定できるよう、Pion processへ
status/health/metrics、panic境界、startup validation、graceful drainを追加する。

attempt 1から3の実装は専用ブランチ
`codex/task-260802032922-pion-phase-3-observability-gate-3` にcommit済みである。再実装では同ブランチを
再利用し、既存の可観測性実装を維持したまま、`eval.md` attempt 3のstructured-log違反と本改訂で
固定した契約との差分を解消する。機能を別タスクへ分割して既存commitを切り直すことはしない。

## 完了条件（受け入れ条件）

- [ ] `GET /api/v1/RTCSignalingServer/statuses` は
      `{sessions, session_limit, ready, draining}` の4 fieldだけをJSONで返し、非GETは405を返す。
      Python版のstate-changing cleanup GET endpointはPion版へ追加しない。
- [ ] `GET /health/live` はHTTP event loopがrequestを処理できる間200を返す。
      `GET /health/ready` はprocess phaseが`ready`のときだけ200、`starting`または`draining`では503を返す。
      両endpointの非GETは405である。下流Python serviceの一時障害はprocess phaseを変更しない。
- [ ] `GET /metrics` は専用Prometheus registryのtext expositionを返し、下記20 familyの名前、型、
      unit、label集合、bucket、event ownershipが固定schemaと一致する。
- [ ] metric label値は有限enumへ正規化し、session ID、SDP、ICE candidate、chat、audio、telop、
      mora、Offer request ID/revision、previous session IDを使わない。default global registryへ登録しない。
- [ ] Pion processの通常structured log attributeは、`slog`標準fieldを除いて
      `session_id`、`reason`、`stage`、`count`だけを使う。payload、raw error、address/path、
      signal名、Offer identityを出力しない。
- [ ] session-owned goroutine/callback panicは当該sessionのclose-onceへ`reason=panic`で収束し、
      process-owned worker panicはそのworkerのwaiter解放とprocess shutdownを妨げない。
      HTTP handler panicはpartial responseを破棄して500を1回返し、既知sessionのmutation panicでは
      そのsessionをcloseする。
- [ ] startupは下記の列挙済み設定と依存だけをlistener公開前に検証する。固定compile-time timeout、
      queue capacity、backpressure thresholdを新たなruntime設定にはしない。
- [ ] shutdown開始はprocess phaseを`draining`へ単調遷移させ、initial Offer admissionを停止してから
      HTTP acceptを止め、OfferRegistryとactive sessionをprocess全体で最大5秒の共通deadline内にjoinする。
- [ ] RTCPはcompound datagram内のpacketを分類し、RR report blockからloss/RTT sampleを生成する。
      malformed/unknown feedbackだけではsessionを閉じず、予期しないRTP/RTCP read終了は
      `media_read_error`でcloseしmetricへ反映する。
- [ ] 変更production codeのcomment auditを所定9列で記録し、metric meaning/cardinality、
      process phase/admission、panic限界、drain順序、privacyを局所的に理解できるコメントへ同期する。
- [ ] `documents/design/contracts/frontend-rtc.md` と
      `documents/migration/pion/rollout-and-operations.md` を公開挙動と一致させる。

## 設計判断（着手前に確定済み）

### Process phaseとinitial Offer admission

- `internal/processstate/state.go` にprocess-wide `State`を置く。内部値は
  `starting=0`、`ready=1`、`draining=2`の単一atomic値とし、複数boolによる矛盾snapshotを作らない。
- `MarkReady`は`starting`から`ready`だけを許可する。`BeginDrain`は`draining`へ単調遷移し、
  以後`ready`へ戻さない。`Snapshot`はstatuses/healthが同一phaseから`ready`と`draining`を算出できる
  immutable valueを返す。
- `cmd/pion-poc/runWithBoundaries`は`State`をManager/Serverより先に作り、同じpointerを
  `rtc.ManagerConfig`と`signaling.Options`へ注入する。`serve`はhandler/server構築完了後、
  `ListenAndServe`を開始する直前に`MarkReady`する。
- `internal/rtc/manager.go`の`reserve`をinitial Offer admissionの正本とする。Manager mutex内で
  `State`が`ready`かを確認してからreservationを増やし、非readyなら`ErrProcessDraining`を返す。
  `BeginDrain`とのatomic read/write順がlinearization pointであり、先にreservationを取得したCreateだけを
  admission済みとして完了可能にする。
- `internal/signaling/http.go`も`session_id`省略requestをdecodeした後、OfferRegistryへ渡す前にphaseを確認し、
  drainingなら早期503を返す。ただし競合時の最終保証はManager `reserve`で行い、
  `ErrProcessDraining`も503へ変換する。update Offerとcandidateはdrain中も既存sessionに対して処理できる。
  initial Offer retryも`session_id`がないためdrain中は503とする。

### Health、status、shutdown

- `internal/signaling/http.go`の既存`Server.Handler`へstatuses、live、ready、metricsをAPI/static routingより
  優先して登録する。statusesの`session_limit`は`SessionService.Limit()`から取得し、optional type assertionや
  `0` fallbackを使わない。
- shutdownの5秒はsession単体ではなくprocess drain全体の上限である。`serve`は1つのcontextを作り、
  `BeginDrain`、`http.Server.Shutdown`、`cancelProcess`、`OfferRegistry.Wait`、`Manager.CloseAll`の順で呼ぶ。
  前段がerrorまたはdeadlineになっても後段cleanupを必ず呼び、`errors.Join`したerrorをmainへ返す。
- `BeginDrain`を`Server.Shutdown`より先に呼ぶため、既にdispatch済みでも未admitのinitial Offerは503になる。
  deadline消費後も`cancelProcess`、`Wait`、`CloseAll`は同じ期限切れcontextで呼び、未joinを正常終了にしない。
- livenessはlistenerがrequestを処理できること自体を根拠にし、下流probeを行わない。readinessは
  process phaseだけを根拠にし、Consulや個別pipeline serviceのavailabilityを混ぜない。

### Startup validation

listener前に検証する対象を次に限定する。

- `internal/config/config.go`: HTTP listen address、Frontend directory、optional STUN URL、
  `GatherTimeout > 0`、`1 <= MaxSessions <= 100`、
  `1 <= OfferCacheCapacity <= 1000`、`30s <= OfferCacheTTL <= 2m`、FFmpeg executable path。
- `cmd/pion-poc/main.go`: FFmpeg version probe、pipeline factory、Manager、OfferRegistryのconstructor。
- pre-connect、media-readiness、disconnect grace、ICE restart、close timeout、pipeline/DataChannel queue、
  backpressure thresholdは各packageのcompile-time定数またはconstructor invariantを維持する。
  本タスクではflag/env化せず、既存unit testで正値とownershipを検証する。

### Prometheus registry

`internal/observability`に`Registry`と型付き`Recorder` interfaceを置き、
`github.com/prometheus/client_golang`を固定依存として使う。Recorderは下記event methodだけを公開し、
arbitrary metric/label APIを公開しない。

`SessionCreated`、`SessionClosed`、`SignalingRequest`、`ICETransition`、`Deadline`、`AudioFrame`、
`RTPDrop`、`RTCPFeedback`、`RTCPQuality`、`PacingLag`、`PacingAbort`、`CodecError`、
`PipelineReconnect`、`QueueDepthDelta`、`QueueOverflow`、`DataChannelError`、`CloseDuration`

全counterは該当eventで1増やす。active gaugeはsession registryへの公開/最終削除、
queue gaugeはenqueueによるownership取得/dequeue・drop・closeによる解放で増減し、close後0へ戻す。

| name                                        | type      | labels / buckets                                                                     |
| ------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `sincro_rtc_sessions_created_total`         | counter   | なし                                                                                 |
| `sincro_rtc_sessions_active`                | gauge     | なし                                                                                 |
| `sincro_rtc_sessions_closed_total`          | counter   | `outcome=closed,failed`; `reason`はclose reason enum                                 |
| `sincro_rtc_signaling_requests_total`       | counter   | `endpoint=config,offer,candidate,statuses`; `status_class=2xx,4xx,5xx`               |
| `sincro_rtc_signaling_duration_seconds`     | histogram | `endpoint`; buckets `.005,.01,.025,.05,.1,.25,.5,1,2.5,5`                            |
| `sincro_rtc_ice_transitions_total`          | counter   | `from`,`to`はPion ICEConnectionState enum                                            |
| `sincro_rtc_deadlines_total`                | counter   | `stage=gather,pre_connect,media_readiness,disconnect_grace,restart,close`            |
| `sincro_rtc_audio_frames_total`             | counter   | `direction=in,out`; `outcome=accepted,sent,dropped`                                  |
| `sincro_rtc_rtp_drops_total`                | counter   | `reason=duplicate,late,missing,reorder_flush`                                        |
| `sincro_rtc_rtcp_feedback_total`            | counter   | `type=sr,rr,nack,other`                                                              |
| `sincro_rtc_rtcp_loss_ratio`                | histogram | buckets `0,.001,.01,.05,.1,.25,.5,1`                                                 |
| `sincro_rtc_rtcp_rtt_seconds`               | histogram | buckets `.001,.005,.01,.025,.05,.1,.25,.5,1,2.5,5`                                   |
| `sincro_rtc_pacing_lag_seconds`             | histogram | buckets `.001,.005,.01,.02,.05,.1,.25,.5,1`                                          |
| `sincro_rtc_pacing_aborts_total`            | counter   | `reason=lag,generation,codec`                                                        |
| `sincro_rtc_codec_errors_total`             | counter   | `direction=decode_in,decode_synth,encode_out`                                        |
| `sincro_rtc_pipeline_reconnects_total`      | counter   | `service=extractor,recognizer,processor,synthesizer`; `result=start,success,failure` |
| `sincro_rtc_queue_depth`                    | gauge     | `queue=input,speech,text,telop`                                                      |
| `sincro_rtc_queue_overflows_total`          | counter   | `queue=input,speech,text,telop`; `action=drop_oldest,reject_close`                   |
| `sincro_rtc_datachannel_send_errors_total`  | counter   | `channel=text,telop`                                                                 |
| `sincro_rtc_session_close_duration_seconds` | histogram | `outcome=success,timeout`; buckets `.005,.01,.025,.05,.1,.25,.5,1,2.5,5`             |

close reason labelは次の有限集合へ正規化する。

`normal,process_shutdown,offer_failed,pre_connect_timeout,media_readiness_timeout,duplicate_media,`
`pipeline_start_error,codec_error,media_read_error,media_write_error,invalid_data_channel,`
`data_channel_error,output_backpressure,ice_failed,ice_disconnected_timeout,restart_timeout,panic,unknown`

### RTCP metric semantics

- `RTPSender.Read`の1 datagramを`rtcp.Unmarshal`し、compound内の各concrete packetにつきfeedback counterを
  1増やす。`SenderReport=sr`、`ReceiverReport=rr`、`TransportLayerNack=nack`、その他は`other`である。
  NACKはlost pair展開数ではなくfeedback packet数を数える。
- unmarshal不能datagramは`other`を1増やして読み続ける。unknown packet、LSR欠損、不正quality sampleを
  session close理由にしない。
- loss ratioは各ReceiverReportの各report blockにつき`FractionLost / 256`を1 sample記録する。
  cumulative lossは使用しない。
- RTTは各report blockの`LastSenderReport != 0`だけを対象に、RFC 3550 compact NTPの
  `int32(A - LSR - DLSR) / 65536`秒を使う。signed deltaが負ならsampleを捨てる。
  32 bit wrapはsubtraction後のsigned deltaで扱い、wall clock durationやcumulative delayを代用しない。

### Panic boundary

- `internal/rtc/safe.go`の`Session.Go` / reserved variantはsession WaitGroup ownershipを保持し、
  `Session.SafeCallback`はPion/timer callbackを同じrecoverへ接続する。panic値やraw errorはlogへ出さず、
  `session_id`、有限`stage`、`reason=panic`だけを記録して`Session.Close("panic")`を呼ぶ。
- session-owned inventoryはRTCP reader、inbound processor、outbound clock/generation/text/synth worker、
  pipeline Start、connection/ICE/track/DataChannel/open callback、DataChannel buffered-low/close/backpressure
  callback、pre-connect/media-readiness/disconnect-grace/restart deadline、cleanup/resource closer、
  Manager `OnClosed` callbackである。各入口はwrapperまたは同等の局所recoverを持つ。
- pipeline Coordinator/clientのread/ping/finalize/reset/consumer workerはpayload-free panic eventを
  Coordinatorへ通知し、WaitGroupを必ず解放する。OfferRegistryのowner/sweeper/wait helperはprocess-owned
  wrapperを通し、entry確定、全waiter解放、retry可能化、shutdown joinを保証する。
- `SessionService`へ`CloseSession(sessionID, reason)`を明示的に追加し、`rtc.Manager`が実装する。
  update Offer/candidate handlerはsession ID decode後のmutation全体を`withSessionMutation`で囲み、
  panic時は`CloseSession(id,"panic")`後にrepanicしてouter HTTP recoverへ渡す。optional type assertionは使わない。
- initial Createは`rtc.Manager.Create`のnamed return/deferがreservation、Coordinator、作成済みSessionを
  ownership段階に応じて解放し、`ErrSessionPanic`へ変換する。OfferRegistryは同errorをcacheせずentryを削除し、
  全waiterへ失敗を返す。HTTP middlewareはinitial session IDを推測しない。
- HTTP recoverは有限responseをbufferし、panic時にpartial header/status/bodyを破棄してfresh 500を返す。
  外側のsignaling observerは確定した500 count/latencyをexactly once記録する。streaming、
  `http.Flusher`、`http.Hijacker`、runtime fatal、cgo crash、third-party library内部goroutineは非対象である。

### Privacyとstructured log

- 許容するapplication attribute keyは`session_id`、`reason`、`stage`、`count`だけである。
  `time`、`level`、`msg`、handler設定時の`source`は`slog`標準fieldとして許容する。
- process lifecycle logは次へ正規化する。
    - listener開始: `stage=listener_ready`, `count=<goroutine count>`
    - signal受信: `reason=process_shutdown`
    - shutdown完了: `stage=shutdown_complete`, `count=<active session count>`
- address、Frontend path、signal名、final goroutine countは通常logから削除する。診断上必要になった場合も
  本タスクでallow-listを拡張せず、別のprivacy review済みタスクで契約変更する。
- captured `slog.Handler` testはPion processのproduction logger callを通るstartup/shutdown、
  signaling、OfferRegistry、RTC、pipeline、DataChannel、media failureを発火し、全recordのapplication keyが
  allow-listの部分集合であることを検査する。SDP、candidate、chat/audio/telop/mora、
  Offer identityのmarkerがlog valueとPrometheus expositionの双方にないことも検査する。

## スコープ境界

- 本タスク: Pion process内のoperational endpoint、固定20 metric、RTCP quality、structured-log privacy、
  first-party panic containment、列挙済みstartup validation、5秒process drain。
- 依存タスクが実装したOffer identity/revision/candidate、DataChannel queue/backpressure、outbound audio、
  ICE restartの契約は変更せず、event/metric/recover/privacyだけを接続する。
- スコープ外: external Prometheus/Grafana、alert rule、compose supervisor、NAT、soak、
  baseline比較、runtime設定追加、Python版endpoint変更、current designのPythonからPionへの切替。

既存implementation branchに相互依存するproduction変更とtestがcommit済みであり、再実装の残差が
process lifecycle logと契約明確化に限定されるため、別タスクへの分割はしない。

## 現行コード整合（main checkout基準）

- `internal/signaling/http.go:37-42,81-92`は`SessionService`とOfferRegistryを持つ3 endpoint Handlerであり、
  operational endpoint、process state、metrics、明示的`CloseSession`を持たない。
- `cmd/pion-poc/main.go:40-106`はFrontend dir、FFmpeg path/version、gather timeout、
  session/cache boundsをlistener前に検証済みである。新規作業はprocess state/registry注入である。
- `cmd/pion-poc/main.go:147-205`はprocess cancel、HTTP shutdown、OfferRegistry join、CloseAllを
  1つの5秒contextで行う。新規作業はdraining先行と、error時も後段を必ず呼ぶ順序の固定である。
- `internal/rtc/manager.go:113-186`はreservationだけをdefer解放し、partial resource panicを回収しない。
  `internal/rtc/manager_revision.go:12-76`はprivate lookup後にupdate/candidateを実行する。
- `internal/rtc/media.go:38-52`のconnected後RTCP drainはbytesを読むだけで分類しない。
- `documents/migration/pion/validation-plan.md:220-239`のmetric/privacy要件と
  `documents/migration/pion/target-architecture.md:266-279`のpanic/process modelを正本として維持する。

## テスト

- endpoint testでstatuses/health/metricsのmethod、status、Content-Type、JSON field、Prometheus schemaを
  exactに比較する。starting/ready/drainingの全phaseと下流一時障害非連動を検査する。
- admission race testで`BeginDrain`と100並行initial Createを競合させ、drain linearization後の
  reservationが0件、既存update/candidateが継続可能であることを検査する。
- shutdown testはactive session 0/1/100、HTTP/Offer/Session各段のerror/timeoutをfake clock/seamで作り、
  呼出順、全段実行、process全体5秒、joined error、最終active 0またはtimeoutを検査する。
- startup testは列挙したconfig境界のmin/max/範囲外、Frontend/FFmpeg欠損、FFmpeg probe失敗、
  constructor失敗でlistener boundary未到達を検査する。
- RTCP testはcompound SR+RR+NACK+unknown、複数report block、malformed packet、LSR 0、
  compact-NTP wrap、negative delta、unexpected read終了を固定時刻で検査する。
- panic injectionは上記session/process inventoryの各stageを1対1で発火し、close-once、waiter解放、
  HTTP 500、partial response破棄、process継続を検査する。
- structured-log allow-listとpayload marker testをprocess lifecycleを含むproduction logger surfaceへ適用する。
- `go test -race ./internal/... ./cmd/pion-poc`、`go vet ./...`、`go mod tidy -diff`、
  `npm run tasks:check`、`npm run gate`を通す。`go.mod`と`go.sum`はPrometheus依存と同じcommitへ含める。

## ソースコードコメント受け入れ条件

- 変更production codeと、その理解に必要な直接のhelper/state/event/lifecycle/data transformationを
  change comprehension surfaceとして全件auditする。`impl.md`は`path`、`symbol/block/decision/flow`、
  `kind`、`current comment`、`reader question`、`required reader knowledge`、
  `decision (keep/rewrite/delete/add)`、`action/omission reason`、`reviewer note`の9列を持つ。
- auditには`cmd/pion-poc/main.go`のprocess lifecycle structured logをprivacy surfaceとして必ず含める。
  process phase/admission linearization、metric event ownership/cardinality、RTCP sample変換、panic ownership、
  response commit、drain deadline、log allow-listを対象固有のreader questionとrequired knowledgeで照合する。
- public API/boundaryは目的、入力、observable output、失敗、副作用、非対象を必要に応じて説明する。
  orchestration/state transition/event source/data transformationは処理段階、state change、前後関係、
  後段へ委ねる責務を局所的に理解できる説明へrewrite/addする。逐語説明は追加しない。
- stale/弱いcommentはrewrite/deleteする。省略は`documents/rules/source-comments.md`の具体的条件を
  auditへ書き、`private`、`短い`、`型がある`、`testを読める`、`既存も無comment`を単独理由にしない。
  TODOは理由、削除条件、canonical task ID、期限または判断基準を必須とする。
- evaluatorは変更対象とsurfaceを全件照合し、未照合範囲と残リスクを`eval.md`へ記録する。
  逐語説明、確認先だけ、失敗modeのないheuristic説明、内部flowの理解不能、stale comment、
  定型的な省略理由が1件でもあればFAILとする。

## ドキュメント同期の要否

要。`documents/design/contracts/frontend-rtc.md`へPion版statusesの4 field、405、cleanup非実装を同期し、
`documents/migration/pion/rollout-and-operations.md`へhealth phase、固定20 metricのexact schema/semantics、
privacy allow-list、panic非対象、5秒drain順序を同期する。
Gate 3前のため`documents/design/backend/services/sincro-rtc.md`はPython正本のまま変更しない。
