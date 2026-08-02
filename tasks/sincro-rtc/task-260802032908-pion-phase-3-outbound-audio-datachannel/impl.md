# Implementation Log: task-260802032908-pion-phase-3-outbound-audio-datachannel

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### Completion Summary

- Gate 2の合成結果を、browser入力と独立した20 ms outbound clock、bounded speech queue、連続Opus encoderへ接続した。
- `text_ch` / `telop_ch`を実payload dispatcherへ置換し、queue overflow、64 KiB、buffered amount、send failureのchannel別policyを実装した。
- `GenerationChanges`をCoordinatorのstable streamとして追加し、Sessionの単一適用点からaudio/text/telopを一括purgeする設計にした。
- pre-Answer track登録、connected後の起動予約、DataChannel identity/readiness、全resource join後のclosed公開を維持した。
- 公開挙動を`documents/design/contracts/frontend-rtc.md`とPoC READMEへ同期した。`documents/design/index.md`は既存導線内の契約更新だけなので変更不要と判断した。

### 設計判断とreview.md申し送り

- `GenerationChanges()`はbroadcast channelではないため、Sessionの`generationLoop`だけが受信する。text/synth consumerはenvelope generationを同じ`outboundMu`適用点へ渡す。newerを最初に観測した経路が、同じcritical sectionでOutputProcessorとDataChannelDispatcherをpurgeする。
- synth decodeはgeneration適用後にlock外で行い、完了時に同じgenerationを再確認する。decode中にresetした旧結果はqueueへ再混入せず、旧decode errorも新generationのsessionを閉じない。
- OutputProcessorのpurgeとtrack write、dispatcherのpurgeとDataChannel sendには各send barrierを置いた。dispatcher backpressure待機中の旧eventはgeneration broadcast channelで中断し、timeoutをsession errorとして誤報しない。
- speech queueは未送信sampleを合計し、既存itemをevictしない。8発話または5,760,000 sampleを追加後に超えるincomingだけを`ErrSpeechQueueFull`にする。
- telopはqueue itemにdecode前messageとdecode後PCM/moraをまとめ、frame開始sampleを唯一の選択tickにした。mora境界がframe内にある場合は次frameで切り替え、mora indexごとの初回送信だけ`new_text=true`にする。
- process-wide SynthDecoderは引き続き非所有参照であり、Session cleanupのcloserへ加えていない。
- 仕様からの逸脱はない。

### Verification

- `go test ./...`（Pion loopback integrationを含む、sandbox外）: PASS
- `go test -race ./internal/media/... ./internal/rtc ./internal/pipeline`（sandbox外）: PASS
- `go vet ./...`: PASS
- `gofmt -l .`: 出力なし
- focused tests:
    - speech queue件数/sample境界、telop sample fixture、purge、50 frame real-time cadence、mono encode/stereo capability decode: PASS
    - text/telop overflow、JSON schema/64 KiB、buffered high/low/timeout、send failure/channel close、generation purge race: PASS
    - Coordinator initial/reset generation通知とclose ownership: PASS
- `npm run gate`: PASS（lint / build / test）

### Not Run

- 実browserを使う手動Chrome smoke: 自動local Pion pair、50 frame cadence、JSON fixtureで受け入れ条件を固定したため未実行。実device/browser固有のjitter buffer挙動はPhase 3後の手動smokeに残る。

### ドキュメント同期

- `documents/design/contracts/frontend-rtc.md`: 64 KiB、queue policy、1 MiB/256 KiB/5秒backpressure、silence/20 ms pacing、250 ms abort、telop nil/empty・message・timestamp・length・per-frame・new_text・generation purgeを同期した。
- `sincromisor-server/sincro-rtc-pion-poc/README.md`: test tone/smoke JSONの説明をGate 2実出力と確認手順へ更新した。
- schema field/pathは既存のままで生成物/public barrelはないため、再生成対象はない。

### Change comprehension surface comment audit

