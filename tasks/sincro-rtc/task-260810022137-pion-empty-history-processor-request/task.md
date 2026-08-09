# Pion初回Processor requestの空historyを正規化する

## 背景 / 目的

Pionの初回partial認識後、`processor_request_sent`の前にTextProcessorの`runtime_error` resetが起きる。
`Coordinator`のconfirmed historyは初回発話で`nil`だが、`cloneMessages`も`nil`を返すため、
`EncodeProcessorRequest`が要求するnon-nilの`history.messages`を満たさない。requestは送信前に失敗し、
下流connectionがresetされる。

## 完了条件（受け入れ条件）

- [ ] 初回の`confirmed=false`認識結果から作る`ProcessorRequest.History.Messages`が、長さ0かつnon-nilとなる。
- [ ] `cloneMessages`はnil入力をnon-nilの空sliceへ正規化し、非nil入力は値をcopyする既存所有権を維持する。
- [ ] 初回partial認識でProcessor requestが送信され、`processor_request_sent`まで到達する回帰testを追加する。
- [ ] non-nil required collectionを拒否する既存wire contract、confirmed history、reset/reconnect、外部APIは変更しない。

## 設計判断

- `cloneMessages`の空値だけを正規化する。TextProcessor wire contractを緩めず、Coordinatorが既存contractを満たす値を作る。
- 新しいfallback、設定、ログ、metric、browser testは追加しない。

## スコープ境界

- 本タスク: `internal/pipeline/conversation.go`の空history正規化と、初回partial Processor requestの回帰test。
- 本タスク外: TextProcessor、MessagePack schema、下流WebSocket lifecycle、Pion logging、VPS deploy、Gate 4再実行。

## 実装方針

- `cloneMessages`が返すsliceを常にnon-nilにする。呼出元で個別に補正しない。
- 既存の`fakeFactory`とCoordinator testを再利用し、初回partialのProcessor requestを観測する。payload本文は新たなlogやartifactへ出さない。

## テスト

- `go test ./internal/pipeline`で初回partial requestとclone所有権を検証する。
- `go test ./...`、`go vet ./...`、`gofmt -l .`をPion moduleで実行する。
- repository全体の`npm run gate`を実行する。

## ドキュメント同期の要否

不要。既存のProcessor wire contractを変更せず、Coordinator内部でrequired collectionを満たすようにする修正である。
