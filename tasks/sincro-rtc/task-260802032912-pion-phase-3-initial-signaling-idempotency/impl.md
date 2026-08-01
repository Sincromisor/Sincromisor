# Implementation Log: task-260802032912-pion-phase-3-initial-signaling-idempotency

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断・申し送り対応

- production上限の正本を`internal/config`のtyped configへ集約し、CLIは100 session、1000 registry entry、2分TTLをdefault/maxとして小さい値だけを許可した。`cmd/pion-poc`は検証済み値を`rtc.ManagerConfig`と`signaling.OfferRegistryConfig`へ明示的に渡し、constructorやREADMEへ独立したdefault実装を持たせていない。
- Offer ownerはrequest contextを保存せず、process contextからgather timeout付きcontextを生成した。request cancelはwaiterだけを離脱させる。shutdownはprocess cancel、HTTP drain、registry owner/sweeper join、Manager cleanupを同じ5秒context内で行う。
- Managerはschema検証後、Coordinator、PeerConnection、codecを作る前にlock下でactive sessionと作成予約を合算する。session公開とreservation解放を同じlock acquisitionで行い、setup失敗はdeferで予約を戻す。
- session cleanupの既存`onClosed` eventをOffer単位callbackへ合成し、registryのcompleted entryを終了時点から2分のtombstoneへ変換した。candidate用のManager closed mapとは責務とTTLを分離した。
- `previous_session_id`は検索や復活に使わず、成功したinitial Offerで旧/新session IDだけを構造化ログへ出す。SDP、audio、chat本文は相関ログへ出さない。
- update Offerとcandidate revisionは仕様どおり対象外とし、`session_id`付きOfferのHTTP 501と現行candidate契約を維持した。Frontend送信実装は後続taskの責務である。

### ハマった点・回避

- sandbox内のPion integrationはnetlink/loopback UDPを拒否されたため、同じrace commandを許可済みのsandbox外実行へ切り替えた。実装失敗ではなく環境制約であり、最終的にmodule全体がPASSした。
- 最初の`npm run gate`は共有frontend `node_modules`が空で`biome: not found`となった。worktreeが参照する共有dependencyを`npm ci`でlockfileどおり復元し、gateを再実行した。`npm ci`は既存lockfileについてhigh severity 1件を報告したが、本taskはfrontend dependencyを変更していない。

### ドキュメント同期

- `documents/design/contracts/frontend-rtc.md`へinitial Offer/Answer schema、single-flight、SHA-256、TTL/capacity/session上限、HTTP 400/409/410/413/429/504、half-trickle retryを同期した。
- `documents/migration/pion/contracts-and-types.md`へ確定値（2分、1000、100、1 MiB、256 KiB、30秒回収）を同期した。
- Pion PoC READMEへ3 flagのdefault/rangeとstartup validation、現在のscope境界を同期した。
- `internal/signaling/testdata/`へFrontend後続taskと共有するinitial Offer request/Answer JSON fixtureを追加した。OpenAPI生成物はプロジェクトに未導入であり、再生成対象はない。

### Comment audit

