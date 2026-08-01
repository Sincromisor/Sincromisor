# Implementation Log: task-260802032916-pion-phase-3-backend-ice-restart

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断と申し送り対応

- initial Offerのprocess-wide registry/cache/TTL/admissionは変更せず、accepted revisionとcandidate集合をSession所有にした。これによりinitial requestの冪等性と、同じPeerConnectionに対するupdateの直列化を分離した。
- `review.md`の申し送りどおり、updateの`talk_mode`はHTTP境界でmissing/enum外を400、Managerで保存値との差を409とし、Coordinatorへ新しいmodeを渡す経路を作っていない。
- candidate fieldは`json.RawMessage`でpresenceを保持し、missingを400、explicit nullをend-of-candidatesとして扱った。optional fieldのmissing/nullはGo pointerのnilへ正規化し、raw文字列のtrim/case変換を行わずhash化した。
- update処理中は`updateInFlight`をstate lockで公開して並行Offerを待たず409にする一方、PionのOffer適用とcandidate追加は`operationMu`で直列化した。
- revision commit、完成Answer cache、restart deadline停止はlifecycle lock配下でatomicにした。Closeが先なら未完成Answerを返さず、commitが先ならそのrevisionを一度有効にしてから通常のCloseへ進む。
- Pion rollback APIへ依存せず、remote description適用後の失敗は`update_offer_partial_apply`でclose-onceへ通知する。適用前の失敗はrevisionとcandidate集合を維持する。
- initial/media readiness期限とrecovery期限は別のdeadline controllerで所有した。disconnected中もmedia readiness timeoutを消さず、全timerはCloseで停止する。
- 仕様からの逸脱はない。multi-instanceでのrevision共有は明示されたスコープ外であり、process-local Session stateのままとした。

### ドキュメント同期

- `documents/design/contracts/frontend-rtc.md`へupdate Offer/Answer、request UUID・revision・talk mode競合、candidate presence/canonical tuple/8 KiB/64件、HTTP 404/409/410/413/429/504、partial apply時close、10秒graceと15秒restart deadline、同一PeerConnection/DataChannel/pipeline維持を同期した。
- 既存の設計導線が同じ契約文書を既に参照しているため、`documents/design/index.md`のリンク追加は不要と判断した。
- signaling共有fixtureへupdate request/answerとcandidate optional missing/null/end-of-candidatesを追加した。生成物・公開barrel・OpenAPIは存在せず再生成対象なし。

### Comment audit

