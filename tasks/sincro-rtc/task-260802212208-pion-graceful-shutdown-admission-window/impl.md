# 実装記録: task-260802212208-pion-graceful-shutdown-admission-window

## 完了時の要約

- graceful shutdownを`BeginDrain → cleanup並行開始 → 受付拒否観測窓とcleanupの完了待ち → HTTP停止`の順序へ変更した。
- 実プロセスでdraining、initial Offerの503、session 0、listener停止、process終了を順に検証した。
- 運用文書と変更理解範囲のコメントを同期し、attempt 2の最終SHA `51901d46d46004984958a54e9a1afb3d2e8e5c68`でroot 3点gateを通過した。

## 不合格分類

none

## 検証結果

- Goの局所・全体race testと`go vet ./...`はPASS。
- `npm run tasks:check`と`npm run commit:check`はPASS。
- attempt 2の最終SHA `51901d46d46004984958a54e9a1afb3d2e8e5c68`の`npm run gate`はlint / build / testの全stepでPASS。

## 未実行の確認

- なし。

## attempt 1

### 判断

- `review.md` は `APPROVED` であり、設計判断の追加や公開契約の変更は不要と判断した。
- 終了処理は、受付状態の公開を最初に行い、process owner の共通期限と listener owner の独立期限を分離した。これにより、cleanup が早く終わっても503の観測時間を短縮せず、cleanup が遅い場合もHTTP停止を含む上限を延長しない。
- `ProcessState`、`/statuses`、`/health/ready`、initial Offer response schema は既存契約を維持した。Frontend契約は変更していない。
- 実装コミットは `d1e4ddc1ae9bf3714ac4d3ca9441078c6b1c3907`。

### review.md 申し送りへの対応

- signal後の1秒の受付拒否観測窓、共通5秒のcleanup、その後の独立1秒のHTTP停止を同じ調停関数へ固定した。
- 実プロセス試験は、draining、readiness 503、新規initial OfferのHTTP 503、`sessions=0`、HTTP接続不能、子プロセス`Wait`完了を順番に観測する。接続拒否を503の代用にしていない。
- 単体試験では手動channelで観測窓を保持し、Offer ownerとManagerのcontext同一性、HTTP停止禁止、各errorの`errors.Is`、cleanupとHTTPの実deadlineを確認した。
- 運用文書はコードと同一コミットで同期した。

### 実行条件と詰まり

- `go.mod` の正本どおりGo 1.26.5を使用した。標準の`GOMODCACHE`はsandboxからlock fileを書けなかったため、準備済みの`/tmp/sincromisor-attempt4-gomodcache`と`/tmp/go1.26.5-toolchain`を使用した。これは依存不足ではなくsandboxの書き込み境界である。
- FFmpeg / FFprobe、Gate 3固定音声、root / frontendの`node_modules` symlinkを確認した。`sincromisor-frontend/.env`は展開されていなかったが、本タスクのGo試験およびFrontend gate stepはこのfileを必要としなかった。
- sandbox内のTCP bindは`operation not permitted`となったため、socketと子プロセスsignalを使う試験だけ承認済みのsandbox外実行へ切り替えた。
- `npm run gate`は最終SHAで実行したが、今回変更していない既存10個のtask artifactのPrettier不一致でlint stepが失敗した。対象には変更禁止の当該`task.md`も含まれるため整形していない。今回同期した`documents/migration/pion/rollout-and-operations.md`単体のPrettier確認は通過している。

### 検証結果

- `go test -race ./cmd/pion-poc -run '^TestProcessSIGTERM' -count=20`: PASS（77.024秒）。
- `go test -race ./...`: PASS。
- `go vet ./...`: PASS。
- `npm run tasks:check`: PASS（280 task directories）。
- `npm run commit:check`: PASS。
- `npm run gate`: FAIL。既存task artifact 10件のMarkdown format不一致で`gate:lint`停止。build / test stepは未到達。

### gate blocker解消

