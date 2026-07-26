# Evaluation: task-260726211007-pion-phase-2-pipeline-websocket-clients

## 最新判定（attempt 3）

PASS

attempt 2で唯一残ったproduction timeout commentの配置とaudit不一致は解消した。
機能、security、protocol、lifecycle、coverage、comment、documentationの全受け入れ条件を満たし、
最新clean SHA `1c137980` で独立検証がすべて成功した。

## attempt 3 受け入れ条件チェックリスト

- [✓] comment配置 — `production既定値はDefaultConfigだけが組み立て...` を
  無関係なService constants declarationから削除し、実際のtimeout constants直前へ移動した。
  Service mappingの各doc commentはそのまま維持され、誤誘導するdeclaration commentは残っていない。
- [✓] comment audit — `impl.md` attempt 3はService定数群を`delete`、
  production timeout const群を`rewrite`として、reader question、required reader knowledge、
  action、reviewer noteを最終実コードと一致させている。
- [✓] timeout / Close回帰 — 同一30ms acceptance overlayは約0.03秒でPASSし、
  configured timeout後のtransport close、helper/read/ping/channel joinに後退はない。
- [✓] client focused regression — terminal/error/event-once、4 service limit、
  input reject、DefaultConfig、close timeout/leakを含むclient package testがPASSした。
- [✓] 全受け入れ条件 — attempt 2で解消済みのdependency、Consul security/fallback/random選択、
  4 endpoint/binary/initialization、Raw再decode/無変更転送、state/event/limit/timeout/close/join、
  no reconnect、context reason、shutdown comment、test coverage、documentationに変更や後退はない。
- [✓] project checks — Go full/race/vet/tidy/gofmt、repository gate、tasks:checkが
  最新clean SHAですべてPASSした。

## attempt 3 テスト結果

- 同一acceptance overlay:
    - command: `go test -count=1 -overlay=... ./internal/pipeline/client -run TestAcceptanceCloseHonorsConfiguredTimeout -v`
    - PASS（約0.03秒）
- `go test -count=1 ./internal/pipeline/client`: PASS
- `go vet ./...`: PASS
- `go test -count=1 ./...`: PASS（8 package）
- `go test -race -count=1 ./...`: PASS（8 package）
- `go mod tidy -diff`: PASS（差分なし）
- `gofmt -l .`: PASS（出力なし）
- `npm run gate`: PASS（clean SHA cache hit）
    - lint: passed
    - build/type check: passed
    - frontend test: 534 passed / 2 skipped
- `npm run tasks:check`: PASS（263 task directories）
- カバレッジ評価: taskが要求するhappy path、入力境界、terminal/error、limit、
  timeout、並行event、shutdown/socket/helper/channel joinをfocused testと独立acceptanceが覆っており十分。

## attempt 3 ドキュメント整合性

- attempt 3はcomment配置だけの変更で、公開API、通信契約、公開挙動、生成物に変更はない。
- attempt 2で同期した `documents/design/contracts/audio-pipeline-websocket.md` の
  underlying socket force-close、`DefaultConfig`、no reconnect契約は最新実装と一致する。
- `documents/design/backend/services/audio-broker.md` のGo client移行中・Python production未置換記述も一致する。

## attempt 3 残課題

- なし。

## 過去評価（attempt 2）

### 判定

FAIL

前回の shutdown / timeout / coverage / context reason / document mismatch は解消した。
ただし production timeout const群へ追加したと `impl.md` が記録するコメントが、
実際には無関係な `Service` const declaration に付いている。comment audit と実コードが一致せず、
reader-oriented comment の配置も誤っているため、comment acceptanceを満たさない。

### attempt 2 受け入れ条件チェックリスト

- [✓] dependency / discovery / fallback / security — attempt 1で確認済みの
  `coder/websocket v1.8.15`、Consul passing lookup、一様ランダム選択、typed fallback、
  redirect拒否、1 MiB body limit、host / port / fixed URL構築に後退はない。
- [✓] 4 client / endpoint / protocol — constructorはI/Oを開始せず、4つの固定endpoint、
  Extractor初期化順、binary-only、PCM / DTO validation、Processor Rawの再decodeと無変更転送を維持する。
  `TestExtractorInitializationUsesExactDTOClockOnce` と wire観測付きinvalid input testが追加された。
- [✓] channel / state / no reconnect — result buffer 0、event buffer 1、同期send、
  new→connecting→open→closed、state別error、channel close owner、上位coordinatorへ委ねるretry責務を維持する。
