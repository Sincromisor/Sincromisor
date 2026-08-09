# Pion pipeline reset起点を記録する

## 背景 / 目的

手動確認で、`recognizer_result_received`の直前に4下流serviceのWebSocketが一斉に切断・再接続した。
`Coordinator.requestReset`は全connectionを閉じるsingle-flight境界だが、受理したresetの発生元をPionログへ
記録しないため、最初のclient eventとresetを関連付けられない。

## 完了条件（受け入れ条件）

- [ ] `requestReset`がresetを受理したときだけ、`pipeline_reset_requested`の構造化`Warn`ログを1件出力する。
- [ ] ログには`stage`、`session_id`、`service`、`cause`、`generation`だけを含める。client eventによる場合の
      `cause`は既存の有限な`EventKind`、loop内の失敗による場合は`runtime_error`とする。
- [ ] `connectionSet.watch`自身のpanicは監視中clientの`Service`を持つ`EventPanic`としてhandlerへ渡す。
      serviceを空にしたresetを受理しない。
- [ ] stale generation、closed、または既にreset中でrejectされた呼出では上記ログを出さない。reset/reconnect、
      metrics、channel・lock・closeの既存動作は変えない。
- [ ] loggerをcaptureするGo testで、clientの`remote_close`によるaccepted reset、runtime error、stale resetを
      区別し、error本文・認識本文・chat本文・音声payloadがログに含まれないことを確認する。
- [ ] `connectionSet.watch`のpanic callbackが、監視対象clientの`Service`を持つ`EventPanic`をhandlerへ渡すことを
      `internal/pipeline/client/set_test.go`で確認する。
- [ ] 手動Gate 4では対象`session_id`をkeyに、正常stageの直前に出た最初の`pipeline_reset_requested`から
      下流connectionを閉じたserviceと原因を確認できる。

## 設計判断

- `requestReset`へ固定のcauseだけを渡し、raw errorをログへ出さない。接続eventは`EventKind`をそのまま使い、
  その他の既存call siteは`runtime_error`を使う。新しい設定、metric、error type、reconnect policyは追加しない。
- `connectionSet.watch`を登録するときに監視対象clientの`Service`を明示的に渡す。watcher panicも、実際に停止した
  clientをreset起点として記録できるようにする。
- accepted resetだけを記録する。stale callbackのログを増やさず、single-flightの実際の所有者を1回で特定できるようにする。

## スコープ境界

- 本タスク: `onClientEvent`、`connectionSet.watch`、`requestReset`の原因分類、payload非出力test、Pion runbookの確認手順同期。
- 本タスク外: 下流serviceのclose原因の修正、WebSocket retry/reconnect仕様、DataChannel、browser test、
  Gate 4再実行、VPS deploy。

## 実装方針

- `internal/pipeline/reset.go`をreset受理の唯一のログ境界にし、`connect.go`のclient eventと
  `runtime.go`の直接call siteから有限causeを渡す。`internal/pipeline/client/set.go`はwatcher panicに
  監視中clientのserviceを設定する。
- 既存の`watch`呼出testは新しいservice引数へ機械的に追随させ、watcher panicが伝えるserviceを個別に検証する。
- `internal/pipeline/observability_test.go`のcapture loggerを再利用する。変更理解範囲として、
  `requestReset`のlock取得、generation advance、`PipelineReconnect` metric、`baseClient.EventKind`を確認し、
  log追加以外の状態遷移を変更しない。

## テスト

- `go test ./internal/pipeline`でaccepted/stale resetとpayload非出力を検証する。
- `go test ./...`、`go vet ./...`、`gofmt -l .`をPion moduleで実行する。
- repository全体の`npm run gate`を実行する。

## ドキュメント同期の要否

要。`documents/migration/pion/phase-4-cutover-runbook.md`とPion READMEへ、`pipeline_reset_requested`を
`session_id`で確認する方法と、payloadをGit artifactへ転載しない制約を追記する。通信契約、設定、composeの変更はない。