| path                                   | symbol / block / decision / flow                     | kind                            | current comment                   | reader question                                                   | required reader knowledge                                                          | decision      | action / omission reason                                                                                              | reviewer note                                                 |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------- | --------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `internal/media/output_contract.go`    | `TelopPayload`, `SampleWriter`, `TelopSink`          | API / boundary / data           | 新規                              | wire値の単位、nil変換、audioとの順序は何か                        | timestamp/lengthのsample基準、sinkはtrack write直前                                | add           | exported境界へwire変換済み状態と前後関係をdoc commentで追加                                                           | JSON tagとFrontend契約、sink呼出順を照合                      |
| `internal/media/output_encoder.go`     | `FrameEncoder`, `NewFrameEncoder`, `Encode`, `Close` | API / lifecycle / codec         | 新規                              | codec stateとnative resourceを誰が所有し、入力単位は何か          | 48 kHz mono/960 sample、同一state、mutex、idempotent close                         | add           | API contractとnative lifecycleを各symbolへ追加                                                                        | mono PCMがstereo SDP capabilityでdecode可能なtestを照合       |
| `internal/media/output.go`             | queue limits / `ErrSpeechQueueFull`                  | constraint / fallback           | 新規                              | 8件/120秒境界で何をevict/rejectするか                             | exact limitは受理、超過incomingだけ拒否、sample単位                                | add           | domain constantとEnqueue docへ境界・失敗・非evictionを追加                                                            | limit-1/limit/limit+1 testを照合                              |
| `internal/media/output.go`             | `OutputProcessor` ownership / `Run`                  | lifecycle / flow / clock        | 新規                              | clockは何に依存し、silence/lag/終了をどう扱うか                   | session absolute deadline、20 ms、silence drop、250 ms speech abort、context owner | add           | processor/Run docとlag block近接commentで全体flowを説明                                                               | browser入力停止50 frame test、lag metric/logを照合            |
| `internal/media/output.go`             | `Purge`, `sendMu`, `writeFrame`                      | lifecycle / generation barrier  | 新規                              | purge観測後に旧audio/telopが送られ得るか                          | purgeとencode/telop/track writeのlinearization、再生済みは非対象                   | add           | Purge/processor docとsend barrier構造を追加                                                                           | generation通知だけのpurge testを照合                          |
| `internal/media/output.go`             | `nextFrame` mora selection                           | data transformation / flow      | 新規                              | frame内境界、activeなし、nil/empty、new_textをどう決めるか        | frame開始sample、inclusive/exclusive、mora index初回、最終padding                  | add           | private flowにも段階・表現・後段責務を近接commentで追加                                                               | shared fixtureの全field/cadenceを照合                         |
| `internal/rtc/data_channel.go`         | `DataChannelDispatcher` / attach / close             | lifecycle / queue               | 新規                              | worker/channelのowner、開始・終了、channel object close責務は誰か | open identity通過後attach、dispatcherはworkerのみ所有、PCがchannel所有             | add           | type/constructor/Attach/Closeへownerとjoin条件を追加                                                                  | Close raceとOnClose session errorを照合                       |
| `internal/rtc/data_channel.go`         | buffered amount high/low wait                        | constraint / fallback           | 新規                              | なぜ1 MiBで止め256 KiBまで待ち、reset時はどうなるか               | hysteresis、5秒timeout、spurious callback再検査、generation wait中断               | add           | `waitWritable`へthreshold、failure、generation関係を追加                                                              | high/low/timeout/purge中断testを照合                          |
| `internal/rtc/data_channel_payload.go` | chat conversion / telop enqueue / JSON size          | boundary / data / fallback      | 新規                              | pipeline DTOをwireへどう変換し、nil/zeroとoverflowをどう扱うか    | snake_case、omitempty nil、zero保持、64 KiB、text reject/telop oldest drop         | add           | Enqueue API docと専用schema型を追加。marshal helperは名前/型/直前APIから位置・失敗が局所的に読めるため個別comment省略 | JSON fixtureとqueue policyを照合                              |
| `internal/rtc/data_channel_session.go` | `handleDataChannel`                                  | event source / lifecycle        | smoke送信を説明する既存comment    | 固定payload廃止後もidentity/readinessを迂回しないか               | attribute、same-object register、OnOpen identity、dispatcherはpipelineを開始しない | rewrite       | stale smoke説明を削除し、dispatcher接続までのevent flowへ更新                                                         | invalid/duplicate callback既存testを照合                      |
| `internal/pipeline/coordinator.go`     | `GenerationChanges` / close                          | API / lifecycle                 | text/synthだけのclose説明         | 通知はbroadcastか、誰がcloseし、初回/resetをいつ出すか            | capacity 1 coalesce、single consumer、全producer join後close                       | add / rewrite | exported API docを追加しCloseのchannel一覧を同期                                                                      | receiver競合がないSession構成とclose testを照合               |
| `internal/pipeline/connect.go`         | initial generation publication                       | state transition / event source | running activationのみ説明        | 初回outputより前にgenerationをどう確定するか                      | producer開始前、output barrier内通知、当該時点ではreset producerなし               | add           | 非自明なlock順例外とproducer開始順をblock commentで説明                                                               | initial notification testを照合                               |
| `internal/pipeline/reset.go`           | advance/drain/coalesced notify                       | generation barrier / flow       | advance/drainは説明済み、通知なし | reset outputがなくてもconsumer purgeをどう起動するか              | outputMu内でadvance→drain→notify、capacity 1最新置換                               | add           | `notifyGeneration` docとreset blockへ通知を追加                                                                       | next-generation outputなしrace testを照合                     |
| `internal/rtc/outbound.go`             | four outbound loops / single generation consumer     | orchestration / flow            | 新規                              | どのgoroutineがどのchannelを受け、errorをどこへ返すか             | GenerationChangesは1 receiver、text/synthはenvelope、decode前後再検査、Close集約   | add           | fileの入口flowと各loopの命名で段階を分離し、start/applyへnavigation/lifecycle commentを追加                           | channel close、decode/queue error経路を照合                   |
| `internal/rtc/outbound.go`             | `applyGeneration`, `applyGenerationError`            | state transition / lock         | 新規                              | 古い通知/envelopeがpurge後に再混入しない保証は何か                | monotonic state、single lock、newer時audio/text/telop一括purge、older拒否          | add           | 単一適用点のinvariantと副作用をdoc commentで追加                                                                      | notification-first/envelope-first testを照合                  |
| `internal/rtc/readiness.go`            | `transportReady` outbound reservation                | lifecycle / event source        | tone/RTCPの2 goroutine説明        | connected重複やClose競合でoutput consumerが二重起動しないか       | lifecycle mutex内で5 goroutine予約、lock外開始、gather timeoutは未起動             | rewrite       | tone記述をclock/3 consumer/RTCPへ更新                                                                                 | duplicate connected、gather timeout、join既存testを照合       |
| `internal/rtc/media.go`                | `installOutboundTrack` / RTCP                        | boundary / lifecycle            | test tone track説明               | 実outputへ替えてもpre-Answer/connected後契約は維持されるか        | trackはpre-Answer、drain/outputはconnected後、gather timeout非起動                 | rewrite       | stale test-tone記述とtrack IDをproduction outputへ更新                                                                | negotiation/timeout既存testを照合                             |
| `internal/rtc/session.go`              | construction / owned closers / cleanup               | lifecycle / ownership           | 3 resourceとtone codec説明        | 新output/dispatcher/encoderを失敗・close全経路で誰が回収するか    | setup rollback、5 owned closer並行close、wg join後公開、decoder非所有              | rewrite / add | Session field、closer、newSession、Close/cleanup commentを現resource graphへ同期                                      | process-wide decoderがcloserにないこと、clean tree raceを照合 |

