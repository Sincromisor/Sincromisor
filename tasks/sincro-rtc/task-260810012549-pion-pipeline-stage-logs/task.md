# Pion pipeline正常系の段階ログを記録する

## 背景 / 目的

Gate 4の手動確認でPionはICE `connected`となりSpeechRecognizerのpartial結果も観測できたが、Pionの
正常系ログにはその後のProcessor、Synthesizer、outboundへの到達点がない。そのため、text、telop、音声が
出ない原因をpayloadを保存せずに一回の会話で切り分けられない。

## 完了条件（受け入れ条件）

- [ ] `internal/pipeline/runtime.go`の正常系で、`recognizer_result_received`、`processor_request_sent`、
      `processor_result_received`、`synthesizer_result_received`を、それぞれ1発話につき1件の`Info`構造化ログとして記録する。
- [ ] 各ログには`stage`、`session_id`、`speech_id`または`sequence_id`、`confirmed`だけを含める。Processor結果には
      `end_of_response`と`voice_text_present`を追加してよい。認識本文、chat本文、VoiceText、音声byte列、Raw payload、
      SDP、candidateを含めない。
- [ ] `confirmed=False`のRecognizer結果だけで止まる場合と、各後続stageへ到達する場合を、
      loggerをcaptureするGo testで区別できる。既存のreset、queue、DataChannel、wire contractの挙動は変えない。
- [ ] 手動Gate 4では、対象sessionをkeyにPionログから上記stageの最後の到達点を確認できる。

## 設計判断

- `Coordinator`の既存`slog.Logger`を再利用し、設定、metric、harness、外部APIを追加しない。
- 発話本文と音声はログに出さない。`session_id`は既存session lifecycle logと同じ運用上の相関IDとして使い、
  message IDやpayloadのhashは追加しない。
- telopはmoraごとの高頻度イベントであるため成功ログを追加しない。Synthesizer結果受信までをPion pipelineの
  最終成功到達点とし、DataChannelの失敗は既存error/metricで観測する。

## スコープ境界

- 本タスク: Pion Coordinator正常系の最小ログ、payload非出力test、運用文書の観測点同期。
- 本タスク外: Python下流serviceのログ変更、DataChannelの機能変更、新規metric、browser automation、
  Gate 4の再実行、Pion imageのVPS deploy。

## 実装方針

- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/runtime.go`で、既存loopが境界payloadを受理または
  送信した直後に、発話ごとの固定stageを記録する。`SynthesizerResult`にはsession IDがないため、Coordinator所有の
  `sessionID`とresultの`speech_id`を使う。
- `internal/pipeline/observability_test.go`のcapture loggerパターンを再利用し、成功stageと禁止payloadが
  logへ現れないことを確認する。実装前に変更理解範囲として`conversation.go`、`protocol/dto.go`、
  `publish`のgeneration barrierを確認し、ログ追加で状態遷移やchannel所有権を変えない。

## テスト

- `go test ./internal/pipeline`で、各正常stageとpayload非出力を検証する。
- `go test ./...`、`go vet ./...`、`gofmt -l .`をPion moduleで実行する。
- repository全体の`npm run gate`を実行する。

## ドキュメント同期の要否

要。`documents/migration/pion/rollout-and-operations.md`、Pion README、
`documents/migration/pion/phase-4-cutover-runbook.md`へ、手動切り分け用stage、`session_id`での確認方法、
payloadを出力・Git artifactへ転載しない制約を追記する。通信契約、設定、composeの変更はない。