- オーケストレーターが基点HEADの既存Markdown 10件をPrettierで機械整形し、実装差分とは独立した`b4f5715`へ記録した。実装者は変更禁止の`task.md`や無関係task artifactを変更していない。
- `b4f5715`を実装ブランチへmergeした最終SHAは`1291324a43fe02fa17f896906783f868fd01908d`である。
- 最終SHAで`npm run gate`を再実行し、lint / build / testの全stepがPASSした。上記FAILは基点側blocker解消前の試行記録であり、最終状態の未達項目ではない。

### ドキュメント同期

- `documents/migration/pion/rollout-and-operations.md`へ、draining観測点、initial Offerの503、1秒の受付拒否観測窓、共通5秒のcleanup期限、その後の独立1秒のHTTP停止期限、process全体6秒上限、error集約を一組の運用契約として同期した。
- 公開JSON schemaとFrontend RTC契約は変更していないため、`documents/design/contracts/frontend-rtc.md`は同期不要と判断した。
- 公開バレル、生成型、配布生成物への影響はないため再生成は不要である。

### ソースコードコメント全件点検

| パス                                   | シンボル・処理群・判断           | 種類                        | 現在のコメント                                                   | 読者の疑問                                                                 | 読者に必要な知識                                                                    | 判断     | 対応または省略理由                                                                  | レビュー担当者メモ                                                            |
| -------------------------------------- | -------------------------------- | --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `cmd/pion-poc/main.go`                 | shutdown期限定数                 | 制約・時間                  | 旧`shutdownTimeout`はHTTP、Offer、sessionを同じ5秒としていた     | 1秒、5秒、1秒の各期限は何を所有し、合計上限はいくつか                      | cleanupとHTTP停止は別ownerで、観測窓はcleanupと並行する                             | 書き直し | 責務名を持つ3定数へ分離し、`shutdownProcess`の文書コメントで順序と6秒上限を説明した | 値の変更時に運用文書、期限単体試験、実プロセス試験が同時に追従するか          |
| `cmd/pion-poc/main.go`                 | `run`                            | API・処理の流れ             | 旧順序の「HTTP停止後にowner join」を説明していた                 | signal後にどの状態が外部公開され、どのownerがいつ止まるか                  | draining公開が先で、listener停止は最後である                                        | 書き直し | 古い終了順序を削除し、受付拒否観測窓と共通cleanup期限を説明した                     | `runWithBoundaries`から`serve`へ所有権が渡る流れと矛盾しないか                |
| `cmd/pion-poc/main.go`                 | `shutdownOperations`             | 生存期間・所有者            | 新規のため無し                                                   | test seamが本番の終了契約を弱めず、各関数値が何を所有するか                | 観測窓だけを実timerと手動channelで差し替え、他のownerは同じ調停を通る               | 追加     | options型の近接コメントでproduction/testの責務境界とerror集約を説明した             | 関数値の追加が公開契約、期限、失敗成果物を暗黙に増やしていないか              |
| `cmd/pion-poc/main.go`                 | `shutdownProcess`                | 処理の流れ・並行処理・error | 新規のため無し                                                   | なぜHTTPを先に止めず、cleanup contextを共有し、error後も全段階を実行するか | `BeginDrain → cleanup開始 → 観測窓とcleanup待ち → HTTP停止`、`errors.Join`、最大6秒 | 追加     | 文書コメントと処理群の分割で順序、owner、期限、並行join、error集約を局所化した      | cleanup両操作が同じcontext instanceを受け、HTTP contextが別作成されるか       |
| `cmd/pion-poc/main.go`                 | `waitShutdownAdmissionWindow`    | 代替処理・時間              | 新規のため無し                                                   | timerの1秒待機は何のためで、cancel時に何を返すか                           | 外部監督が503を観測する期間で、cleanup期限失効はerrorになる                         | 追加     | timer所有者、listener停止との前後関係、ctx errorをコメントした                      | productionだけが実timerを所有し、単体試験は手動channelを使うか                |
| `cmd/pion-poc/main.go`                 | `serve`                          | 境界・生存期間              | 旧5秒内でHTTP停止、Offer wait、session closeを順次行う説明だった | signal pathとlistener failure pathで観測窓がどう異なるか                   | signal時だけ1秒待機し、listener failure時も同じcleanup経路でownerを収束する         | 書き直し | staleな順序説明を削除し、signal/listener failureの分岐とerrorの返却先を説明した     | signal pathで`BeginDrain`が最初、listener failure pathで不要な1秒待機がないか |
| `internal/signaling/http.go`           | `ProcessState.BeginDrain`        | 状態遷移・通信境界          | HTTP accept停止前にinitial sessionを拒否する旨のみ               | `ready`と`draining`はどう変わり、なぜlistenerが残るのか                    | 状態は単調で、観測窓のinitial Offerは接続拒否でなく503になる                        | 書き直し | 公開状態、process cancelとの順序、503観測目的を追記した                             | atomic状態と`Ready()`の組み合わせが既存schemaを維持するか                     |
| `internal/signaling/http.go`           | `handleOffer`のdraining分岐      | 境界・拒否条件              | initial/update routingとvalidation順序のみ                       | draining時にupdateまで拒否するのか、registry ownerは作られるのか           | updateは既存sessionへroutingし、initialだけowner作成前に503となる                   | 書き直し | 既存コメントへdraining時の排他的挙動を追加した                                      | `session_id`分岐より後、`Resolve`より前にdraining判定があるか                 |
| `internal/signaling/http.go`           | `handleStatuses` / `handleReady` | 通信境界・観測              | 無し                                                             | listener生存とreadinessの違い、draining中に何を観測できるか                | statusesは200で状態とsession数を返し、readyは503になる                              | 追加     | 観測窓でのresponseとlistener停止前の位置を近接コメントにした                        | response schemaを変更せず、session 0をlistener停止前に観測する試験があるか    |
| `internal/signaling/offer_registry.go` | `OfferRegistry.Wait`             | 生存期間・期限              | ownerとsweeperのjoin、deadline errorを説明済み                   | Managerとは別の5秒を内部で開始するのか                                     | 自身は期限を延長せず、callerから共有contextを受ける                                 | 書き直し | process coordinatorとの共有期限と並行収束を追記した                                 | `Wait`内部に追加timeoutがなく、ctx.Errを保持するか                            |
| `internal/rtc/manager.go`              | `Manager.CloseAll`               | 生存期間・期限              | snapshot、close、join、deadline後の継続を説明済み                | Offer ownerとの共通期限を守るか、内部で期限を延長するか                    | callerのcontextだけを使用し、deadline後もcleanup goroutine自体は継続する            | 書き直し | 既存の詳細を維持しつつ、期限非延長と共有contextを追記した                           | process coordinatorが明示reasonと同一contextを渡すか                          |