### 残リスク

- Opus packetの実browser jitter buffer上の聴感品質、250 ms abort閾値の運用妥当性は自動testでは評価していない。
- DataChannel metricはprocess内counter snapshotと構造化logで観測可能だが、metrics公開endpointはタスクのスコープ外である。

### Finalization

- 実装commit: `fc45cb641ae2dadec7045814f64f237bae15fc50`
- clean commit SHAに対する`npm run gate`: PASS
- `npm run commit:check`: PASS（最初のsandbox内実行はGit subprocessの`EPERM`だったため、同じcommandをsandbox外で再実行）
- worktreeにroot/frontendの`node_modules`展開がなかったため、最初のgateは`biome: not found`で停止した。両lockfileに対して`npm ci`を実行後、同じgateを再実行してPASSした。
- 実装worktree: clean

## attempt 2

### 評価残課題への対応と設計判断

- `DataChannelDispatcher`のattach開始権、closed判定、`WaitGroup.Add`を同じmutex内へ集約した。Closeがclosedを確定した後はattach/enqueueをsentinel errorで拒否し、予約済みworkerだけをjoinする。
- Session cleanupは既存のresource並行closeを維持し、OutputProcessorとDataChannelDispatcherをclosed-aware ownerにした。cancelとtext受信、synth decode完了、generation適用が競合しても、owner close後にqueueを復活できない。
- OutputProcessorへ内部clock/timer/encoder/track seamと絶対sample位置を導入した。scheduler遅延はburstで埋め戻さず、250 msちょうどまではcurrent speechを1 packet送ってclockを再同期し、超過時はcurrent itemをabortして次itemをnowから20 ms後に開始する。
- local Pion pairはbrowser側をrecvonlyにし、入力trackを一切追加しない構成で検証した。実際に届くOpusをstereo capabilityでdecodeし、50発話frame、RTP timestampの960 sample増分、monoの左右同値、実時間cadenceを固定した。
- attempt 1の「Close raceを照合」「local Pion pairで50 frame cadenceを固定」は実際のassertion範囲を超えた記録だった。attempt 2では、下記に列挙したテスト名とassertionだけを検証結果の正本とする。
- 仕様からの逸脱はない。

