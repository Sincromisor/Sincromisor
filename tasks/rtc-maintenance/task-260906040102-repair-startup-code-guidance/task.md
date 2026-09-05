# RTC起動処理の説明を実装の配置へ合わせる

## 背景

serveBoundary の説明がログ関数に付き、shutdownOperations と serve の説明が別ファイルの末尾に残っている。ログ関数の説明も server.go の末尾にあり、分割後のコードを誤読させる。
根拠は、sincro-rtc の肥大化をレビューし、改善を順次実行するユーザー要求である。

## 完了条件

- [ ] 起動、HTTP提供、終了処理、ログの説明を対応する宣言に置き、一般的な日本語で実際の所有関係を読めるようにする。
- [ ] 対象の試験が通り、確認結果を本書へ記録する。

## 変更範囲と実装方針

対象は `sincromisor-server/sincro-rtc/cmd/sincro-rtc/{main,startup,server,shutdown}.go`。
起動順序や終了処理は変更しない。説明が孤立しないよう、ログ関数を使用側の server.go にまとめる。新しいファイルは増やさない。
通常変更として現在の作業ツリーで実装する。公開通信契約、資源の所有者、状態遷移は変更せず、局所的な重複削除または説明の修正に限定する。

## 確認方法

`sincromisor-server/sincro-rtc` で次を確認する。
gofmt と go vet ./...、go test ./cmd/sincro-rtc、go test ./...、変更した文書とコメントの点検を行う。
Markdown は Prettier で整形し、タスク状態と索引を確認する。

## 文書同期

[現在の設計](../../../documents/design/backend/services/sincro-rtc.md)と[設計索引](../../../documents/design/index.md)の導線を確認する。通信、設定、責務の変更はなく、契約文書と Compose の更新は不要である。