| path                                   | symbol / block / decision                                                   | kind                                     | current comment                                                              | reader question                                                    | required reader knowledge                                                                                           | decision      | action / omission reason                                                                                                                                         | reviewer note                                                      |
| -------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `internal/config/config.go`            | `DefaultMaxSessions` / `DefaultOfferCacheCapacity` / `DefaultOfferCacheTTL` | constraint                               | 新規前はなし                                                                 | defaultとproduction上限の関係は何か                                | CLIで上限を増やせず、値の正本がtyped configであること                                                               | add           | 各exported定数へdefault兼maxの運用意味を追加した                                                                                                                 | README/flag値と定数が一致すること                                  |
| `internal/config/config.go`            | `Config`, `Load`の3 flag validation                                         | API / boundary                           | HTTP/static/ICEだけを説明                                                    | session/cache値はいつ、どの範囲で拒否されるか                      | listener前にint 1以上、TTL 30秒以上かつproduction max以下を確定すること                                             | rewrite       | Configの責務をadmissionへ拡張。Load docは既存のstartup boundary説明が新分岐にも成立するためkeep                                                                  | 100/101、1000/1001、30秒/2分境界をtestと照合                       |
| `internal/rtc/manager.go`              | `Offer.OnClosed`, `Answer.Revision`, `ManagerConfig`                        | API / lifecycle / data                   | identity/Answer/dependency説明はあったがclose callback、revision、上限はなし | registryはどのeventでtombstone化し、revisionは誰が返すか           | callbackは全resource join後、initial revisionは1、MaxSessionsは作成予約を含むこと                                   | add / rewrite | field近接commentとManagerConfig docへ通知時点・共有dependency・上限を追加した                                                                                    | callbackがManager remove後に呼ばれること                           |
| `internal/rtc/manager.go`              | `Manager`のclosed mapとinitial Offer tombstone                              | lifecycle / ownership                    | PoC tombstoneはTTLなしとだけ記載しており、新registry導入後はstale            | 2種類のtombstoneを誰が所有するか                                   | Manager mapはcandidate識別用process lifetime、Offer tombstoneはsignalingの有限TTL                                   | rewrite       | staleなPoC commentを責務分離の現在仕様へ更新した                                                                                                                 | candidate契約を誤ってTTL回収しないこと                             |
| `internal/rtc/manager.go`              | `Manager.Create` admission reservation / `reserve` / release                | constraint / flow / state                | resource作成flowは説明済み、reservationなし                                  | 並行Createがなぜ上限を超えず、失敗時にslotが戻るか                 | schema検証後かつCoordinator/PC/codec前にreserveし、公開/失敗で必ず解放するlinearization point                       | add           | Create blockとreserveへ順序・lock・active+reservation不変条件を追加した                                                                                          | race testのpeak 100と残reservation 0を照合                         |
| `internal/rtc/session.go`              | `newSession`, `negotiate`, `cleanup`, `onClosed`                            | lifecycle / change comprehension surface | resource ownership、gather、join後callbackを説明済み                         | Manager/registry callbackは半端なcleanupを観測しないか             | cleanupはresource join後に`onClosed`を呼び、その後doneを閉じる                                                      | keep          | 今回のcallback合成に必要な入力、失敗、順序が既存commentで局所的に読め、stale箇所がない                                                                           | `cleanup`の`onClosed`→`done`順を確認                               |
| `internal/signaling/offer_registry.go` | `offerEntry` state/data                                                     | data / state machine                     | 新規                                                                         | hash、answer、error、expiry、doneは各stateで何を意味するか         | in-flight→completed/tombstone、done close条件、expiresAt適用state                                                   | add           | struct近接commentでfieldの表現とstate別の有効範囲を説明した                                                                                                      | failure entryがmapから削除されてもwaiterはerrを読めること          |
| `internal/signaling/offer_registry.go` | `OfferRegistry`, `Resolve`                                                  | API / flow / constraint                  | 新規                                                                         | single-flightのlinearization pointとSDP同一性は何か                | resource作成前登録、decoded raw SDP bytesのSHA-256、waiter context分離、3 state共通capacity、live eviction禁止      | add           | public doc commentに入力、observable result、typed failure、副作用、非evictionを追加した                                                                         | 100並行、different SDP、1000/1001 testと照合                       |
| `internal/signaling/offer_registry.go` | `create`, `wait`, `sessionClosed`                                           | lifecycle / state transition             | 新規                                                                         | owner、waiter、Session closeが競合したとき誰がentryを確定するか    | ownerはprocess/gather context、成功のみcache、close eventはTTLを取り直しtombstone化、request cancelはowner非伝播    | add           | ownerとclose callbackの前後関係、失敗時削除、retry抑止期間を近接説明した。`wait`はselectとstate名から入出力/失敗/副作用なしが局所的に読めるため個別commentを省略 | all waiter cancel後のowner成功/失敗とshutdown cancelを照合         |
| `internal/signaling/offer_registry.go` | `sweep`, `removeExpiredLocked`, `Wait`                                      | lifecycle / cleanup / constraint         | 新規                                                                         | periodic goroutineは誰が止め、in-flightを回収するか                | 30秒event source、process cancel、sweeperDone join、completed/tombstoneだけ期限回収                                 | add           | event source、終了通知、request時回収との関係、capacity evictionを行わないことを追加した                                                                         | fake clock periodic sweepとshutdown join testを照合                |
| `internal/signaling/http.go`           | `offerRequest`, `handleOffer` validation pipeline                           | boundary / orchestration / error mapping | 旧schemaとrequest-scoped gather説明                                          | resource作成前に何を検証し、registry failureを何statusへ変換するか | body→schema/type→update 501→SDP size→UUID/revision/ULID→registryの順、400/409/410/413/429/504                       | rewrite / add | staleなrequest-scoped owner commentを削除し、registry登録順とtyped error mappingの意図を追加した                                                                 | malformed/oversizeでCreateが呼ばれないこと、status testと照合      |
| `internal/signaling/http.go`           | `decodeJSON`                                                                | boundary / data transformation           | なし                                                                         | 1 MiBちょうど/+1とtrailing valueをどう分類するか                   | MaxBytesErrorだけを413 sentinelへ保ち、syntax/type/unknown/trailingは400へ委ねる                                    | add           | schema変換前の有限body boundaryとerror分類を説明した                                                                                                             | first/second Decodeの両方でMaxBytesErrorを保持                     |
| `cmd/pion-poc/main.go`                 | `run`, `serve` process lifecycle                                            | orchestration / cleanup                  | HTTP→Session shutdownだけを説明                                              | requestから独立したowner/sweeperをいつcancel/joinするか            | process cancelでin-flightを収束、HTTP drain後はowner Addなし、registry join後にManager cleanup、全て同じ5秒deadline | rewrite       | lifecycle docを新しい4段階へ同期し、listener failureもcleanup経路へ合流した                                                                                      | shutdown中owner cancel、session reservation/PC残存なしをtestと照合 |

