# Evaluation: task-260802032922-pion-phase-3-observability-gate-3

## 判定

FAIL（attempt 3）

attempt 2で残っていたqueue gauge、panic時signaling metric、reconnect terminal result、
OfferRegistry/Session callbackのpanic収束、Offer lifecycle/pipeline transition log、
commentとfocused coverageの各問題は解消された。

ただし、構造化logを`session_id`、`reason`、`stage`、`count`だけに制限する受け入れ条件に対し、
`cmd/pion-poc/main.go`のprocess lifecycle logに許容外fieldが残るため、PASSにはできない。

## 受け入れ条件チェックリスト

- [✓] `statuses` — `GET /api/v1/RTCSignalingServer/statuses`は
  `sessions`、`session_limit`、`ready`、`draining`だけをJSONで返し、非GETは405。
  `TestOperationalEndpointsAndDrainAdmission`で確認した。
- [✓] health — liveは200、readyはstartup完了かつ非drainingで200、それ以外503。
  下流Python serviceの一時障害をprocess readinessへ混ぜていない。
- [✓] metrics — private Prometheus registryに固定20 familyをname/type/unit/label/bucketどおり登録し、
  production eventへ接続している。attempt 3では次を追加確認した。
    - input queueはslice、ownership delta、close/popを同じmutexで直列化し、並行pop/closeでも
      gaugeが負にならず0へ戻る。
    - HTTPは`observeHTTP(recoverHTTP(mux))`となり、panicで確定した500もsignaling count/latencyへ
      exactly once記録する。
    - reconnectは`start`ごとに`sync.Once` ownerが`success|failure`を必ず1件記録する。
    - gather/close deadline、session close duration、RTCP quality、pacing/codec、
      queue/DataChannelの増減callerも再照合した。
- [✗] privacy / structured log — metric labelは有限集合へ正規化され、session ID、SDP、
  candidate、chat/音声本文を使わない。payload marker、Offer request ID、pipeline transition
  `from`/`to`の漏えいもfocused testで除去を確認した。一方、
  `cmd/pion-poc/main.go:183-188`は`http`、`frontend_dir`、`initial_goroutines`、
  `:201`は`signal`、`:216-219`は`active_sessions`、`final_goroutines`をstructured fieldとして
  出力する。受け入れ条件が許容する`session_id|reason|stage|count`以外である。
- [✓] panic境界 — Session所有のRTCP/inbound/outbound/pipeline goroutine、
  connection/ICE/track/DataChannel/open/close/deadline callback、pipeline client
  read/ping/finalize、DataChannel worker、resource closer、initial Create、
  Offer owner/sweeper/wait helper、HTTP requestを照合した。`notifyClosed`はcallback panic後も
  registry removal、active gauge解放、close counter/duration、done closeを継続する。
  task列挙stageと追加first-party helperのpanic injectionも通過した。
- [✓] startup / shutdown — Frontend dir、FFmpeg probe、timeout/queue/cache/session上限を
  listener前に検証する。shutdownは`BeginDrain`を最初に公開し、drain中initial Offerを503、
  HTTP accept停止、Offer owner join、Session CloseAllを共通5秒deadline内で行う。
- [✓] RTCP — SR/RR/NACK/otherを分類し、未知feedback/unmarshal failureではsessionを閉じない。
  RR loss ratioとcompact-NTP RTTを記録し、予期しないread終了は
  `media_read_error`とclose metricへ収束する。
- [✗] comment audit / comment品質 — attempt 3の変更surfaceについて、
  queue ownership、reconnect metric transaction、HTTP response commit、Offer worker join、
  callback terminal publication、output observer境界のコメントは実装と一致し、対象固有の
  reader knowledgeを説明している。しかし9列auditは、変更対象
  `cmd/pion-poc/main.go`をprocess composition/drain wiringとしてだけ扱い、同fileの
  structured-log fieldをprivacy surfaceとして列挙・判断していない。
  実装者の「許容語彙へ正規化した」という総括とも上記実コードが一致しないため、
  全件auditの受け入れ条件を満たさない。

## 前回FAIL指摘別の解消状況

- [✓] input queueのdequeue/close/reset ownershipとgauge 0復帰。
- [✓] panic HTTP responseの5xx count/latency。
- [✓] reconnect `start`のexactly-one terminal result。
- [✓] OfferRegistry owner/sweeper/wait helperとSession `onClosed` callbackのpanic収束。
- [✓] `offer_request_id`とpipeline transition `from`/`to`の通常log除去。
- [✓] `responseBuffer`、OutputProcessor observer、Offer/pipeline/queueのコメントと9列audit。
- [✓] task列挙stageおよび追加first-party workerのfocused panic coverage。
- [✗] structured log全体のfield whitelist — process lifecycle logが未修正・未監査。