### Verification

- `go test ./...`（local Pion pairを含む、sandbox外）: PASS
- `go test -race ./...`（sandbox外）: PASS
- `go vet ./...`: PASS
- `git diff --check`: PASS
- `npm run gate`: PASS（lint / build / test）
- 決定的clock/track/encoder:
    - `TestOutputAbsoluteClockSilenceCadenceAndExpiredDrop`: 20 ms absolute deadline、silence、期限切れ5 slot dropとsample位置を検証。
    - `TestOutputSpeechLagBoundaryAbortOrderAndNextCadence`: 250 ms境界受理、1 ns超過abort、次発話順序と20 ms後開始を検証。
    - `TestOutputTimestampWraparound`: 64 bit sample位置と32 bit RTP timestamp wrapを検証。
    - `TestOutputCodecAndTrackErrorsStopClockAndRejectPostCloseEnqueue`: codec/track error後のtimer停止とclose後enqueue拒否を検証。
- lifecycle / close race:
    - `TestDataChannelAttachAndCloseShareWorkerReservation`: attach優先・Close優先の双方でreservationとclosed判定を検証。
    - `TestSessionPublishesClosedOnlyAfterDispatcherWorkerJoin`: blocking send workerのjoin前にSession closedを公開しないことを検証。
    - `TestSessionOutputCloseRejectsConcurrentTextSynthAndGenerationActions`: text/synth/generation/owner Close競合後のqueue 0、worker 0を検証。
    - `TestSynthDecodeCompletionAfterOutputCloseCannotRestoreQueuedAudio`: blocking decode完了がowner Close後にaudio queueを復活させないことを検証。
- local transport:
    - `TestOutboundSpeechReachesReceiveOnlyBrowserAtMonoTwentyMillisecondCadence`: browser入力trackなしで50 Opus frameを実受信・decodeし、各RTP delta、mono左右同値、実時間cadenceを検証。
- 上記追加テスト群を`-race`指定でも実行しPASS。

### ドキュメント同期