### Verification

- `gofmt -l .`（出力なし）
- `go vet ./...`（PASS）
- `go mod tidy -diff`（差分なし）
- `go test -race -buildvcs=false ./internal/signaling ./internal/rtc`（PASS、loopback許可環境）
- `go test -race -buildvcs=false ./...`（PASS、全Go module、loopback許可環境）
- `npm run gate`（lint / build / testすべてPASS）
- `npm run tasks:check`（PASS、273 task directories）
- `git diff --check`（PASS）

### 仕様逸脱・残リスク

- 仕様逸脱なし。
- Frontendは本taskのscope外であり、新しい必須initial schemaを送信する後続taskが完了するまでPion PoCとのend-to-end接続は成立しない。共有fixtureで後続実装の契約を固定した。
- update Offer、candidate revision/dedupe、metrics公開はtask記載どおり後続範囲である。

## attempt 2

### FAIL指摘への対応判断

- Goのplain `string`ではJSON field省略と`null`/空文字を区別できないため、Offer境界の`session_id`と`previous_session_id`を`json.RawMessage`で受け、presenceとtypeをdomain処理前まで保持した。非空文字列の`session_id`だけはupdate Offerとして501を維持し、null・空文字・文字列以外はinitial schema違反の400とした。`previous_session_id`はfield省略またはstrict ULID文字列だけを許可する。
- private reservation helperの単体testは受け入れ証拠として不十分だったため削除した。実`Manager.Create`を100本並行実行し、admission後のPeerConnection/codec builder境界で停止させ、lock下のreservationが100であること、101本目がbuilderへ到達せず`ErrSessionCapacity`になることを確認する構成へ変更した。release後は100本のsetup failureがreservation、Coordinator、goroutineを残さない。
- Session builderをprivate境界としてManagerへ保持した。productionでは従来どおり`newSession`へ委譲し、testはresource作成境界への到達だけを観測する。これはadmissionを実`Create`経路で検証しつつ、100個の実codec/socketをtest assertionのためだけに確保しないための境界分離である。
- registry entryにwaiter数を保持し、32 waiterすべてが同じin-flightへ参加したことを同期的に確認してから全request contextをcancelした。owner failure後にentryが削除され、同request IDのretryが新ownerを開始することを確認した。waiter数はowner cancel条件には使わず、request lifecycleとowner lifecycleの分離を維持する。
- timeout、session admission 429、in-flight capacity拒否について、失敗requestがcache/registry slotを追加せず、session/reservation/owner/sweeper/goroutineが収束するassertを追加した。TTLは満了1ns前のlive保持と満了時回収を分け、fake clockがsweeperから正確に30秒を要求されたことも検証した。
- subprocess integrationの`go build`がworktree VCS metadataのsandbox制約で失敗したため、test binary buildだけ`-buildvcs=false`を明示した。production build contractは変更していない。

