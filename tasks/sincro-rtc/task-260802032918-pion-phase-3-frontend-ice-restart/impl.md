# Implementation Log: task-260802032918-pion-phase-3-frontend-ice-restart

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断・申し送り対応

- backendと同じ10秒の`disconnected` graceを独立timer ownerへ分離した。復帰時cancel、連続eventの単一timer、`failed`の即時recoveryをunit testで固定した。
- retryは「初回+retry 3回」の最大4 HTTP実行と解釈し、500ms/1秒/2秒capのfull jitter、`Retry-After`優先、30秒総期限、Offer 10秒/Candidate 5秒のper-attempt timeoutを単一transportへ集約した。serialized bodyはloop外で1回だけ生成する。
- typed HTTP errorは`initial-offer|update-offer|candidate`を保持する。update/candidateの404/410だけ旧session付きbundle replacementへ送り、initial 410、409、その他terminal statusはgeneration closeとした。
- `RTCTalkClient`はbundle generation、state machine、candidate flightのatomicなfailure境界を所有する。stats/diagnosticsとgrace timerは分離したが、残るorchestrationをさらに別classへ分けるとsession/revision/candidateの一貫したclose判断が分散するため、structure guardの理由付き例外を採用した。
- shared Go signaling Answer fixtureをFrontend parser testから直接読み、`offer_revision`のschema driftを検出する。

### 仕様からの逸脱・詰まり・残リスク

- 仕様からの意図的逸脱はない。
- browser実PeerConnectionを用いるPhase 4 matrixはscope外。今回の検証はfake clock、fake fetch、state machine、shared fixtureと全Frontend suiteで行った。
- `Retry-After`はdelta-secondsとHTTP-dateを受理する。HTTP-dateは注入clockのepochを基準にする。
- app shellの公開操作は変更していないため`documents/design/frontend/app-shell.md`の同期は不要。公開signaling契約は`documents/design/contracts/frontend-rtc.md`へ同期し、`documents/design/index.md`の導線説明も更新した。

### Comment audit

