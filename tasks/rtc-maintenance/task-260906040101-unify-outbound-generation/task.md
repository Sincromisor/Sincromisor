# RTC出力の世代判定を一か所へ統合する

## 背景

applyGeneration と applyGenerationError が同じロック、世代比較、音声と文字の破棄を別々に実装している。片側だけの修正で古い出力の拒否が食い違い得る。
根拠は、sincro-rtc の肥大化をレビューし、改善を順次実行するユーザー要求である。

## 完了条件

- [x] 世代判定と破棄の実装を一か所にし、通知のみ、同世代、古い世代、処理失敗の結果を維持する。
- [x] 対象の試験が通り、確認結果を本書へ記録する。

## 変更範囲と実装方針

対象は `sincromisor-server/sincro-rtc/internal/rtc/` の `outbound.go`、`outbound_generation_test.go` と、共有ロックの説明を持つ `session.go`。
既存のエラーを返す関数を共通実装にし、処理関数が nil の通知を受けられるようにする。ロック範囲と破棄順序は維持する。
通常変更として現在の作業ツリーで実装する。公開通信契約、資源の所有者、状態遷移は変更せず、局所的な重複削除または説明の修正に限定する。

## 確認方法

`sincromisor-server/sincro-rtc` で次を確認する。
世代更新による音声・文字・テロップ破棄の既存試験に、ゼロ世代、同世代、処理エラーを追加する。go test -race ./internal/rtc/...、go vet ./...、go test ./... を実行する。
Markdown は Prettier で整形し、タスク状態と索引を確認する。

## 文書同期

[現在の設計](../../../documents/design/backend/services/sincro-rtc.md)と[設計索引](../../../documents/design/index.md)の導線を確認する。通信、設定、責務の変更はなく、契約文書と Compose の更新は不要である。

## 確認結果

- 世代検査を `(bool, error)` を返す `applyGeneration` へ統合し、重複実装を削除した。世代比較、音声・文字・テロップの破棄、追加処理は従来と同じロック内で実行する。
- ゼロ世代の拒否、同世代通知で破棄しないこと、追加処理のエラー伝播を既存試験へ加えた。
- `GOCACHE=/tmp/sincro-rtc-review-go-cache go test -race ./internal/rtc -run 'TestGenerationNotification|TestSessionOutputClose|TestSynthDecodeCompletion' -count=1`: 合格。
- 権限拡張した `go test -race ./...`: RTC・パイプラインを含む各対象は合格し、データ競合の報告なし。変更前からの `TestRealManagerAcceptsLegacyInitialOffer` と `TestRealManagerRejectsMalformedNonNullCandidate` はICE候補収集の期限超過で失敗した。
- 権限拡張した `go test ./...`: 対象は合格し、前述の旧形式Offer試験だけ同じ期限超過が残った。`go vet ./...` と `gofmt -l .` は合格。各Goコマンドの `GOCACHE` は上記と同じ。
- 文書点検: PASS。コメント点検: PASS。実ブラウザーと実推論サービスによる試験は通信契約を変更しないため未実行。