| path                                   | symbol / block / decision / flow                                   | kind                                 | current comment                                         | reader question                                                       | required reader knowledge                                                     | decision             | action / omission reason                                                                                                                                                | reviewer note                                     |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `internal/rtc/contracts.go`            | `Offer` / `Answer` / `UpdateOffer` / `Candidate`                   | API / data                           | 新規                                                    | 各wire modelのidentity、nil、observable outputは何か                  | initial UUID、strict-next revision、candidate nullとoptional nilの意味        | add                  | public DTOごとに入力制約、retry output、resource副作用、非正規化条件をGo docへ追加                                                                                      | JSON tagだけで契約を推測させていないか            |
| `internal/rtc/manager.go`              | `Manager.Create`                                                   | API / flow                           | type/SDP/talk modeとresource ownershipの説明あり        | revision 1はいつ有効になるか                                          | candidate収集済みAnswerだけがrevision retry基点になる                         | rewrite              | UUID検証、完成Answer後のrevision初期化、失敗時closeを追記                                                                                                               | initial registryの責務をSessionへ混入していないか |
| `internal/rtc/manager_revision.go`     | `Manager.Update` / `Manager.AddCandidate` / `activeSession`        | API / boundary / flow                | 新規                                                    | unknown/closed/conflict、same-PC更新、duplicateはどう観測されるか     | typed error mapping、talk mode不変、fallback禁止、closing判定                 | add                  | public methodとregistry lookupへ入力、出力、失敗、副作用、非対象を記録                                                                                                  | closing中sessionをactiveとして返していないか      |
| `internal/rtc/negotiation.go`          | `negotiate` / `negotiateDescription` / `answerReady`               | orchestration / lifecycle            | initial専用説明を分割前から保持                         | initialとupdateでどの段階を共有し、どこを共有しないか                 | remote apply境界、half-trickle、partial apply bool、initialだけのstate遷移    | rewrite              | transaction段階とupdateが`answerReady`を再利用しない理由を局所化                                                                                                        | partial apply前後をcallerが区別できるか           |
| `internal/rtc/revision.go`             | `revisionState` / `beginUpdate` / `finishUpdate` / `commitUpdate`  | state / concurrency / lifecycle      | 新規                                                    | revisionはいつ進み、並行update/Closeとどうlinearizeするか             | state lockとoperation lockの役割、完成Answerのみcache、lock順序               | add                  | transaction invariant、single-flight、Closeとのatomic commitを各symbolへ追加                                                                                            | 失敗時にcurrentやcacheを進めていないか            |
| `internal/rtc/revision.go`             | `maxCandidatesPerRevision` / `addCandidate`                        | threshold / flow                     | 新規                                                    | 64件の対象、duplicate、apply失敗は件数へどう影響するか                | revision単位集合、65件目429、成功適用後だけ記録                               | add                  | thresholdの失敗modeとdedupe順序を記録                                                                                                                                   | duplicate/nullが上限を消費しないか                |
| `internal/rtc/revision.go`             | `candidateHash` / field encoding helpers                           | data transformation                  | 新規                                                    | tuple境界とmissing/null/emptyをどう区別するか                         | presence marker、length prefix、受信bytes無変換                               | add / omission       | `candidateHash`へ表現変換を追加。2つのwrite helperは同一関数直下でlength/presence encodingが局所的に完結し、I/O・state・失敗・ownershipを持たないため追加コメントを省略 | optional empty stringがnilと衝突しないか          |
| `internal/rtc/lifecycle.go`            | recovery constants / `sessionLifecycle` / `validSessionTransition` | lifecycle / threshold                | restartを新Session責務とするstale commentあり           | running stateを維持したrestartをどう表現するか                        | 10秒grace、15秒deadline、main stateと補助phaseの分離                          | rewrite / add        | stale記述を削除し、recovery phaseと独立deadline ownerを説明                                                                                                             | readiness timerとrecovery timerが相互に消えないか |
| `internal/rtc/recovery.go`             | ICE callback → grace → restart deadline → close                    | event / state transition / lifecycle | 新規                                                    | 各callbackの発生元、重複、自然復旧、成功update、timeoutで何が起きるか | connectedだけではrestart deadlineを消さない、timer callback再確認、close-once | add                  | flow全体と各decisionへ開始/停止条件、state change、競合時no-opを記録                                                                                                    | failed重複で期限を延長していないか                |
| `internal/rtc/readiness.go`            | `installCallbacks`                                                 | navigation / event                   | 全異常を即Closeへ集約するように読める既存comment        | ICE異常はどこへ渡るか                                                 | ICEはrecovery flow、media異常はClose、readiness latchは既存のまま             | rewrite              | event routingの変更に合わせてstale commentを更新                                                                                                                        | disconnected/failedを直接Closeしていないか        |
| `internal/rtc/session.go`              | `Session` / `beginCloseLocked`                                     | resource / lifecycle                 | PeerConnection/pipeline/timer ownerとclose-once説明あり | 新しいrevision/recovery timerも誰が閉じるか                           | Session所有、Closeで両deadline停止、cleanup順序不変                           | rewrite / keep       | `Session`所有一覧へrevisionを追加し、既存close commentは両timerを包含するためkeep                                                                                       | shutdownでrecovery timerが残らないか              |
| `internal/signaling/http.go`           | `SessionService` / `offerRequest` / `handleOffer`                  | API / boundary / routing             | initial schema presence説明あり、handler flow説明なし   | initial/updateを何で分け、失敗時fallbackするか                        | `session_id` presence、strict ULID、各経路固有field、typed error              | rewrite / keep / add | interfaceをupdate/candidate error契約へrewrite、presence modelをkeep、routing flowを追加                                                                                | null session IDをinitialとして扱っていないか      |
| `internal/signaling/http_update.go`    | `handleUpdateOffer`                                                | boundary / flow                      | 新規                                                    | validationとManager failureはどのHTTP statusになるか                  | size/schema前置、有限gather timeout、404/409/410/504、cache非所有             | add                  | 入力境界、observable output、失敗、非fallbackを説明                                                                                                                     | invalid talk modeがManagerへ到達しないか          |
| `internal/signaling/http_candidate.go` | `handleCandidate` / `decodeCandidate` / `maxCandidateBytes`        | boundary / data / threshold          | 新規                                                    | missingとnull、8 KiB、duplicate/limitをどう返すか                     | RawMessage presence、wire string bytes、typed error mapping                   | add                  | parser変換とthresholdの根拠・失敗modeを説明                                                                                                                             | optional fieldをtrim/case変換していないか         |
| `internal/signaling/offer_registry.go` | `offerEntry.revision`                                              | data                                 | entry lifecycle説明あり                                 | uint64化でregistry behaviorは変わるか                                 | `rtc.Answer.Revision`との型同期だけでinitialは常に1                           | keep                 | state/owner/expiryは既存commentで局所的に読め、挙動変更がないため新規comment不要                                                                                        | initial registryがupdateを保持していないか        |
| production外                           | tests / JSON fixtures / Markdown contract                          | test / fixture / docs                | 対象外                                                  | comment audit対象か                                                   | executable production flowを持たない                                          | keep                 | testsは意図をtest名とassertionで固定し、fixture/docsはsource comment規約の対象外                                                                                        | acceptance coverageとdocs同期を別途確認           |