| path                                                                                          | symbol / block / decision / flow                                    | kind                                 | current comment                                                       | reader question                                             | required reader knowledge                                                                  | decision | action / omission reason                                                                                   | reviewer note                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `rtcNegotiationStateMachine.ts`                                                               | `RtcNegotiationStateMachine` / phase・identity・candidate ownership | state / lifecycle                    | 新規、なし                                                            | revisionはいつ進みcandidateは何へ帰属するか                 | Answer検証後だけcommitし、queueはPeerConnection generationとrevisionに属する               | add      | class TSDocと`beginInitial`/`beginRestart`/`commitAnswer`へ不変条件を追加                                  | mismatch時にcurrent revisionが不変か照合                         |
| `rtcSignalingHttp.ts`                                                                         | `RtcSignalingHttpError`                                             | API / boundary                       | 新規、なし                                                            | 404/410をどの層でreplacement判定するか                      | operationとstatusをtransportからresource ownerまで失わない                                 | add      | exported error TSDocへstatusを解釈せず伝播する境界を記録                                                   | initial 410とupdate/candidate 410を区別できるか                  |
| `rtcSignalingHttp.ts`                                                                         | `postRtcSignalingJson` / retry loop                                 | flow / heuristic / timeout           | 新規、なし                                                            | call数、deadline、jitter、body identityはどう連動するか     | 4実行、30秒、operation timeout clip、sleep terminal、同一body                              | add      | exported function TSDocとserialization前後の責務を追加                                                     | 500/1000/2000 capとRetry-After優先をtest照合                     |
| `rtcDisconnectedGraceTimer.ts`                                                                | `RtcDisconnectedGraceTimer`                                         | event / lifecycle                    | 新規、なし                                                            | disconnected連打と復帰/failedをどう競合させないか           | 単一10秒timer、復帰cancel、failedはownerが即時処理                                         | add      | class TSDocでevent sourceと非対象を説明                                                                    | 9999ms復帰と10000ms expiryを照合                                 |
| `rtcBundleDiagnostics.ts`                                                                     | `RtcBundleDiagnostics`                                              | lifecycle / navigation               | 新規、なし                                                            | bundle replacement後に旧PCを観測しない仕組みは何か          | callback時にcurrent bundleを取得しfailure captureを再armする                               | add      | class TSDocへtimer ownershipとreplacement関係を追加                                                        | stop時timer解放とcurrent getterを照合                            |
| `rtcNegotiation.ts`                                                                           | `negotiateRtcSession` / serialized Offer                            | API / orchestration / data           | 旧commentはpreferred session fallbackと早期flushを説明しstale         | SDP、request identity、Answer適用、commitの責務境界はどこか | retry body固定、remote description適用、commit/flushはownerへ委譲                          | rewrite  | exported TSDocとloop外serialization commentへ全面更新                                                      | flushがAnswer identity commit後だけか照合                        |
| `rtcIceCandidateSender.ts`                                                                    | `sendRtcIceCandidate`                                               | API / boundary / fallback            | 旧実装はcatchしてcandidate failureをdrop                              | candidate failureがgenerationへどう伝わるか                 | revision付きbody、retry、404/410/terminalの上位伝播                                        | rewrite  | catch握り潰しを削除しexported TSDocへfailure contractを追加                                                | candidate retry exhaustionがterminalへ届くか                     |
| `rtcConnectionStateHandler.ts`                                                                | `handleRtcIceConnectionState`                                       | event / flow                         | 旧commentなし                                                         | UI通知とrecovery stateの責務境界はどこか                    | browser eventをintentへ変換しgrace/single-flight/modeはownerが扱う                         | add      | exported function TSDocへ前後関係と非対象を追加                                                            | disconnectedとfailed callbackの違いを照合                        |
| `rtcBoundarySchema.ts`                                                                        | Offer/config/candidate/DataChannel parser群                         | boundary / API                       | 旧exportにdoc commentなし                                             | parserが検証する範囲とidentity検証の担当はどこか            | Zodはwire shape、state machineはoperation context付きidentityを検証                        | add      | exported parser/typeへ入力、output、throw、後段責務を局所記録                                              | revision optionalがlegacy初回以外で拒否されるか                  |
| `rtcTalkClient.ts`                                                                            | `RTCTalkClient` / negotiation・replacement・terminal flow           | orchestration / lifecycle / fallback | 旧class/各method commentはpreferred-session自動reconnectを説明しstale | bundleをいつ維持/交換/closeし遅延callbackをどう無効化するか | Pion restartは同一bundle、session loss/legacyのみ交換、generation+AbortSignalで旧I/O無効化 | rewrite  | class/public API TSDoc、generation guard、failure分岐を現state machineへ同期                               | stop、track replacement、404/410、legacyのbundle ownershipを照合 |
| `rtcTalkClient.ts`                                                                            | 322行structure exception                                            | constraint                           | 新規、なし                                                            | なぜhard threshold超過を残すか                              | atomic close判断を複数ownerへ分散するとsession/revision/candidate不整合を招く              | add      | guard固定形式の具体理由をclass直前へ追加。diagnostics/graceは既に分離                                      | 例外理由と残る単一責務が一致するか                               |
| `rtcPeerConnectionFactory.ts` / `rtcPeerConnectionEvents.ts` / `rtcPeerConnectionShutdown.ts` | bundle生成・browser callback・close                                 | lifecycle comprehension surface      | 既存commentがDataChannel/end-of-candidates/event loggingを説明        | 新state machine導入で直接変更が必要か                       | factory callbackはgeneration closureから供給され、既存生成/close契約は変わらない           | keep     | 局所APIと新ownerの接続は`RTCTalkClient.createBundle`側で具体化済み。対象helper自体の入出力・失敗条件は不変 | old bundle callbackがgeneration guardでno-opになるか             |

### ドキュメント同期

- `documents/design/contracts/frontend-rtc.md`: terminal/replacement status、64 FIFO、10秒grace、single-flight、最大4実行、timeout/deadline/jitter、legacy rollback modeを実装値へ同期した。
- `documents/design/index.md`: Frontend RTC導線をICE restart/retryも含む説明へ更新した。
- app shell公開操作、compose、env、生成barrel/配布物は変更していないため、それらの同期・再生成は不要。

### Verification

- `npm run gate` @ `7a39337813b187356fcf977f7593ad809a8aec28`: lint / build / test PASS（556 tests: 554 passed, 2 skipped）。
- `npm run tasks:check:frontend-structure`: PASS。`rtcTalkClient.ts`の理由付き338行例外をwarningとして確認。
- `npm run tasks:check`: PASS（273 task directories）。
- `npm run tasks:index:check`: PASS（13 categories、変更なし）。
- `npm run commit:check`: PASS。
- focused RTC suite: 5 files、28 tests PASS。

### Commit

- `7a39337813b187356fcf977f7593ad809a8aec28` `feat(rtc): implement frontend ICE restart state machine`

