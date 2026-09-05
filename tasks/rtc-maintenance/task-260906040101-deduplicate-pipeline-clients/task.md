# 下流クライアントの共通処理の重複を削減する

## 背景

4種類のクライアントが同じ復号結果の配送、Events、Close を複製し、3種類は Connect の転送も複製している。共通接続処理があるのに修正箇所が分散している。
根拠は、sincro-rtc の肥大化をレビューし、改善を順次実行するユーザー要求である。

## 完了条件

- [x] 共通の結果配送と接続操作を一か所にし、4種類の入力検証、結果型、初期化順序、通信サイズ上限を維持する。
- [x] 対象の試験が通り、確認結果を本書へ記録する。

## 変更範囲と実装方針

対象は `sincromisor-server/sincro-rtc/internal/pipeline/client/` の4種類のクライアント、共通接続処理、関連試験。
既存の `baseClient` を埋め込み、共通メソッドを利用する。結果配送だけは4種類で共用する小さな型引数付き関数にする。接続の状態遷移、終了順序、待機方式は変えない。
通常変更として現在の作業ツリーで実装する。公開通信契約、資源の所有者、状態遷移は変更せず、局所的な重複削除または説明の修正に限定する。

## 確認方法

`sincromisor-server/sincro-rtc` で次を確認する。
既存の4サービスの通信・終了・入力検証試験と、結果配送の中断確認を実行する。go test ./internal/pipeline/...、go test -race ./internal/pipeline/...、go vet ./...、go test ./... で確認する。
Markdown は Prettier で整形し、タスク状態と索引を確認する。

## 文書同期

[現在の設計](../../../documents/design/backend/services/sincro-rtc.md)と[設計索引](../../../documents/design/index.md)の導線を確認する。通信、設定、責務の変更はなく、契約文書と Compose の更新は不要である。

## 確認結果

- 既存の `baseClient` を埋め込み、`Connect`・`Events`・`Close` の共通操作を利用する形にした。Extractorの初期化と各サービスの送信検証は維持し、結果配送だけを `decodeResults` へ集約した。
- `GOCACHE=/tmp/sincro-rtc-review-go-cache go test -race ./internal/pipeline/...`: 全パッケージ合格。4サービスの送受信形式、初期化、サイズ上限、接続・終了競合を含む。
- 追加した `TestResultDeliveryCanCancelWithoutConsumer` は `go test -race ./internal/pipeline/client -run TestResultDeliveryCanCancelWithoutConsumer -count=1` で合格。実際のMessagePack固定データを復号し、受け手がいない配送を中断できることを確認した。
- `go vet ./...` と `gofmt -l .`: 合格。各Goコマンドの `GOCACHE` は上記と同じ。
- 権限拡張した `go test ./...`: パイプラインとRTCを含む対象は合格。変更前からの `TestRealManagerAcceptsLegacyInitialOffer` のICE収集期限超過が残る。
- 文書点検: PASS。コメント点検: PASS。実ブラウザーと実推論サービスによる試験は通信契約を変更しないため未実行。