- 公開WebRTC/DataChannel/音声挙動はattempt 1で`documents/design/contracts/frontend-rtc.md`とPoC READMEへ同期済みであり、attempt 2はその契約を変えずlifecycle保証と検証を補強した。
- 新しいclosed sentinel、fake clock/track/encoder seam、観測用queue/worker snapshotは`internal/`配下の実装・テスト境界で、Frontend wire schema、公開endpoint、設定、生成物、public barrelを変更しない。このため追加の設計文書・schema再生成は不要と判断した。

### Change comprehension surface comment audit

| path                                                      | symbol / block / decision / flow                 | kind                         | reader question / required knowledge                                      | decision       | action / omission reason                                                                            |
| --------------------------------------------------------- | ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `internal/rtc/data_channel.go`                            | attach / Close / worker reservation              | lifecycle / state transition | OnOpenとCloseのどちらがworker開始権を持ち、Wait開始後のAddを何が防ぐか    | add / rewrite  | closed判定、reservation、joinのlinearizationをClose近接commentとexported sentinelで明示した         |
| `internal/rtc/data_channel.go`, `data_channel_payload.go` | closed-aware enqueue / stats                     | boundary / queue ownership   | Close後にproducer完了がqueueを復活できるか、closed公開時に何を観測するか  | add            | attach/enqueue拒否とpayload非保持snapshotをAPI commentに同期した                                    |
| `internal/media/output.go`                                | closed state / Enqueue / Close / writeFrame      | lifecycle / queue ownership  | resource Closeとconsumer完了が競合した場合にaudio/moraが残るか            | rewrite / add  | send barrier内のclosed確定、queue破棄、post-close拒否をerrorとClose/Run flowへ反映した              |
| `internal/media/output.go`                                | absolute deadline lag branches / sample position | clock / fallback / data flow | silence期限切れ、閾値内遅延、250 ms超過でpacketと次deadlineをどう扱うか   | add            | burst回避、sample位置skip、abort後の次item再開理由をRun docと分岐近接commentへ追加した              |
| `internal/media/output_contract.go`                       | `OutputSample`, clock/timer/encoder seam         | boundary / data              | 64 bit位置、32 bit wrap、Pion durationとtest seamの責務差は何か           | add            | exported test/track境界とprivate seamへ単位・owner・目的を記録した                                  |
| `internal/rtc/media.go`                                   | `pionSampleWriter`                               | adapter / boundary           | logical clock付きsampleをPionのtimestamp生成へどう渡すか                  | add            | Duration駆動packetizerとの責務分担をadapter近接commentへ追加した                                    |
| `internal/rtc/outbound.go`, `session.go`                  | `handleSynthOutput`, decoder interface           | orchestration / lifecycle    | decode前後のgeneration/Close競合をどこで再検査し、decoderを誰が所有するか | add / rewrite  | handlerの失敗条件、closed sentinelのno-op化、非所有decoder seamを説明した                           |
| production変更全体                                        | stale comment / TODO                             | audit                        | attempt 1で過大だったjoin保証やtone説明が残っていないか                   | keep / rewrite | Close保証を実装と一致させ、既存のresource join commentは新race testで成立を確認した。新規TODOはない |

### 残リスク

- local Pion pairはRTP timestampとtest process内arrival timeを固定するが、実browser jitter buffer後の聴感品質は自動評価していない。
- 250 ms閾値の運用上の妥当性とDataChannel backpressure metricの外部公開は、元タスクどおりスコープ外である。

### Finalization

- attempt 2 commit: `aa4055130f4ce2d0ac5ba4bbda399584c5d95119`
- clean commit SHAに対する`npm run gate`: PASS
- `npm run commit:check`: PASS
- 実装worktree: clean

## attempt 3

### 評価残課題への対応と設計判断