## attempt 2

### 評価指摘への対応と判断

- bundle replacementでは`stopSenderTracks: false`を明示し、旧DataChannel/transceiver/PeerConnectionだけを閉じる。logical clientの`stop`とterminal failureは既定のtrack停止を維持し、resource ownershipをoperation別に分けた。
- legacy切断でも既知の旧session IDを`previous_session_id`へ渡す。update/candidate 404/410と同様に、新bundle、新DataChannel、新UUID、liveな最新audio trackをfake owner testで固定した。
- HTTP retryの責務をResponse受信までに限定し、`response.json()`をretry loop外へ移した。200 JSON syntax failureとZod schema failureはいずれも1 HTTP実行でterminalになる。
- Answer前queueのflushを`candidateSendFlight`へ連結してから`pendingIdentity`を解除する。これによりflush中に新規candidateが発生しても同じPromise chainの末尾へ入り、revision内FIFOと非並行送信を維持する。
- `RTCTalkClient`のfake owner testsを追加し、initial/restart single-flight、failed/grace、FIFO、operation別replacement、legacy、terminal status、identity mismatch、candidate exhaustion、stop、track replacementをmodule間で検証した。
- retry testへOffer 10秒、candidate 5秒、30秒deadline clip、network/timeout exhaustion、fake clock call時刻を追加した。

### Comment audit（attempt 2追加surface）

| path                            | symbol / block / decision / flow                                  | kind                        | current comment                                                         | reader question                                               | required reader knowledge                                                                  | decision   | action / omission reason                                                                             | reviewer note                                                   |
| ------------------------------- | ----------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `rtcPeerConnectionShutdown.ts`  | `RtcPeerConnectionShutdownParams` / `closeRtcPeerConnection`      | API / lifecycle / ownership | attempt 1 auditでは既存契約不変と誤認                                   | replacementとlogical stopでsender track ownershipはどう違うか | replacementはtrackを次bundleへ移し、terminal/stopだけがtrackを停止する                     | add        | exported type/functionへ既定値、falseを使う唯一の条件、DC/transceiver/遅延close順序を追加            | replacement testでtrack.stopなし、terminal testでstopありを照合 |
| `rtcTalkClient.ts`              | `replaceBundle` / `recoverFromIceFailure`                         | fallback / lifecycle        | class commentはbundle交換を説明するがtrack shutdown条件が不足           | 旧bundle close後も新bundleが送音できる根拠は何か              | generation abort後、track非停止close、新bundle生成の順で同じlive trackを移す               | rewrite    | `stopSenderTracks:false`を局所実装へ明示し、legacyにも旧session IDを渡す                             | update/candidate/legacy全経路で新PC/DC/UUID/live trackを照合    |
| `rtcTalkClient.ts`              | `flushCandidates` / `onIceCandidate`                              | flow / ordering             | attempt 1 commentはFIFOと逐次送信を主張したが、別flight競合を見落とした | Answer前queueとflush中の新candidateをどう直列化するか         | queue drainを共通flightへ載せた後にpendingを解除し、後続candidateを同chain末尾へ加える     | rewrite    | 共通Promise chainの前後関係とrevision FIFOをblock commentへ更新                                      | first send保留中に2件目/3件目が並行しないowner testを照合       |
| `rtcSignalingHttp.ts`           | `RtcSignalingOperation` / `RtcRetryClock` / `RtcSignalingRequest` | API / data / boundary       | exported typeにcommentなし                                              | operation、clock、signalはretry contractで何を表すか          | typed recovery区分、単一時刻系、immutable bodyとgeneration cancelの入力境界                | add        | 各exported typeへ対象固有のTSDocを追加                                                               | operation/status保持とfake clock/Abort testsを照合              |
| `rtcSignalingHttp.ts`           | `postRtcSignalingJson` / response parse boundary                  | flow / fallback             | TSDocはretry条件を説明するがparse位置が不明                             | 200 body parse failureは再送されるか                          | HTTP response受信だけretryし、identity不明なbody failureは即terminal                       | rewrite    | response取得helperとloop外`response.json()`へ分離し局所commentを追加                                 | invalid JSONがjson 1回/fetch 1回か照合                          |
| `rtcNegotiationStateMachine.ts` | exported types、getters、public transition/queue methods          | API / state / data          | classと主要3 methodのみcommentあり                                      | 各公開値を誰がいつ読み、どのstate change/失敗を起こすか       | phase/mode/identityのread-only意味、transition no-op条件、65件目failure、close後再利用不可 | add        | 全exported type/getter/public methodへ対象固有のdoc commentを追加                                    | evaluatorがpublic symbol一覧と1対1照合                          |
| `rtcBundleDiagnostics.ts`       | public lifecycle/capture methods                                  | API / lifecycle             | class commentのみ                                                       | timer開始停止とfailure rearm/captureのobservable effectは何か | current bundle getter、1 generation 1 snapshot、復帰後rearm                                | add        | 全public methodへ副作用と呼出条件を追加                                                              | replacement後に旧PCを観測しないことを照合                       |
| `rtcDisconnectedGraceTimer.ts`  | `schedule` / `cancel`                                             | API / event                 | class commentのみ                                                       | 重複schedule/cancelの戻り値と効果は何か                       | 初回だけtrue、復帰/closeでcancel                                                           | add        | public methodsへevent/state contractを追加                                                           | 9,999/10,000ms testsと照合                                      |
| `rtcAudioTrackSender.ts`        | `setRtcAudioMute` / `replaceRtcAudioTrack`                        | API / ownership / fallback  | exported helperにcommentなし                                            | trackをstopする層とsender欠落時の動作は何か                   | helperはenabled/replace/addだけを行い、stopはmedia/logical client ownerが決める            | add        | exported helpersへ非対象のstop ownershipとfallbackを追加                                             | replacement最新trackが新bundleへ渡るowner testを照合            |
| `rtcPeerConnectionFactory.ts`   | `RtcPeerConnectionBundle` / `createRtcPeerConnectionBundle`       | API / lifecycle             | exported type/functionにcommentなし                                     | bundle cleanupとtrack ownershipは誰へ移るか                   | factoryはlive trackから1 generationを作り、cleanup判断をcallerへ移す                       | add        | exported type/functionへresource transferを追加                                                      | ownerがdistinct PC/DCを生成しshutdown optionを選ぶか照合        |
| `rtcPeerConnectionEvents.ts`    | `setupRtcPeerConnectionEvents`                                    | API / event / lifecycle     | event block commentsは個別eventのみ                                     | listenerを誰が無効化し旧callbackをどう防ぐか                  | browser listenerはPC closeまで存続しowner generation guardが遅延eventをno-op化             | add        | exported functionへevent sourceとcleanup前後関係を追加                                               | stop後old callback testを照合                                   |
| `rtcTalkClient.ts`              | public callbacks / `start` / `stop` / mute / track replacement    | API / lifecycle             | methodsはcomment済み、public callback fieldsはなし                      | health/text/telopのobservable outputとtrack競合契約は何か     | callbackごとのconsumer、stop後no-op、latest trackを将来bundleにも使用                      | add / keep | callback fieldsへdoc comment追加。既存method commentsは入力、副作用、ownershipを具体的に覆うためkeep | public member一覧とowner stop/track testsを照合                 |

