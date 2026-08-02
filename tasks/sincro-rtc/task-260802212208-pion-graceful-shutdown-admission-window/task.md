# Pion graceful shutdown中の新規受付拒否を観測可能にする

## 背景 / 目的

現行PionプロセスはSIGTERM受信後に`draining`へ遷移するが、直後にHTTP listenerの停止も始めるため、
外部監督から「既存sessionを終了中で、新規initial Offerだけを503で拒否する」状態を決定的に観測できない。
Gate 3ハーネスへ競合回避を持ち込まず、本番プロセスの終了順序そのものを運用契約に合わせる。

## 完了条件（受け入れ条件）

- [ ] SIGINTまたはSIGTERM受信後、`ProcessState.BeginDrain()`を最初に実行し、1秒の受付拒否観測窓が
      終わるまでHTTPリスナーを維持する。この間、`/health/ready`は503、`/statuses`は
      `ready=false, draining=true`、新規initial Offerは503を返す。
- [ ] `cancelProcess()`、`OfferRegistry.Wait()`、`Manager.CloseAll(..., "process_shutdown")`を
      signal受信時から共通の5秒期限で並行して収束させる。1秒の観測窓とこの終了処理の両方が終わった後、
      `http.Server.Shutdown()`を開始する。
- [ ] HTTP停止には1秒の独立期限を与え、signal受信からprocess終了までの最大時間を6秒とする。
      期限超過または各終了処理のerrorを正常終了として隠さず、`errors.Join`したerrorを`run`へ返す。
- [ ] 実行ファイルを子プロセス起動する結合テストで、active session成立後のSIGTERM、
      draining観測、新規initial Offerの503、既存session数0、HTTP接続不能、子プロセス`Wait`完了を
      この順序で確認する。draining観測から503応答までは1秒の観測窓内、全終了は6秒以内とする。
- [ ] `cmd/pion-poc/main.go`へprivateな`shutdownProcess`調停関数を追加し、観測窓、共通cleanup context、
      Offer registry、Manager、HTTP停止の各操作を関数値で受け取る。単体テストで各操作のerror、
      複数errorの`errors.Is`、5秒期限の共有、1秒窓より早いHTTP停止禁止を決定的に確認する。
- [ ] 本番コードと変更理解範囲について`documents/rules/source-comments.md`所定の全件点検を
      `impl.md`へ記録し、終了順序、所有者、共通期限、error集約を未来の変更者が追えるコメントへ更新する。

## 設計判断（着手前に確定済み）

- 終了順序は`BeginDrain → cleanup開始 → 1秒観測窓とcleanupの完了待ち → Server.Shutdown`に固定する。
  `Server.Shutdown`を先に始める現行順序は503を外部観測できないため採用しない。
- `OfferRegistry.Wait`と`Manager.CloseAll`は同じdeadlineを持つcontextを共有し、別goroutineで開始する。
  個別に5秒ずつ与えない。両処理が早く終わってもsignal受信から1秒になるまでリスナーを閉じない。
- `Server.Shutdown`には前段終了後に新しい1秒のHTTP停止用contextを与える。
  最大時間はcleanup 5秒とHTTP停止1秒の合計6秒である。
- `shutdownProcess`の最小契約は`BeginDrain func()`、`CancelProcess func()`、
  `WaitOffers func(context.Context) error`、`CloseSessions func(context.Context,string) error`、
  `ShutdownHTTP func(context.Context) error`、`WaitAdmissionWindow func(context.Context) error`とする。
  productionでは最後の関数だけが1秒timerを所有し、試験では手動channelで順序を制御する。
- `ProcessState`やHTTP response schemaは変更しない。`/statuses`の既存`draining`を観測点に使い、
  新しい管理endpointやsignal専用tokenは追加しない。

## スコープ境界

- 本タスク: `cmd/pion-poc`の終了順序、実プロセス結合テスト、関連コメント、運用文書。
- 依存タスク: session、Offer registry、観測指標の既存終了契約。
- スコープ外: supervisor実装、Gate 3ハーネス、Frontend、session上限、compose切替。

## 高リスク統合タスクの追加設計

| 段階           | listener | initial Offer | 既存session操作            | 終了所有者                               |
| -------------- | -------- | ------------- | -------------------------- | ---------------------------------------- |
| ready          | 受付中   | 受理          | 受理                       | process                                  |
| draining観測窓 | 受付中   | 503           | 終了処理中のため合否対象外 | process context、Offer registry、Manager |
| HTTP停止後     | 停止     | 接続不能      | 接続不能                   | `http.Server`                            |

`BeginDrain`より前に受理済みのinitial OfferはOffer registryの所有物として共通期限内に完了または失敗させる。
観測窓内の新規initial Offerだけが503であり、接続拒否は合格値にしない。update Offerとcandidateは
終了処理との競合結果を公開契約にせず、本タスクの合否対象外とする。

## 実装方針（既存コード整合: file:line）

- `sincromisor-server/sincro-rtc-pion-poc/cmd/pion-poc/main.go:150-213`がsignal待機と終了順序を所有する。
- `sincromisor-server/sincro-rtc-pion-poc/internal/signaling/http.go:73-94`の`ProcessState`は
  drainingを単調状態として保持する。
- 同ファイル`:200-236`はinitial Offerだけをdraining時503へ変換し、`:303-340`は
  `/statuses`とreadinessを公開する。これらの通信schemaは変更しない。
- `sincromisor-server/sincro-rtc-pion-poc/cmd/pion-poc/main_integration_test.go:22`の
  実プロセスSIGTERM試験を拡張し、handler単体試験だけで完了しない。

## テスト

- module rootで`go test -race ./cmd/pion-poc -run '^TestProcessSIGTERM' -count=20`を通し、
  20回すべてでdraining、503、`/statuses`のsession 0、listener停止、子processの`Wait`完了を確認する。
- `shutdownProcess`単体テストは各依存error、複数error、cleanup期限超過、HTTP停止期限超過、
  観測窓未完了を網羅し、`errors.Is`と呼出時刻・共有deadlineを記録する。
- `go test -race ./...`、`go vet ./...`、root `npm run gate`、`npm run tasks:check`を通す。
- 評価時は実行ファイルを使う結合テストの観測値を必須とし、`ProcessState`単体の503だけでは合格にしない。

## ソースコードコメント受け入れ条件

`cmd/pion-poc/main.go`の`run`、`serve`、終了処理と、それを理解するために読む`ProcessState`、
Offer registry、Managerの直接の終了APIを変更理解範囲とする。`impl.md`の点検表は規約所定の9列を持ち、
終了順序・期限・error・listener所有権を説明できない古いコメントを維持しない。

## ドキュメント同期の要否

要。`documents/migration/pion/rollout-and-operations.md`へdraining中の観測点、initial Offerの503、
signal受信から1秒の受付拒否観測窓、5秒のcleanup期限、その後の1秒のHTTP停止期限、
process全体で最大6秒となるlistener停止順序を反映する。Frontend契約と公開JSON schemaは変わらないため
`documents/design/contracts/frontend-rtc.md`は変更しない。

## 文書の言語

説明文は一般的な日本語を用い、識別子、HTTP status、signal名、ファイル名だけ原表記を残す。