## テスト結果

- `npm run gate` — PASS。HEAD
  `1a9c9771863eba62145f554f2d024bead56933bd`、clean treeで
  lint/build/testすべて同一SHAのcache hit。
- `/tmp/go1.26.5-toolchain/bin/go test -race ./internal/... ./cmd/pion-poc` — PASS
  （11 package）。最初のsandbox内実行はloopback/netlinkの`operation not permitted`だけで
  失敗したため、同一HEAD・同一コマンドを許可済み境界で再実行して全package PASS。
- focused `go test -race -count=10` — PASS（pipeline、pipeline/client、rtc、signaling）。
  queue pop/close、reconnect/Close競合、pipeline client 3 worker、Session全列挙stage、
  onClosed、Offer owner/sweeper/wait、HTTP panic/partial responseを反復した。
- `/tmp/go1.26.5-toolchain/bin/go vet ./...` — PASS。
- `/tmp/go1.26.5-toolchain/bin/go mod tidy -diff` — PASS（差分なし）。
- `/tmp/go1.26.5-toolchain/bin/gofmt -d <変更Go files>` — PASS（出力なし）。
- `npm run tasks:check` — PASS
  （273 task、open=4、done=267、superseded=2）。
- `git diff --check` — PASS。
- カバレッジ評価 — 前回不足していたconcurrent gauge 0復帰、reconnect terminal、
  panic HTTP metric、Offer/Session callbackとtask列挙panic stageは十分に補強された。
  残るFAILはテスト不足による推測ではなく、production log callの静的な契約違反である。

## Comment audit照合

- 照合範囲: base `d11c72bb8bdda7bdada53fbf262e5cf8ec710ee9`からattempt 3 HEADまでの
  production Go 31 file、変更test 9 file、公開契約文書2 fileを対象にした。
  attempt 3 deltaはproduction 9 fileの変更symbol/block/decision/flowを全件照合した。
- 未照合範囲: Pion、Prometheus、websocket library内部goroutineはtask明記どおり非対象。
- 残リスク: library内部の実装変更に伴うruntime挙動はunit/race testsの範囲に限定される。
  合否を左右する未照合production surfaceはない。

## ドキュメント整合性

- 公開契約変更あり、同期済み。
- `documents/design/contracts/frontend-rtc.md`はPion版statusesの4 field、405、
  cleanup非実装を同期している。
- `documents/migration/pion/rollout-and-operations.md`はhealth semantics、private registry、
  privacy、固定20 metricのexact schemaとownership、最大5秒のdrainを同期している。
- attempt 3は公開HTTP/metric schemaを変更せず、文書化済みのpanic response計測と
  queue ownershipへ実装を一致させたため追加同期は不要。
- 生成物・公開barrelの変更はなく再生成対象なし。ドキュメント未同期はない。

## 残課題

- `cmd/pion-poc/main.go`の3つのprocess lifecycle logから
  `http`、`frontend_dir`、`initial_goroutines`、`signal`、`active_sessions`、
  `final_goroutines`を除去するか、受け入れ条件が許容する
  `reason` / `stage` / `count`へ意味を保って正規化する。
- process lifecycle logをprivacy/change-comprehension surfaceとして9列comment auditへ追加し、
  対象固有のreader question、required knowledge、keep/rewrite判断と実コードを一致させる。
- captured structured-log testをprocess lifecycleへ広げ、許容field名のallow-list assertionを追加する。

## 過去attemptの評価証拠

- attempt 1（HEAD `d7f5b37ab83aa2b38837562539b892ba778cdbf9`）は、
  production metric caller、RTCP quality、recover、HTTP partial response、privacy、
  comment/doc、focused coverageの不足でFAIL。
- attempt 2（HEAD `a93b85e9070283461d43b57459f92961cdf03595`）は、
  input queue gauge競合、panic HTTP metric欠落、reconnect terminal欠落、
  OfferRegistry/Session callback recover漏れ、`offer_request_id`/`from`/`to` log、
  comment audit不一致とcoverage不足でFAIL。
- attempt 3は上記attempt 2残課題をすべて解消したが、今回特定したprocess lifecycle logの
  field whitelist違反が残るためFAIL。