### ドキュメント同期（attempt 2）

- `documents/design/contracts/frontend-rtc.md`へ、session-loss/legacy bundle replacementでは送信用audio trackを停止せず新PeerConnectionへ引き継ぐ契約を追記した。
- app shell、compose/env、公開barrel、生成物への追加影響はなく、他文書同期・再生成は不要。

### attempt 2追加確認

- candidate failureによるreplacementでは、旧generationのrejected `candidateSendFlight`を新しいresolved chainへresetする。新bundle接続後のcandidateが旧failureを継承せず、replacement sessionへ送信されることをowner testへ追加した。
- focused RTC suite: 7 files、51 tests PASS。
- Frontend full suite: 86 files（85 passed、1 skipped）、579 tests（577 passed、2 skipped）。
- `npm run gate` @ `7678bf6c607b67303689669ac41d72c54a1605cb`: lint / build / test PASS。
- `npm run tasks:check:frontend-structure`: PASS。`rtcTalkClient.ts`の理由付き349行例外をwarningとして確認。
- `npm run tasks:check`: PASS（273 task directories）。
- `npm run tasks:index:check`: PASS（13 categories、変更なし）。
- `npm run commit:check`: PASS。

### attempt 2 commit

- `7678bf6c607b67303689669ac41d72c54a1605cb` `fix(rtc): preserve replacement track and candidate ordering`

Correction: attempt 2の正しいfull commit SHAは
`7678bf6d31bd5bafd77bfd2c2fe59f7aead15185`。直前2箇所の`7678bf6c...`は転記誤りであり、
gateとcommit内容はこの正しいclean SHAに対して確認した。