- [✓] timeout既定値 — `DefaultConfig` が dial 5s、write 5s、ping interval 10s、
  ping timeout 5s、close 2sをコード正本として返し、constructorはtest overrideを含む正数を検証する。
- [✓] terminal event — remote close、decode error、text message、ping failure、write timeout、
  size超過をtyped eventへ分類し、競合sourceから最初の1件だけを通知するtestが追加された。
- [✓] 4 service limit — inbound / outboundとも2 / 1 / 2 / 32 MiBのexact limitと
  limit+1を全serviceで検証し、exactはwire/decodeへ進み、超過は
  `EventMessageTooLarge` でcloseする。
- [✓] input reject — Extractor frame、Recognizer session / ID / format / nil voice、
  Processor session / nil history、Synthesizer Raw provenance / sessionがinvalidな場合、
  application messageをwireへ出さないことを検証する。
- [✓] close timeout / socket / helper / goroutine / channel join — libraryの同時
  `Close` / `CloseNow` semanticsへ依存せず、captured transport socketをtimeout時に直接closeする。
  同一acceptance overlayは30ms設定で約0.03秒でPASSした。
  production testはserver socket、result/event channel、反復helper leakを確認し、
  focused race test 5反復もPASSした。
- [✓] parent cancel / normal close / failure close —既存testと追加lifecycle testを合わせ、
  Connect途中、正常close、remote/decode/write/ping failure、parent cancellation後に
  socketとgoroutineを再利用せず収束することを確認した。
- [✓] context rule exception — `lifetimeCtx` のstruct保存へ規約形式の
  `// reason:` と解消条件を追加し、connection lifetime共有と終了条件を明記した。
- [✓] stale shutdown comment —不成立だった `CloseNow` fallback記述を削除し、
  transport close→library helper join→cancel→reader/ping/channel joinの実装順へ更新した。
- [✗] comment auditの実コード整合 — `client.go` の
  `// production既定値はDefaultConfigだけが組み立て...` は
  `ServiceExtractor` 等の **service constants** を含む `const` declaration直前に置かれている。
  `impl.md` attempt 2 auditはこれを「production timeout const群の近接comment」と記録しているが、
  timeout constantsは `Config` 後の別declである。コメントをtimeout const群または
  `DefaultConfig` flowへ移し、service declarationに無関係なdoc commentを残さないこと。
- [✓] documentation — `audio-pipeline-websocket.md` は2秒後にunderlying socketを
  force-closeする契約と `DefaultConfig` を同期した。AudioBrokerの未置換/no reconnect記述、
  public barrel / OpenAPI / compose/env /生成物の非対象判断にも後退はない。
- [✓] project checks — clean SHA `ab687caf` でgate、Go full/race/vet/tidy/gofmt、
  tasks:checkがすべてPASSした。

### attempt 2 テスト結果

- `npm run gate`: PASS（clean SHA cache hit）
    - lint: passed
    - build/type check: passed
    - frontend test: 534 passed / 2 skipped
- `go vet ./...`: PASS
- `go test -count=1 ./...`: PASS（8 package）
- `go test -race -count=1 ./...`: PASS（8 package）
- `go mod tidy -diff`: PASS（差分なし）
- `gofmt -l .`: PASS（出力なし）
- `npm run tasks:check`: PASS（263 task directories）
- 同一acceptance overlay:
    - command: `go test -count=1 -overlay=... ./internal/pipeline/client -run TestAcceptanceCloseHonorsConfiguredTimeout -v`
    - PASS（約0.03秒）
- shutdown focused race:
    - command: `go test -race -count=5 ./internal/pipeline/client -run 'Test(CloseHonorsConfiguredTimeoutAndJoinsLifecycle|RepeatedCloseTimeoutDoesNotLeaveHelpers)$'`
    - PASS
- カバレッジ評価: attempt 1で不足していたterminal/error、event-once、全service limit、
  input reject、close timeout、socket/helper/channel joinを追加testが直接検証しており、十分。

### attempt 2 ドキュメント整合性

- `documents/design/contracts/audio-pipeline-websocket.md` は、close timeout時にunderlying socketを
  強制closeする実装と、production timeoutのコード正本が `DefaultConfig` であることを同期済み。
- `documents/design/backend/services/audio-broker.md` のGo client移行中・Python production未置換・
  個別client no reconnect記述は現在の実装と一致する。
- public API /通信契約 /生成物 / compose/envの追加変更はなく、再生成対象なし。

### attempt 2 残課題