### 逸脱・残リスク

- 承認済み仕様からの実装逸脱はない。
- 初回のroot 3点gateは既存の変更禁止・スコープ外task artifactが原因で未達となり、オーケストレーターへ基点文書の整形判断を引き継いだ。
- 上記root 3点gateのblockerは`b4f5715`で解消され、最終SHA `1291324a43fe02fa17f896906783f868fd01908d`ではPASSしている。
- cleanup関数値がcontextを無視して永久停止する場合は調停関数も収束できない。productionの`OfferRegistry.Wait`と`Manager.CloseAll`はcontext契約を持ち、race testと実deadline試験で確認した。

## attempt 2

### 評価FAILへの対応判断

- `eval.md`を全文確認し、実装挙動と試験は全受け入れ条件を満たしており、残課題は文書同期とコメント品質だけであることを確認した。
- shutdownの状態機械、期限、公開schemaは変更せず、評価が指定したREADME、3時間定数の宣言近接コメント、`ProcessState.BeginDrain`の文書コメントだけを修正した。
- attempt 2の追加コミットは`51901d46d46004984958a54e9a1afb3d2e8e5c68`である。

### 修正理由とドキュメント同期

- Pion READMEに残っていた「HTTP停止後にsession resourceを終了する」という逆順説明を削除し、`BeginDrain → cleanup並行開始 → 1秒の受付拒否観測窓とcleanupの完了待ち → 独立1秒のHTTP停止`へ同期した。
- READMEにOffer ownerとsession resourceの共通5秒cleanup期限、signal受信からprocess終了まで最大6秒を明記した。
- `documents/migration/pion/rollout-and-operations.md`はattempt 1で同じ契約へ同期済みであり、attempt 2では変更不要だった。Frontend RTC契約と公開JSON schemaにも変更はない。

