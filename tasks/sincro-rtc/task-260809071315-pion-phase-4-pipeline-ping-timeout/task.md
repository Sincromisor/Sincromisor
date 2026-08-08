# Pion下流WebSocketのfalse ping timeoutを解消する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

Gate 4 VPS リハーサルで、Pion が既存 Python 下流4サービスへ張る WebSocket が接続後約18秒で
一斉に切断・再接続された。Pion の `ping interval=10s` と `ping timeout=5s` の失敗が
Coordinator generation reset を起こし、SpeechRecognizer の partial (`confirmed=false`) 結果が
TextProcessor/TTS へ到達する前に破棄される。

TCP/WebSocket の read/write/remote close で接続障害を検出する既存経路は維持しつつ、
Python service が応答しない application ping を下流 client から除く。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] Pion pipeline client は、binary messageを受信せず Ping に応答しない peer に対し、
      ping timeout だけで terminal event / generation reset を起こさない。
- [ ] remote close、read failure、write timeout、decode failure の既存 terminal event と
      Coordinator reconnect は維持する。
- [ ] Config・client 実装・関連テスト・コメントから不要になった ping timeout 契約を除く。
- [ ] `go test ./...` と `npm run gate` が成功する。

## 設計判断

下流 connection は Pion session の存続中だけ利用する private WebSocket であり、read/write error と
remote close は既に terminal event になる。互換性のない独自 Ping worker とその設定値を削除する。
接続ごとの keepalive interval を新設しない。

## スコープ境界

対象は `sincro-rtc-pion-poc/internal/pipeline/client` の lifecycle と単体テスト。
Python 下流サービス、WebRTC ICE keepalive、compose、VPS 設定、cutover 判定は対象外。

## 実装方針

`baseClient.connect` の read worker / finalize worker の所有関係を保ったまま Ping worker を除去する。
`TestPingFailureIsTerminalWhenPeerDoesNotRead` を、非応答 peer が接続を維持する確認へ置換し、
既存 lifecycle failure test を read/write/close 検出の回帰として再利用する。

## テスト

- `go test ./internal/pipeline/client ./internal/pipeline`
- `go test ./...`
- `npm run gate`

## ドキュメント同期の要否

不要。下流 WebSocket の既存 MessagePack / endpoint 契約は変えず、Pion 内部の liveness 実装だけを変える。