stale commentは`validSessionTransition`、`installCallbacks`、`Manager.Create`でrewriteした。TODOの追加はない。file/module commentへの一括集約は行わず、boundary、transaction、timer event、data transformationの近接箇所へ説明を置いた。

### 検証

- PASS: `go vet ./...`
- PASS: `go test ./... -count=1`
- PASS: `go test -race ./internal/rtc ./internal/signaling -count=1`
- PASS: local Pion pair `TestManagerICERestartKeepsSessionPeerChannelsAndPipeline`（同一session/PeerConnection/2 DataChannel、pipeline factory 1回、restart後audio sample）
- PASS: revision/candidate/recovery focused tests
- PASS: `go mod tidy -diff`（差分なし）
- PASS: `gofmt -l .`（出力なし）
- PASS: `npm run gate` at `baa0704cde934294c8cf5cf5cf77fc685959b0cd`
- PASS: `npm run tasks:check`
- PASS: `npm run tasks:index:check`
- PASS: `npm run gen:codex:check`
- PASS: `npm run commit:check`

### Commit

- `baa0704cde934294c8cf5cf5cf77fc685959b0cd` `feat(rtc): add revisioned ICE restart signaling`

### 残リスク

- revision/candidate stateは設計どおりprocess-localであり、multi-instance routingは本タスクの対象外。
- browser frontend側のrevision queue/state machineは依存タスクであり、本コミットはbackendと共有contract/fixtureのみを変更した。

## attempt 2

### 評価残課題への対応

- restart統合testのManagerへ共有`InputCounterObserver`を注入し、restart前の`PipelineUnavailable` counterをsnapshotした。restart後に送った別audio sampleでcounterがその値を超えるまで待つため、browser側`WriteSample`成功だけでなくserverの既存`TrackRemote`、InputProcessor、Coordinator境界まで新規packetが到達したことを区別して確認できる。
- validなlocal Pion restart Offerを作り、test seam内でserver PeerConnectionへ`SetRemoteDescription`した直後にAnswer failureを注入した。`update_offer_partial_apply` close、revision 1維持、initial Answer維持、`updateInFlight`解除、終了session retryの`ErrSessionClosed`をまとめてassertし、未完成Answerがcacheされないことを固定した。
- 実Manager/Sessionのrevision 1へold revision 0とfuture revision 2のcandidateを渡し、両方が`ErrOfferConflict`となること、Pion適用境界が呼ばれないこと、candidate hash集合が0件のままでbufferされないことをassertした。
- updateのnegotiation seamを`operationMu`保持中に停止し、同時candidateがreturnもapplyもできないことを確認した。update revision 2 commit後だけcandidateが適用され、最終stateがrevision 2 / candidate 1件になることをassertした。

