# Pion Phase 3のinitial signalingを冪等化し境界を強化する

## 背景 / 目的

PoCはinitial OfferのHTTP responseが失われると重複sessionを作り、session/cache/inputにproduction上限がない。
ICE restartとFrontend retryに先行して、initial Offerをrequest ID単位でsingle-flightかつ冪等にする。

## 完了条件（受け入れ条件）

- [ ] initial Offerは `session_id` なし、UUID `offer_request_id`、`offer_revision: 1` を必須とし、
      optional `previous_session_id` はULIDだけを受理する。Answerは `offer_revision: 1` を返す。
- [ ] 同じrequest IDと同じSDP bytesの直列/並行requestはsingle-flightとなり、同じsession IDと
      candidate収集済みAnswerを返す。SDP hashはSHA-256とする。
- [ ] 同じrequest IDを異なるSDPへ再利用した場合は409、終了sessionの有効tombstoneは410を返し、
      新規sessionへfallbackしない。
- [ ] completed Answer cache/tombstoneは2分TTL、合計1000件上限とする。期限内entryを黙ってevictせず、
      上限時の新規initial Offerは429、expired entryはrequest受付時と30秒周期で回収する。
- [ ] active sessionは1 process 100件上限とし、上限到達時はsession/codecを作る前に429を返す。
      active+作成予約をManager lock下でatomicに数え、100並行requestでも100を超えない。
- [ ] HTTP body 1 MiB、SDP 256 KiB、request ID/ULIDの形式を境界で検証し、syntax/type/formatは400、
      byte上限は413、candidate収集timeoutは504にする。失敗結果をcompleted cacheへ保存しない。
- [ ] `previous_session_id` がある新規sessionは旧/新IDだけを構造化ログで関連付け、音声、SDP、chat本文を出さない。
- [ ] comment auditを所定schemaで記録し、request registry、single-flight、TTL/admission、hash、
      error mapping、cleanup ownershipを説明する。staleなPoC tombstone commentを更新する。

## 設計判断（着手前に確定済み）

- `internal/signaling/offer_registry.go` に
  `offerEntry{requestID, sdpHash, sessionID, revision, answer, state, expiresAt, done}` を置く。
  in-flight entryは上限に数え、waiterはrequest context cancelで待機だけを終了し、owner処理をcancelしない。
- request IDはFrontend発行UUID、session IDはserver発行ULIDのまま分離する。SDP正規化はせず受信bytesをhashする。
- `internal/config.Config` に `MaxSessions int`、`OfferCacheCapacity int`、`OfferCacheTTL time.Duration` を追加し、
  `--max-sessions`（default/max 100）、`--offer-cache-capacity`（default/max 1000）、
  `--offer-cache-ttl`（default/max 2m、min 30s）でだけ小さくできる。intは1以上、TTLは30s以上とし、
  違反はlistener前のstartup errorにする。`cmd/pion-poc.run` が値を
  `rtc.ManagerConfig` と `signaling.OfferRegistryConfig` へ明示的に渡す。
- `previous_session_id` は相関ログ専用で、旧session検索や復活には使わない。
- update Offerとcandidate revisionは後続タスクで実装し、本タスクでは `session_id` 付きOfferを501のまま維持する。
- `cmd/pion-poc.run` がprocess lifetime contextを作り、OfferRegistryへ渡す。initial Offer ownerは
  request contextではなく `context.WithTimeout(processCtx, gatherTimeout)` でcandidate収集を所有する。
  request context cancelはwaiterだけを外し、ownerは全waiter不在でも成功cache/tombstone作成または失敗cleanupまで続ける。
  process shutdownはprocessCtx cancel後にregistry owner wait groupとManager cleanupをjoinする。
  owner timeout/cancel/errorはin-flight entryを削除し、成功時だけcompleted entryへ遷移する。

## スコープ境界

- 本タスク: initial Offer schema、single-flight/cache/tombstone、session admission、HTTP/SDP上限。
- 依存タスク: lifecycle taskのManager/Session close通知をcache tombstoneへ接続する。
- スコープ外: update Offer、candidate revision/dedupe、Frontend送信、ICE restart、metrics公開。

## 実装方針（既存コード整合: file:line）

- `internal/signaling/http.go:94` のofferRequestはsession ID以外の識別fieldを持たない。
- `internal/signaling/http.go:123` のhandlerはsession ID付きOfferを501にし、`:188` はbodyだけ1 MiBに制限する。
- `internal/rtc/manager.go:38` のregistryはprocess lifetimeの無制限closed mapを持つ。
- `documents/migration/pion/contracts-and-types.md:39` から `:44` と `:60` から `:69` が正本である。

## テスト

- same/different SDPの直列・100並行request、waiter cancel、owner timeout、session close/tombstone/expiryをfake clockでtestする。
- 全waiter cancel後のowner成功/失敗、process shutdown中owner cancel/join、atomic session reservationをrace testする。
- cache 999/1000/1001、session 99/100/101、body/SDPの境界値と+1、UUID/ULID異常をtestする。
- malformed/timeout/429でPeerConnection、cache、registry、goroutineが残らないことをrace testする。
- signaling JSON fixtureを `internal/signaling/testdata/` に置き、後続Frontend taskと共有する。
- `go test -race ./internal/signaling ./internal/rtc`、`go vet ./...`、`npm run gate`、
  `npm run tasks:check`を通す。

## ソースコードコメント受け入れ条件

- 変更production codeと、その理解に必要な直接のhelper/state/event/lifecycle/data transformationを
  change comprehension surfaceとして全件auditする。`impl.md` は `path`、`symbol/block/decision/flow`、
  `kind`、`current comment`、`reader question`、`required reader knowledge`、`decision
  (keep/rewrite/delete/add)`、`action/omission reason`、`reviewer note` の列を持つ。
- exported/public APIとboundaryは目的、入力境界、戻り値/observable output、失敗条件、副作用、非対象を
  必要に応じて説明する。内部orchestration/pipeline/state transition/event source/data transformationは、
  処理段階、data表現、state change、前後関係、後段へ委ねる責務を局所的に理解できる説明にする。
- 弱い/stale commentはrewrite/deleteし、新規file/symbolは現行規約を満たす。省略は
  `documents/rules/source-comments.md` の具体的条件をauditに書き、private、短い、型がある、testを読める、
  既存も無commentを単独理由にしない。TODOは理由、削除条件、canonical task ID、期限/判断基準を必須とする。
  コメント前に命名/関数分割/型/options object/module境界を検討するが、構造改善を説明省略理由にしない。
- evaluatorは変更対象とsurfaceを全件照合し、未照合範囲と残リスクを `eval.md` に書く。
  逐語説明、確認先だけ、失敗modeのないheuristic説明、内部flowの理解不能、stale comment、
  定型的な省略理由が1件でもあればFAILとする。

## ドキュメント同期の要否

要。`documents/design/contracts/frontend-rtc.md` のinitial Offer/Answer、status、上限、409/410/413/429/504を
同期する。`documents/migration/pion/contracts-and-types.md` と値が食い違う場合も同じcommitで直す。
`sincromisor-server/sincro-rtc-pion-poc/README.md` に3 flag/default/rangeも同期する。OpenAPI生成は導入しない。