### ドキュメント同期

- `documents/design/contracts/frontend-rtc.md`へ、`session_id`省略とnull/空文字を区別すること、および`previous_session_id`が省略またはstrict ULID文字列だけであることを追記した。
- API schema以外の公開挙動、flag、生成物に変更はない。OpenAPIは未導入のため再生成対象なし。

### Comment audit

| path                                    | symbol / block / decision                               | kind                          | current comment                          | reader question                                           | required reader knowledge                                                                                     | decision      | action / omission reason                                                                                     | reviewer note                                                                  |
| --------------------------------------- | ------------------------------------------------------- | ----------------------------- | ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `internal/signaling/http.go`            | `offerRequest` RawMessage fields                        | boundary / data               | attempt 1ではschema順序だけを説明        | なぜstringではなくRawMessageで受けるか                    | JSON field省略とnull/zero valueはGo string decode後に区別できず、initial/update分類とtype 400にpresenceが必要 | add           | schema型の直前にpresence保持とzero value collapse回避を説明した                                              | session null/empty/number/object、previous null/empty/number/object testと照合 |
| `internal/signaling/http.go`            | `handleOffer` session/update分岐、previous parse        | orchestration / error mapping | registry/error mapping説明はあり         | field presenceごとの400/501とULID parse順序は何か         | 非空session stringだけ501、他のpresent値は400、previousはstring decode後にParseStrict                         | keep / add    | 既存flow commentは後段registry順序に引き続き有効。`isNonEmptyJSONString`へ分岐目的とreject集合を近接追加した | RawMessage `null`が空文字として受理されないこと                                |
| `internal/rtc/manager.go`               | `sessionBuildRequest`, `sessionBuilder`, `buildSession` | resource boundary / flow      | attempt 1では`newSession`直接呼出し      | capacity rejectがPC/codec作成前であるとどこで観測できるか | builder呼出しがSessionへのCoordinator/PC/codec ownership移転境界で、reserve成功後だけ到達する                 | add           | options objectへ作成入力を集約し、builder境界のresource意味を説明した                                        | 100 builder到達後の101本目がbuilder callを増やさないこと                       |
| `internal/rtc/manager.go`               | `Create` reservation公開/失敗解放、`releaseReservation` | state transition / cleanup    | attempt 1のactive+reservation説明あり    | builder failureとSession公開でslotはどう収束するか        | failureはdefer release、successはsession insertとreservation decrementを同じlockで確定                        | keep / add    | Create comment/blockは現在も正確。release helperへ次Createを許可するstate changeを追加した                   | setup failure後0、実negotiation成功後active 1/reservation 0を照合              |
| `internal/signaling/offer_registry.go`  | `offerEntry.waiters`, `Resolve`, `wait`                 | lifecycle / state             | attempt 1ではdone/expiry/ownerだけを説明 | 全waiter cancelはownerをcancelするか                      | waiter参加/離脱数はrequest lifecycleの観測であり、owner contextやentry削除条件には使わない                    | rewrite / add | offerEntry commentへwaiter decrementとowner非連動を追加。Resolve/waitの既存説明は分離契約を覆うためkeep      | 32 waiter参加→全cancel→owner failure→fresh retryを照合                         |
| `cmd/pion-poc/main_integration_test.go` | child `go build -buildvcs=false`                        | test environment              | production code対象外                    | worktreeでVCS stamping失敗をどう避けるか                  | test binary内容へ影響せず、sandboxのworktree metadata参照だけを無効化する                                     | add           | test commandのみのためproduction comment audit対象外。実行理由をattempt判断へ記録                            | module raceでsubprocess testが実行されること                                   |

### Verification

- `gofmt -l .`（出力なし）
- `go vet ./...`（PASS）
- `go mod tidy -diff`（差分なし）
- `go test -race -buildvcs=false ./internal/signaling ./internal/rtc`（PASS、loopback許可環境）
- `go test -race -buildvcs=false ./...`（PASS、全9 package、loopback許可環境）
- `npm run gate`（lint / build / testすべてPASS）
- `npm run tasks:check`（PASS、273 task directories）
- `git diff --check`（PASS）

