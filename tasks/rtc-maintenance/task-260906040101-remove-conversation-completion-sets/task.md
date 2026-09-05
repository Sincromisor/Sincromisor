# 会話処理の不要な完了済みID集合を削除する

## 背景

conversation.closed は発話IDの単調増加検査と重複する。finalized は最終応答で requests を削除する検査と重複し、どちらも世代が終わるまで増え続ける。
根拠は、sincro-rtc の肥大化をレビューし、改善を順次実行するユーザー要求である。

## 完了条件

- [x] 完了済みIDの集合を削除し、古い発話、重複最終応答、最終応答後の途中応答の拒否を維持する。
- [x] 対象の会話試験が通り、変更範囲外の既存失敗も区別して本書へ記録する。

## 変更範囲と実装方針

対象は `sincromisor-server/sincro-rtc/internal/pipeline/` の `conversation.go` と `coordinator_conversation_test.go`。
既存の発話IDと未完了要求だけで拒否を判断する。会話履歴、世代更新、ロック範囲、入出力契約は維持する。
通常変更として現在の作業ツリーで実装する。公開通信契約、資源の所有者、状態遷移は変更せず、局所的な重複削除または説明の修正に限定する。

## 確認方法

`sincromisor-server/sincro-rtc` で次を確認する。
会話試験に発話の再利用と最終応答後の遅延応答を追加し、go test ./internal/pipeline と go vet ./...、go test ./... を実行する。
Markdown は Prettier で整形し、タスク状態と索引を確認する。

## 文書同期

[現在の設計](../../../documents/design/backend/services/sincro-rtc.md)と[設計索引](../../../documents/design/index.md)の導線を確認する。通信、設定、責務の変更はなく、契約文書と Compose の更新は不要である。

## 確認結果

- `closed` と `finalized` を削除した。発話の再利用、進行中発話への古い入力、最終応答後の途中応答を既存試験へ追加し、拒否を確認した。
- `GOCACHE=/tmp/sincro-rtc-review-go-cache go test ./internal/pipeline -run 'TestConversation|TestCoordinatorForwardsEachExtractorPartialWithoutAccumulation' -count=1`: 合格。
- `GOCACHE=/tmp/sincro-rtc-review-go-cache go vet ./...` と `gofmt -l .`: 合格。
- 権限拡張した `GOCACHE=/tmp/sincro-rtc-review-go-cache go test ./...`: 変更対象を含む各パッケージは合格。`internal/signaling` の `TestRealManagerAcceptsLegacyInitialOffer` だけ、ICE候補収集の期限超過で504となった。変更前はこの試験と `TestRealManagerRejectsMalformedNonNullCandidate` が同じ理由で失敗しており、今回の変更による悪化は確認されない。
- 文書点検: PASS。コメント点検: PASS。変更文書のPrettier確認は合格。
- 実ブラウザーと実推論サービスによる試験は、通信と資源の所有関係を変更しないため未実行。既存のICE収集試験の不安定さが残る。

レビューの根拠と4件の改善単位は[肥大化レビュー](code-review.md)に記録した。
