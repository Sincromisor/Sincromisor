# 評価: task-260907221335-rtc-host-consul-agent

## 判定

PASS

## 根拠

- `0dad179e` と `690e36fd` を対象に確認した。`rtc` は `consul-agent-rtc` と `sincro-rtc` だけを選択し、RTCは同居エージェントのHTTP 8500へ依存する。`full` は既存サーバーを維持する。
- 全現行エージェントは固有のLANゴシップポートとTCP/UDPの同値公開を持つ。サーバーのRPC TCP 8300とLANゴシップ TCP/UDP 8301は管理先へ限定され、HTTP 8500はRTCエージェントからホストへ公開されない。空の公開先はループバックになる。
- `examples/compose.env`、README、Compose・Consul設計、運用資料を同期した。旧Consul HTTP設定と具体的な運用接続先は手順書から除去され、既存の診断記録も維持されている。Markdown点検: PASS。
- `node --test scripts/tests/consul-compose.test.mjs` はPASSした。`npm run gate` はPASSした。
- 実機の両ホストで、全10メンバーが `alive`、RTCエージェントはhealthy、HTTP 8500は非公開であることを確認した。相互のRTC登録、RTCからの下流4サービスのpassing探索とHTTP到達を確認した。
- 各RTCをセッション0でSIGTERM停止し、同居エージェントとカタログから当該登録が消え、他ホストの登録だけが残ることを確認した。再起動後は両RTCがreadyへ復帰した。

## 残課題

なし
