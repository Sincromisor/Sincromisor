# RTC起動処理の説明を実装の配置へ合わせる

## 背景

serveBoundary の説明がログ関数に付き、shutdownOperations と serve の説明が別ファイルの末尾に残っている。ログ関数の説明も server.go の末尾にあり、分割後のコードを誤読させる。
根拠は、sincro-rtc の肥大化をレビューし、改善を順次実行するユーザー要求である。

## 完了条件

- [x] 起動、HTTP提供、終了処理、ログの説明を対応する宣言に置き、一般的な日本語で実際の所有関係を読めるようにする。
- [x] 対象の試験が通り、確認結果を本書へ記録する。

## 変更範囲と実装方針

対象は `sincromisor-server/sincro-rtc/cmd/sincro-rtc/{main,startup,server,shutdown}.go`。
起動順序や終了処理は変更しない。説明が孤立しないよう、ログ関数を使用側の `server.go` にまとめ、期限定数も使用する起動・終了処理のファイルへ寄せる。新しいファイルは増やさない。
通常変更として現在の作業ツリーで実装する。公開通信契約、資源の所有者、状態遷移は変更せず、局所的な重複削除または説明の修正に限定する。

## 確認方法

`sincromisor-server/sincro-rtc` で次を確認する。
gofmt と go vet ./...、go test ./cmd/sincro-rtc、go test ./...、変更した文書とコメントの点検を行う。
Markdown は Prettier で整形し、タスク状態と索引を確認する。

## 文書同期

[現在の設計](../../../documents/design/backend/services/sincro-rtc.md)と[設計索引](../../../documents/design/index.md)の導線を確認する。通信、設定、責務の変更はなく、契約文書と Compose の更新は不要である。

## 確認結果

- `serveBoundary`、`shutdownOperations`、`serve` の説明を対応する宣言の直前へ戻した。3つのログ関数は `server.go`、終了期限は `shutdown.go`、Consul探索期限は `startup.go` にまとめた。
- 関数本体、定数値、呼び出し順、ログ項目は変更していない。起動と終了の所有関係、ログに含める情報を一般的な日本語で説明した。
- 権限拡張した `GOCACHE=/tmp/sincro-rtc-review-go-cache go test ./...`: 全パッケージ合格。`cmd/sincro-rtc` の実プロセス起動、Consul登録解除、SIGTERM、ログ項目の既存試験を含む。
- `GOCACHE=/tmp/sincro-rtc-review-go-cache go vet ./...`、`gofmt -l .`: 合格。
- 文書点検: PASS。コメント点検: PASS。実ブラウザーと実推論サービスによる確認は通信と起動動作を変更しないため未実行。
- 先行タスクと変更前確認で発生したICE収集試験の時間切れは、最後の通常試験では発生しなかった。既存試験の実行時間の揺れ自体を修正したものではない。