- attempt 2までのdispatcher/session lifecycle修正は変更せず、唯一残ったlogical clockとproduction Pion packetizerの境界不一致を修正した。
- schedulerが送らずに進めた20 ms slotを`pendingDrops`へ累積し、次の成功frameの`media.Sample.PrevDroppedPackets`へ渡す。Pion v4.2.17はこの値についてsequence numberをskipし、`Duration * PrevDroppedPackets`だけpacketizer timestampもskipするため、remote側にもlogical sample clockと同じgapが現れる。
- `pionSampleWriter`は`OutputSample.MediaSample`をData/Durationだけへ再構築せず、そのまま`TrackLocalStaticSample.WriteSample`へ渡す。これによりdrop metadataをadapter境界で失わない。
- drop countはtrack write成功時だけ0へ戻す。連続skipとspeech abort中のno-writeは次の成功packetまで累積し、track error時は不完全なclock stateで送信を継続しない。
- Pion APIの`PrevDroppedPackets`は`uint16`なので、65,535 slotを超える単一の連続gapは誤ったtimestampで継続せずoutput errorとしてsession cleanupへ渡す。通常のscheduler drop、250 ms speech abortではこの境界に達しない。
- `PrevDroppedPackets`はPion仕様どおりtimestampとsequence numberの両方をskipする方針とした。drop後の次packetだけが`1 + drop数`単位進み、その後は960 timestamp tick / 1 sequence numberへ復帰する。
- 仕様からの逸脱はない。

### Verification

- `go test ./...`（production Pion RTP gap pairを含む、sandbox外）: PASS
- `go test -race ./...`（sandbox外）: PASS
- `go vet ./...`: PASS
- `git diff --check`: PASS
- dirty treeでの`npm run gate`: PASS（lint / build / test）
- `TestOutputAbsoluteClockSilenceCadenceAndExpiredDrop`: 5 slot dropがlogical sample位置と`PrevDroppedPackets=5`の双方へ現れることを検証。
- `TestOutputSpeechLagBoundaryAbortOrderAndNextCadence`: 250 ms境界送信と250 ms超過abort後の次発話に、それぞれ累積drop数12が渡ることを検証。
- `TestOutputTimestampWraparound`: 2 slot dropを含む64 bit sample位置と32 bit RTP timestamp wrap、drop metadataを検証。
- `TestOutputConsecutiveDropsAccumulateUntilSuccessfulWrite`: 2回のskipが5へ累積し、成功write後0へ復帰することと、`uint16`超過拒否を検証。
- `TestOutboundSchedulerDropCreatesProductionRTPClockGap`: deterministic clockとproduction `pionSampleWriter` / `TrackLocalStaticSample`をlocal Pion pairへ接続し、4 slot drop後の実RTP timestamp deltaが`5 * 960`、sequence deltaが5、その次が960 / 1へ復帰することをremote `ReadRTP`で検証。
- 上記drop / wrap / speech / local pairテスト群を`-race`指定でも実行しPASS。

### ドキュメント同期

- `documents/design/contracts/frontend-rtc.md`へ、dropした20 ms slotを次のRTP timestampとsequence numberのgapへ反映し、その後960 / 1 cadenceへ復帰する公開挙動を同期した。
- wire schema、endpoint、設定、生成物/public barrelの変更はなく、再生成対象はない。

### Change comprehension surface comment audit

| path                                         | symbol / block / decision / flow                                  | kind                          | reader question / required knowledge                                                   | decision       | action / omission reason                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `internal/media/output.go`                   | `pendingDrops`, lag branches, `skipSamplePositions`, `writeFrame` | clock / state / data flow     | 送らなかったslotをいつ累積・消費し、連続dropとtrack errorをどう扱うか                  | add / rewrite  | drop metadataは成功writeまで保持し、成功点だけで消費するinvariantと`uint16`失敗条件をtype/近接commentへ追加した        |
| `internal/media/output_contract.go`          | `OutputSample`, `OutputClock`, `OutputTimer`                      | boundary / API                | fake clockのlogical位置をproduction Pionへ何で渡し、timestamp/sequenceのどちらが飛ぶか | rewrite / add  | staleだったDurationだけの説明を削除し、`PrevDroppedPackets`の単位と両RTP fieldへの作用を記録した                       |
| `internal/rtc/media.go`                      | `pionSampleWriter.WriteSample`                                    | adapter / production boundary | adapterが保持すべきmetadataと、Pion packetizerへ委ねる処理は何か                       | rewrite        | attempt 2でstaleだった「Durationから同じ増分」説明を、通常960とdrop時skipの実契約へ置換した                            |
| `documents/design/contracts/frontend-rtc.md` | outbound scheduler drop                                           | public behavior               | receiverから見えるdropと復帰後cadenceは何か                                            | add            | timestamp / sequence gapと960 / 1復帰を契約正本へ同期した                                                              |
| production変更全体                           | stale comment / TODO                                              | audit                         | fake/production seam不一致を示す古い説明が残っていないか                               | rewrite / keep | evaluatorが指摘したstale adapter commentを更新し、lifecycle commentはattempt 2の成立済み保証を維持した。新規TODOはない |