- `client.go` のproduction timeout commentを実際のtimeout const群または `DefaultConfig` に近接させる。
  `Service` const declarationにはservice mappingと無関係なコメントを付けない。
- `impl.md` attempt 2 comment auditを最終配置と一致させ、対象path / symbolと実施内容を正確に記録する。

## 過去評価（attempt 1）

### 判定

FAIL

### 受け入れ条件チェックリスト

- [✓] `github.com/coder/websocket v1.8.15` — `go.mod` の direct dependency と
  `go.sum` を commit `eeb4cc1c` で同期し、旧 WebSocket dependency や独自実装は追加していない。
- [✓] Consul resolver / passing instance / random 選択 — 固定 health path と
  `passing=true`、注入 chooser、nil 時の `crypto/rand.Int` を実装し、
  `TestResolverSelectsPassingInstanceAndBuildsFixedRequest` で選択境界を確認した。
- [✓] fallback と typed reason — disabled、HTTP/status/decode/body/worker endpoint failure、
  0件を `Endpoint.Source` / `FallbackReason` で区別し、fallback 不正時の error に service 名だけを
  加えている。5xx response body や worker payload は error / log に含めない。
- [✓] Consul URL と redirect 防御 — constructor で origin component を制限し、注入
  `http.Client` も copy 後に redirect 拒否へ上書きする。
  `TestResolverRejectsRedirectForInjectedHTTPClient` を確認した。
- [✓] discovery body / endpoint / URL 境界 — 1 MiB + 1 byte の読み取りで超過を検出し、
  host / IP と port を検証する。client は resolver の host / port と固定 path/query だけから
  `url.URL` を構築する。
- [✓] 4 typed client と接続開始境界 — constructor は network I/O を開始せず、
  `Connect` 後に connection ごとの reader / ping goroutine を開始する。
- [✓] 4 endpoint / talk mode — Extractor、Recognizer、Processor、Synthesizer の path は固定され、
  Extractor の `chat=1000` / `sincro=600` と Processor の mode path は constructor で制限される。
- [✓] Extractor protocol — 初期化 MessagePack を reader 開始前に1件送り、以後の PCM は
  640 byte の binary frameだけを許可する。response は限定 DTO で decode する。
- [✓] Recognizer protocol — request を MessagePack binary で送り、session、ID、voice format を
  wire write 前に検証し、response を限定 DTO で decode する。
- [✓] Processor / Synthesizer protocol — Processor mode と URL を固定し、Synthesizer は
  `ProcessorResult.Raw` を再 decode して session を照合後、再 encode せず元 bytes を送る。
  `TestTypedClientsUseFixedEndpointsAndBinaryContracts` の byte equality も確認した。
- [✓] channel / send ownership — result は buffer 0、event は buffer 1、send は caller 同期で
  queue を持たない。result delivery は lifetime cancellation で解除され、base clientだけが
  result→event の順で close する。
- [✓] service 別 read / write limit — 2 / 1 / 2 / 32 MiB を非公開定数で固定し、接続直後に
  `SetReadLimit` を適用する。library の `ErrMessageTooBig` を typed eventへ分類する。
- [✗] timeout / terminal lifecycle — `CloseTimeout` が close handshake を実際には上限付けない。
  独立 test `TestAcceptanceCloseHonorsConfiguredTimeout` では30ms設定に対して `Close()` が
  約5.003秒後に error を返した。`coder/websocket.Conn.Close` 開始後の `CloseNow` は先行 close を
  force-closeせず完了待ちになるため、`closeHandshake` の fallback 前提が成立しない。
  また、production既定値（dial 5s / write 5s / ping 10s / ping timeout 5s / close 2s）は
  comment/documentにしかなく、default constructor / constants / production wiring が存在しない。
- [✓] lifecycle state / state別 error — new / connecting / open / closed と
  `ErrAlreadyConnected` / `ErrNotConnected` / `ErrClosed` を実装し、Close-before-Connect、
  二重 Connect、Connect/Close discovery race、parent cancellation を既存 test で確認した。
- [✗] Close の全経路収束 — 応答しない peer に対する明示 Close が設定時間内に収束せず、
  force-close由来の error も返すため、timeout後の `CloseNow` fallback と決定的 join の条件を満たさない。
