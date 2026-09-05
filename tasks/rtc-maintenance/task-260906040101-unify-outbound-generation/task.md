# RTC出力の世代判定を一か所へ統合する

## 背景

applyGeneration と applyGenerationError が同じロック、世代比較、音声と文字の破棄を別々に実装している。片側だけの修正で古い出力の拒否が食い違い得る。
根拠は、sincro-rtc の肥大化をレビューし、改善を順次実行するユーザー要求である。

## 完了条件

- [ ] 世代判定と破棄の実装を一か所にし、通知のみ、同世代、古い世代、処理失敗の結果を維持する。
- [ ] 対象の試験が通り、確認結果を本書へ記録する。

## 変更範囲と実装方針

対象は `sincromisor-server/sincro-rtc/internal/rtc/outbound.go と outbound_generation_test.go`。
既存のエラーを返す関数を共通実装にし、処理関数が nil の通知を受けられるようにする。ロック範囲と破棄順序は維持する。
通常変更として現在の作業ツリーで実装する。公開通信契約、資源の所有者、状態遷移は変更せず、局所的な重複削除または説明の修正に限定する。

## 確認方法

`sincromisor-server/sincro-rtc` で次を確認する。
世代更新による音声・文字・テロップ破棄の既存試験に、ゼロ世代、同世代、処理エラーを追加する。go test -race ./internal/rtc/...、go vet ./...、go test ./... を実行する。
Markdown は Prettier で整形し、タスク状態と索引を確認する。

## 文書同期

[現在の設計](../../../documents/design/backend/services/sincro-rtc.md)と[設計索引](../../../documents/design/index.md)の導線を確認する。通信、設定、責務の変更はなく、契約文書と Compose の更新は不要である。
