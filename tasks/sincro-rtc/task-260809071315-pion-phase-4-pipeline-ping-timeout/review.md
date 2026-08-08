# レビュー: task-260809071315-pion-phase-4-pipeline-ping-timeout

## 判定

APPROVED

## 理由・申し送り

- 完了条件は、非応答 peer での terminal event 非発生と、remote close・read/write・decode failure の既存 reset 経路維持として検証可能である。必須確認は成功を条件とし、失敗を記録するだけで完了できる契約にはなっていない。
- 現行 `internal/pipeline/client` では `baseClient.connect` が reader / ping / finalize の生存期間を所有し、`terminal` が最初の failure を `connectionSet` 経由で Coordinator の generation reset へ渡す。ping worker と `PingInterval` / `PingTimeout`、`EventPingFailed` はこのパッケージ内だけにあり、削除範囲は一意である。
- `internal/pipeline/websocket_integration_test.go` の reset matrix は remote close と decode failure からの4接続再確立・generation 更新を検証済みであり、client の lifecycle failure test と合わせて既存契約を回帰できる。公開 WebSocket / MessagePack / endpoint 契約は変更しないため、設計文書同期は不要である。
- 実装では `documents/rules/source-comments.md` を直接参照し、worker 数・join・connection lifetime を説明する ping 前提コメントを reader / finalize の実態に合わせて更新すること。Ping worker 削除後は WaitGroup の加算数と `finalizeWhenCanceled` の join が reader だけを待つことを確認する。

## 自律補完

- `AUTO_FIX`: `TestPingFailureIsTerminalWhenPeerDoesNotRead` の置換テストは、非応答 peer に対して短い有限の観測期間 `Events()` が通知されず、明示 `Close` で正常に終了することを確認する。ping 設定値をテスト用 Config に残さず、削除後の Config だけを組み立てる。これは既存の client 所有権・明示 shutdown 契約から一意に決まり、公開契約や責務分担を変えない。