### 検証結果

- `go test -race ./cmd/pion-poc -run '^TestShutdownProcess' -count=1`: PASS。
- `go test -race ./...`: PASS。
- `go test -race ./cmd/pion-poc -run '^TestProcessSIGTERM' -count=1 -v`: PASS。実processでdraining、initial Offer 503、session 0、HTTP停止、`Wait`完了を確認した。
- `go vet ./...`: PASS。
- `npm run tasks:check`: PASS（280 task directories）。
- `npm run commit:check`: PASS。
- 最終clean SHA `51901d46d46004984958a54e9a1afb3d2e8e5c68`の`npm run gate`: lint / build / testの全stepでPASS。

### ソースコードコメント全件点検

| パス                         | シンボル・処理群・判断    | 種類                    | 現在のコメント                                                                                  | 読者の疑問                                                             | 読者に必要な知識                                                                                                        | 判断     | 対応または省略理由                                                                                               | レビュー担当者メモ                                                                     |
| ---------------------------- | ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `cmd/pion-poc/main.go`       | `shutdownCleanupTimeout`  | 制約・時間・生存期間    | attempt 1では離れた`shutdownProcess`コメントだけが5秒期限を説明し、定数宣言近傍には無かった     | 5秒がどのownerを制限し、短縮・延長で何が失敗し、何を同期するか         | Offer ownerと全sessionが同じcontextを共有し、短縮は正常cleanupのdeadline error、延長はprocess終了上限の超過を招く       | 追加     | 定数直前へowner、短縮・延長時の失敗、Pion README、rollout運用文書、期限単体試験、実process試験の同期先を記録した | 期限変更時に`shutdownProcess`と運用上限6秒、両試験の期待値が同一commitで更新されるか   |
| `cmd/pion-poc/main.go`       | `shutdownAdmissionWindow` | 制約・時間・観測        | attempt 1では離れたtimer helperだけが1秒待機の目的を説明し、定数宣言近傍には無かった            | 窓を短く／長くした場合に503観測と終了時間へどう影響するか              | 短縮は外部監督の503見逃し、延長はcleanupが早いpathのHTTP停止遅延、cleanup期限超過値はwindow errorになる                 | 追加     | 定数直前へlistener所有範囲、誤調整時の失敗、2運用文書と2shutdown試験の同期先を記録した                           | 観測窓を変更してもcleanupとのbarrier、deadline error、実processの503観測が維持されるか |
| `cmd/pion-poc/main.go`       | `shutdownHTTPTimeout`     | 制約・時間・所有者      | attempt 1では離れた`shutdownProcess`コメントだけが独立1秒期限を説明し、定数宣言近傍には無かった | HTTP期限はcleanupと共有するのか、短縮・延長でprocess上限がどう変わるか | cleanup後に`http.Server`だけを所有し、短縮は接続終了error、延長は5秒との合計6秒上限超過になる                           | 追加     | 定数直前へ独立owner、誤調整時の失敗、2運用文書と期限・実process試験の同期先を記録した                            | contextがcleanup後に新規作成され、値変更時にprocess全体上限も更新されるか              |
| `internal/signaling/http.go` | `ProcessState.BeginDrain` | API・状態遷移・通信境界 | attempt 1で状態公開、cancelとの順序、503観測目的を英語で説明していた                            | `go doc`で契約を読めるか、内部Goコメントの日本語方針に適合するか       | exported symbol名から始め、ready=false、単調draining、listener維持、initial Offer 503の関係を日本語で説明する必要がある | 書き直し | 内容を失わず`BeginDrain は...。`から始まる日本語の完全な文へ更新した                                             | `coding-go.md` §12とGo doc comment形式を満たし、接続拒否と503を区別しているか          |

### 逸脱・詰まり・残リスク

- 承認済み仕様と評価指示からの逸脱はない。
- attempt 2は文書・コメントだけの修正であり、実装コード、公開schema、生成物、依存関係は変更していない。
- socketを使うrace testと実process試験はattempt 1と同じsandbox外実行境界を使用し、環境不備と実装不良を分離した。
- 未実行確認はない。