- [✗] test coverage — localhost / fake resolver test は4 endpoint、binary I/O、dial timeout、
  parent cancel、resolver中のConnect/Close競合、二重Close、Extractor inbound limit、
  Recognizer outbound超過を確認している。一方、明示された remote close、decode error、send timeout、
  ping failure、text message、terminal eventの一回性、close handshake timeout/helper join、
  全serviceのlimit境界を検証していない。Extractor初期化も exact DTO / clock / 1件性ではなく
  session文字列の包含だけであり、invalid PCM / recognizer field / processor session /
  synthesizer invalid Raw の「wireへ出ない」testもない。実際に close timeout regression を
  見逃しているため、受け入れ条件に対して十分ではない。
- [✓] 設計文書の同期対象 — audio pipeline contract と AudioBroker 移行文書を同じ commit で更新し、
  endpoint利用、binary-only、timeout、no reconnect、Go clientが未だproduction置換ではないことを記載した。
- [✗] comment audit / comment quality — audit表は要求列と公開 symbol を概ね網羅しているが、
  `close` / `closeHandshake` comment は「設定時間を越えたらCloseNowへ切り替え、joinする」と
  実際には成立しない保証を記載しており stale / misleading である。また `baseClient.lifetimeCtx` は
  project の Go 規約が原則禁止する `context.Context` の struct 保存だが、例外が必要な理由を示す
  `// reason:` がない。変更した production file と comprehension surface は全件照合し、未照合範囲はない。
- [✓] project checks — module root の `gofmt -l .` は空、`go vet ./...`、`go test ./...`、
  `go test -race ./...`、`go mod tidy -diff` は成功した。repository root の
  `npm run gate` と `npm run tasks:check` も成功した。

`review.md` に Critical / High 指摘はなく、実装前の申し送りのうち redirect拒否、limit分類、
service名一元化、Raw再decodeは解消している。ただし close helper join の申し送りは、helperを待つ形だけで
libraryの同時Close semanticsを満たしておらず、上記の実不具合が残った。

### テスト結果

- `npm run gate`: PASS（clean SHA cache hit）
    - lint: passed
    - build/type check: passed
    - frontend test: 534 passed / 2 skipped
- `go vet ./...`: PASS
- `go test ./...`: PASS（8 package）
- `go test -race ./...`: PASS（8 package）
- `go mod tidy -diff`: PASS（差分なし）
- `gofmt -l .`: PASS（出力なし）
- `npm run tasks:check`: PASS（263 task directories）
- acceptance overlay command: **FAIL**
    - command: `go test -count=1 -overlay=... ./internal/pipeline/client -run TestAcceptanceCloseHonorsConfiguredTimeout -v`
    - `Close()` took `5.00300225s` with `CloseTimeout=30ms`
    - returned `failed to immediately close WebSocket: use of closed network connection`
- 独立検証は
  `acceptance/close_timeout_acceptance_test.go` と
  `acceptance/close_timeout_overlay.json` に保存した。overlayは検証用 test を packageへ仮想配置するだけで、
  implementation worktreeは変更していない。
- カバレッジ評価: happy pathと一部state/limitは確認できるが、受け入れ条件が列挙する並行・timeout・
  terminal error経路を十分に覆わず、実際のshutdown regressionを検出できていないため不十分。

### ドキュメント整合性

- 公開 barrel、OpenAPI、compose/env、生成物の変更はない。
- 対応設計文書
  `documents/design/contracts/audio-pipeline-websocket.md` と
  `documents/design/backend/services/audio-broker.md` は同じ commit で同期済み。
- ただし contract の「close handshakeは2秒で打ち切って強制closeする」は実装挙動と不一致である。
  文書を実装の5秒待機へ合わせるのではなく、実装を正本contractへ合わせる必要がある。

### 残課題

- `coder/websocket.Conn.Close` と `CloseNow` の同時実行 semanticsに依存せず、
  configured `CloseTimeout` で underlying connectionを確実に中断できるshutdown設計へ変更する。
  応答しない peerでも timeout付近で socket close、reader/ping/helper join、channel closeまで完了し、
  force-close競合由来の errorを返さないことを確認する。
- production既定 timeoutをコード上の正本（default config / constants等）として提供し、
  test用の正数 override と区別する。
- remote close、decode error、send timeout、ping failure、text message、event-once競合、
  close handshake timeout、parent cancel、全serviceのread/write limit境界と入力rejectを
  focused lifecycle / leak testで追加する。特に goroutine数の増減だけでなく、各ownerのdone/channelと
  server側socket closeを期限付きで観測する。
- shutdown comment / auditを修正し、実装で保証できる timeout・force-close・join順序を記述する。
  structに lifetime contextを保持する設計を維持するなら、Go規約に従い必要性と終了条件を
  `// reason:` で明示する。