### 仕様逸脱・残リスク

- 仕様逸脱なし。
- Frontend schema adoption、update Offer、candidate revision/dedupeはattempt 1記載どおり後続範囲である。
- 追加した100並行Manager testは実`Create`、Coordinator生成、admission state transitionを通る一方、PC/codecはbuilder境界で意図的に停止する。実resource成功/negotiation failureのreservation解放は既存Pion integrationと追加failure testで別途確認した。

## attempt 3

### 残指摘への対応

- `sessionBuildRequest` / `sessionBuilder`のownership commentを実装へ一致させた。`Manager.Create`がCoordinatorを生成してbuilderへ渡し、builderがPeerConnectionとcodecを内部生成する。成功return時だけ3 resourceすべての所有権がSessionへ移り、error時はbuilderが内部生成済みPC/codec、callerがCoordinatorをcleanupする境界を局所的に明記した。
- session capacity 429のHTTP testをprocess lifecycle込みへ変更した。response確認後にprocess contextをcancelし、`OfferRegistry.Wait`でowner/sweeperをjoinしてから、entry 0、fake Manager active 0、reservation 0、resource builder call 0、`sweeperDone` close、goroutine baseline収束をassertする。
- signaling共通test helperも単なるprocess cancelで終えず、cleanupで`OfferRegistry.Wait`を有限timeout付きで必ずjoinするようにした。各testがsweeper goroutineを次testへ持ち越さない。

### Comment audit

| path                              | symbol / block / decision                         | kind                                 | current comment                                                                                | reader question                                                   | required reader knowledge                                                                                          | decision | action / omission reason                                                          | reviewer note                                                         |
| --------------------------------- | ------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `internal/rtc/manager.go`         | `sessionBuildRequest`, `sessionBuilder` ownership | resource ownership / failure cleanup | attempt 2はbuilder呼出し時点で全resourceをSessionへ移すと記載し、生成時点とerror ownerが不正確 | Coordinator、PC、codecは誰が生成し、どの時点でSession所有になるか | callerがCoordinatorを渡す、builderがPC/codecを生成する、成功returnだけが所有権移転、errorは生成者ごとにcleanupする | rewrite  | 入力resource、builder内部resource、成功/失敗双方のcleanup ownerを型直前へ明記した | `newSession`の内部rollbackと`Manager.Create`のCoordinator.Closeを照合 |
| `internal/signaling/http_test.go` | session capacity 429 lifecycle                    | test / cleanup evidence              | attempt 2はstatusとentry 0のみ                                                                 | 429 owner完了後にregistry/Manager/resource/goroutineが残らないか  | process cancel後にregistry ownerとsweeperをjoinし、admission前rejectはbuilderへ到達しない                          | add      | active/reservation/build call、sweeperDone、goroutineをWait後に明示assertした     | response 429だけでなく全非残存assertが実行されること                  |
| `internal/signaling/http_test.go` | `newTestOfferRegistry` cleanup                    | test lifecycle                       | process context cancelのみ                                                                     | helper利用testのsweeper終了を誰が待つか                           | cancelは終了要求であり、`Wait`成功がowner/sweeper join完了の観測点                                                 | rewrite  | t.Cleanupへ1秒上限のWaitを追加し、join failureをtest error化した                  | signaling package race後にhelper由来goroutineが残らないこと           |

### ドキュメント同期

- productionの公開API・通信契約・flag値はattempt 2から変更していないため設計文書の追加同期は不要。
- ownership commentはinternal implementation contractであり、対応先はsource commentと本auditを正本とする。生成物はない。

### Verification

- `gofmt -l .`（出力なし）
- `go vet ./...`（PASS）
- `go mod tidy -diff`（差分なし）
- `go test -race -buildvcs=false ./internal/signaling ./internal/rtc`（PASS）
- `go test -race -buildvcs=false ./...`（PASS、全9 package）
- `npm run gate`（lint / build / testすべてPASS）
- `npm run tasks:check`（PASS、273 task directories）
- `git diff --check`（PASS）

### 仕様逸脱・残リスク

- 仕様逸脱なし。
- 残リスクはattempt 2から変わらず、Frontend schema adoption、update Offer、candidate revision/dedupeの後続範囲のみ。