### 設計判断

- production algorithmを分岐させず失敗位置と待機位置を観測するため、Sessionへprivate function seamを2つ追加した。`newSession`は全production Sessionで従来と同じ`negotiateDescription`と`addCandidate`を代入する。
- negotiation seamのboolはremote description適用済み境界を保持し、candidate seamはrevision/dedupe/limit通過後だけ呼ばれる。test差し替えにも同じ契約を課し、revision transaction本体の検証対象を迂回しない。
- 公開API、HTTP契約、timeout、limit、runtime挙動はattempt 1から変更していない。

### ドキュメント同期

- productionの公開挙動と通信契約に変更はなく、`documents/design/contracts/frontend-rtc.md`はattempt 1の内容で同期済み。attempt 2はprivate test seamとacceptance coverageのみのため追加同期不要。
- OpenAPI、生成物、公開barrelへの影響なし。

### Comment audit

| path                       | symbol / block / decision / flow               | kind                        | current comment                              | reader question                                        | required reader knowledge                                              | decision | action / omission reason                                                                                               | reviewer note                                  |
| -------------------------- | ---------------------------------------------- | --------------------------- | -------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `internal/rtc/session.go`  | `Session.negotiateUpdate`                      | boundary / test seam / data | なし                                         | productionで何を呼び、差し替え時のboolは何を意味するか | 通常は`negotiateDescription`固定、boolはpartial apply close判断の正本  | add      | field直前へproduction binding、test限定差し替え、remote適用済みboolの維持条件を追加                                    | test seamがpartial apply判定を迂回していないか |
| `internal/rtc/session.go`  | `Session.candidateApplier`                     | boundary / test seam        | なし                                         | candidate validationの前後どちらで呼ばれるか           | 通常は`addCandidate`固定、revision/dedupe/limit通過後だけPionへ到達    | add      | field直前へproduction bindingと呼出順序を追加                                                                          | old/future candidateがseamへ到達しないか       |
| `internal/rtc/revision.go` | update/candidateからprivate seamを呼ぶdecision | flow / concurrency          | transactionとoperation lockの既存commentあり | seam導入でlock順序やcommit条件は変わったか             | `operationMu`取得位置、remoteApplied処理、candidate hash記録順序は不変 | keep     | 既存commentが処理段階とstate changeを引き続き正確に覆い、呼出先fieldの契約はSession側へ近接追加した                    | seam呼出しがlock外へ移っていないか             |
| production外               | `session_test.go` / `revision_manager_test.go` | test                        | 対象外                                       | source comment audit対象か                             | acceptanceの観測コードでproduction lifecycleを所有しない               | keep     | test名とassertionがserver audio、partial apply、candidate reject、直列化の観測対象を明示するためsource comment追加不要 | eval残3点を直接assertしているか                |

stale comment、TODO追加、仕様逸脱はない。

### 検証

- PASS: focused local Pion tests 3反復
    - `TestManagerICERestartKeepsSessionPeerChannelsAndPipeline`
    - `TestUpdateFailureAfterRemoteApplyClosesWithoutCachingAnswer`
- PASS: focused Manager transaction tests 10反復
    - `TestManagerRejectsOldAndFutureCandidatesBeforePionApply`
    - `TestUpdateAndCandidateOperationsAreSerialized`
- PASS: `go vet ./...`
- PASS: `go test -race ./internal/rtc ./internal/signaling -count=1`
- PASS: `go test -race ./... -count=1`
- PASS: `go mod tidy -diff`（差分なし）
- PASS: `gofmt -l .`（出力なし）
- PASS: `npm run gate` at `5a2da7f2ad563a8a2d5253802571ffdc4aa0c71c`
- PASS: `npm run tasks:check`
- PASS: `npm run tasks:index:check`
- PASS: `npm run gen:codex:check`
- PASS: `npm run commit:check`

### Commit

- `5a2da7f2ad563a8a2d5253802571ffdc4aa0c71c` `test(rtc): prove ICE restart transaction invariants`

### 残リスク

- attempt 1記載のmulti-instanceとfrontend依存タスク以外に新しい残リスクなし。
