# Evaluation: task-260802032912-pion-phase-3-initial-signaling-idempotency

## 判定

PASS

attempt 3（`34bd726b4cf846ee22779e2209dd554146a8b806`）で前回の残課題2点を解消した。

## 受け入れ条件チェックリスト

- [✓] initial Offer schema — `session_id`省略だけをinitialとして受理し、null、空文字、数値、objectは400、非空stringはupdate Offerとして501を維持する。`offer_request_id`はcanonical UUID、`offer_revision`は1、`previous_session_id`は省略またはstrict ULID stringだけを受理する。Answer revision 1と共有fixtureも確認した。
- [✓] same request ID / same raw SDPの冪等性 — decoded SDP bytesをSHA-256でhashし、lock下のentry登録をlinearization pointとして100並行requestをsingle-flight化する。同じcandidate収集済みAnswer/session IDを直列・並行retryへ返す。
- [✓] conflict / tombstone — 同じrequest IDの異なるSDPを409、終了sessionの有効tombstoneを410とし、新規sessionへfallbackしない。
- [✓] cache/tombstone TTL・capacity — completed Answer/tombstoneは2分TTL、in-flightを含む合計1000件上限で、期限内entryをevictしない。request時と正確な30秒周期でexpiredだけを回収する。999/1000/1001、TTL満了1ns前/満了時、in-flight capacityをtestで確認した。
- [✓] Manager admission — schema検証後、Coordinator/PeerConnection/codec作成前にactive+reservationをlock下でatomicに数える。実`Manager.Create`の100並行でreservation 100、101件目のresource builder非到達、setup failure後のreservation/session/goroutine収束を確認した。実Pion成功/negotiation failure経路もreservation 0へ収束する。
- [✓] HTTP boundary / status / failure cleanup — body 1 MiB、SDP 256 KiBのexact/+1、UUID/ULID/type異常、400/409/410/413/429/504 mappingを確認した。timeout、session capacity 429、owner failure、process shutdownで失敗結果をcacheせず、entry/session/reservation/resource/owner/sweeper/goroutineを残さない。
- [✓] owner / waiter lifecycle — request cancelはwaiterだけを離脱させる。全waiter cancel後もownerはprocess context/gather timeoutまで継続し、成功cacheまたは失敗entry削除を完了する。owner failure後の同request ID retryはfresh ownerを開始する。
- [✓] `previous_session_id`安全ログ — strict validation後の旧IDと新session IDだけを構造化ログへ渡し、旧session検索/復活には使わず、SDP/audio/chat本文を出さない。
- [✓] config / shutdown / fixture — default 100/1000/2分、99/100/101、999/1000/1001、TTL 29/30/120/121秒を確認した。process cancel後のregistry owner/sweeper joinとManager cleanup、共有request/Answer fixtureを確認した。
- [✓] comment acceptance — production変更とchange comprehension surfaceを全件照合した。request registry、SHA-256 identity、single-flight、waiter/owner分離、TTL/admission、state transition、error mapping、reservation、shutdown、2種類のtombstone ownershipを局所的に説明する。attempt 3ではbuilderがCoordinatorを受けてPC/codecを生成し、成功return時だけ全resourceをSessionへ移し、error時はbuilderがPC/codec、`Manager.Create`がCoordinatorをcleanupする実ownershipへコメントとauditを同期した。stale comment、TODO、逐語説明、未照合surfaceなし。

## テスト結果

- `npm run gate` — PASS（commit `34bd726` clean tree cacheを独立照合。lint / build / testの3 stepすべてPASS）
- `GOCACHE=/tmp/sincromisor-attempt4-gocache GOMODCACHE=/tmp/sincromisor-attempt4-gomodcache /tmp/go1.26.5-toolchain/bin/go vet ./...` — PASS
- 同環境の `go test -race -buildvcs=false ./internal/signaling ./internal/rtc` — PASS（2 package）
- 同環境の `go test -race -buildvcs=false ./...` — PASS（全9 package）
- `npm run tasks:check` — PASS（273 task directories）
- `npm run commit:check -- HEAD` — PASS
- `git diff --check` — PASS
- loopback/netlinkを使うrace testはsandbox外の許可環境で独立実行した。failed/skippedなし。
- カバレッジ評価 — 受け入れ条件に対して十分。429 HTTP testのfake active/reservation値は単独ではstate transitionの証拠にならないが、実`Manager.Create`の100/101並行testがadmission/reservation/resource境界を担保し、429 testがregistry entry、builder非到達、owner/sweeper join、goroutine収束を担保するため、suite全体で必要な経路を覆う。

## ドキュメント整合性

- 公開通信契約の変更あり。`documents/design/contracts/frontend-rtc.md`にinitial Offer/Answer schema、presence/null/type、SHA-256 single-flight、TTL/capacity/session上限、400/409/410/413/429/504、retryを同期済み。
- `documents/migration/pion/contracts-and-types.md`に2分/1000/100/1 MiB/256 KiB/30秒を同期済み。
- `sincromisor-server/sincro-rtc-pion-poc/README.md`に3 flagのdefault/range/startup validationとscopeを同期済み。
- attempt 3はinternal ownership commentとtest lifecycleだけの変更で、公開契約の追加変更なし。OpenAPI/code generationは未導入で再生成対象なし。ドキュメント未同期なし。