### 残リスク

- `PrevDroppedPackets`の表現上限を超える約21.8分以上の単一scheduler停止はsession errorとなる。誤ったRTP clockで継続するより安全側の失敗とした。
- 実browser jitter buffer後の聴感品質は引き続き自動評価していない。

### Finalization

- attempt 3 commit: `20fe9cca6db242893fd45ebe367574dadf91c78d`
- clean commit SHAに対する`npm run gate`: PASS
- `npm run commit:check`: PASS
- 実装worktree: clean

## attempt 4

### 評価残課題への対応と設計判断

- attempt 3の独立評価で残ったspeech abort時のRTP clock off-by-oneだけを修正した。`lag / 20 ms`で数える完全に期限切れの12 slotに加え、abort分岐が`continue`してpacketを書かない現在deadlineの1 slotもlogical sample位置と`pendingDrops`へ加える。
- `250 ms + 1 ns`のlagでは次の成功sampleへ`PrevDroppedPackets=13`を渡す。Pion packetizerが現在packet分も進めるため、直前の成功packetからremote RTP timestamp/sequenceは14 frame分進み、その次のpacketから960 tick / sequence 1へ復帰する。
- queue、generation単一consumer、telop per-frame規則、DataChannel backpressure、Session lifecycle、process-wide decoder ownershipには変更を加えていない。
- 仕様からの逸脱はない。

### Verification

- 赤確認: `TestOutputSpeechLagBoundaryAbortOrderAndNextCadence`は修正前に`PrevDroppedPackets=12, want 13`でFAILした。
- `go test ./internal/media -run '^TestOutputSpeechLagBoundaryAbortOrderAndNextCadence$' -count=1`: PASS。
- `go test ./internal/rtc -run '^TestOutboundSpeechAbortCreatesProductionRTPClockGap$' -count=1`: PASS。sandbox内ではnetlink route取得が`operation not permitted`となるため、同じcommandをsandbox外で実行した。
- `go test -race ./internal/media/... ./internal/rtc ./internal/pipeline`: PASS。
- `go vet ./...`: PASS。
- `git diff --check`: PASS。
- `npm run tasks:check`: PASS（273 tasks）。
- `npm run tasks:index:check`: PASS（変更なし）。
- clean commit `0d8c11aeeab0f6bd5901206b0830c0b330a1fcc5`に対する`npm run gate`: PASS（lint / build / test）。
- `npm run commit:check`: PASS。

### ドキュメント同期

- `documents/design/contracts/frontend-rtc.md`はattempt 3で「送らなかった20 ms slotを次のRTP timestamp/sequence gapへ反映し、その後960 / 1 cadenceへ復帰する」と同期済みである。attempt 4は公開契約を変えず、speech abort経路をその正本へ適合させる修正なので追加差分は不要と判断した。
- wire schema、endpoint、設定、公開barrel、生成物に変更はなく、再生成対象もない。

### Change comprehension surface comment audit

| path                                                                        | symbol / block / decision / flow                      | kind                          | current comment                                                                | reader question                                                                    | required reader knowledge                                                                                              | decision | action / omission reason                                                                                             | reviewer note                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `internal/media/output.go`                                                  | `Run`のspeech lag abort分岐                           | clock / fallback / flow       | 期限切れsample位置だけ進めると説明し、現在deadlineのno-writeを数えていなかった | abort時に実際に送らないslot数と次のRTP gapはなぜ一致するか                         | `floor(lag/20 ms)`は完全に期限切れのslotだけで、`continue`により現在deadlineもpacket化されず追加の1 slotになる         | rewrite  | staleな近接commentを、期限切れslot、abort tick自身、次item再開、RTP gapの関係を局所的に説明する内容へ置換した        | `+1`を削るとfake clockの13 dropとproduction pairの14 frame deltaがともにFAILすることを照合 |
| `internal/media/output.go`                                                  | `skipSamplePositions` / `pendingDrops` / `writeFrame` | state / data / boundary       | 連続するno-write slotを成功writeまで累積しPion metadataへ渡す説明がある        | abort分岐から渡された13 slotはいつ消費され、次packetへ残らないか                   | helperはlogical sampleとpending countを同時に進め、`writeFrame`成功後だけpending countを0にする                        | keep     | 既存commentはattempt 4のcaller修正後も正確で、13 slot累積と次packetでの0復帰を説明するため変更不要                   | abort testとproduction pairのrecovery assertionを照合                                      |
| `internal/media/output_contract.go`                                         | `OutputSample.MediaSample.PrevDroppedPackets`         | API / unit / boundary         | drop数がtimestamp/sequence両方へ同じgapを反映すると説明済み                    | logical no-write countはPion境界でどの単位として観測されるか                       | 20 ms slot数をuint16 metadataで渡し、packetizerが現在packetに先立つgapとしてRTP clockへ反映する                        | keep     | 単位、observable output、adapter責務が既存doc commentで局所的に読め、今回public contract変更もないため維持           | speech abort後のremote RTP delta 14を照合                                                  |
| `internal/rtc/media.go`                                                     | `pionSampleWriter.WriteSample`                        | adapter / production boundary | metadataを保持してPionへ渡しtimestamp/sequenceをskipさせる説明済み             | processorの13 dropがproduction RTP packetまで失われず届くか                        | adapterは`MediaSample`を再構築せずそのまま渡し、packetizationはPionへ委ねる                                            | keep     | attempt 3で修正済みのcommentと実装は今回も正確で、production pairが実adapter経由のgapを固定するため変更不要          | `Timestamp delta=14*960`, `Sequence delta=14`, 次packet `960/1`を照合                      |
| `internal/media/output_clock_test.go`, `internal/rtc/outbound_pair_test.go` | abort boundaryとproduction pair fixture               | test / fixture                | test内にdeadlineと13 dropの関係を示す限定的なcommentがある                     | production codeのcomment audit対象か                                               | test/fixtureのみでありproduction API、lifecycle、boundaryのchange comprehension surfaceではない                        | keep     | production audit対象外。ただし誤った12 drop期待を13へ直し、絶対sample位置と実RTP gap/recoveryの回帰検証を追加した    | acceptanceが要求するfake/production両seamの数値を照合                                      |
| production変更全体                                                          | stale comment / TODO                                  | audit                         | attempt 3までのclock/lifecycle comment群がある                                 | off-by-one修正により他のclock、queue、generation、telop、lifecycle説明が古くなるか | 修正はspeech abort branchのno-write accountingだけで、他の所有権、queue境界、generation適用点、telop cadenceを変えない | keep     | abort近接commentだけrewriteし、直接surfaceの他commentは成立を再確認した。新規TODO、削除対象、未解消stale commentなし | evaluatorは変更3 fileと上記直接surfaceを照合                                               |

### 残リスク

- local Pion pairはRTP packetizerまでのtimestamp/sequence gapとrecoveryを固定するが、実browser jitter buffer後の聴感品質は自動評価していない。
- 250 ms abort閾値の運用妥当性は元タスクどおりスコープ外である。

### Finalization

- attempt 4 commit: `0d8c11aeeab0f6bd5901206b0830c0b330a1fcc5`
- clean commit SHAに対する`npm run gate`: PASS
- `npm run commit:check`: PASS
- 実装worktree: clean
