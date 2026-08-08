# Gate 4 結果

## 実行情報

- commit: `a44d3080454eac18d07a3a6f1f24e29e666de88b`
- 実行日時: 2026-08-09T05:24:42+09:00
- 実行者: Codex
- 環境: host外向き経路は`eth0`の`172.20.134.175`から`172.20.128.1`経由。外部観測IPは`130.62.3.81`だが、NAT forwardとfirewall control-planeは確認権限がない。
- 判定: FAIL（production相当環境の必須前提未充足）

## 段階結果

### 切替前確認

- 開始: 2026-08-09T05:24:42+09:00
- 終了: 2026-08-09T05:24:42+09:00
- command: `ip -4 route get 1.1.1.1`; `ip -4 -o addr show scope global`; `curl https://api.ipify.org`; `curl https://ifconfig.me/ip`; `ss -lun`; `docker compose --project-name task260809020145-rehearsal --profile pion config`
- 結果: 外部IPは2つの照会で`130.62.3.81`に一致した。一方、`SINCRO_COMPOSE_NETWORK_SUBNET`、`SINCRO_PION_FFMPEG_PATH`、`SINCRO_PION_STUN`、`SINCRO_PION_CONTAINER_IPV4`、`SINCRO_PION_MEDIA_UDP_PORT`、`SINCRO_PION_PUBLIC_IPV4`、`SINCRO_PION_INTERFACE`が未設定で、compose configは`no port specified: :/udp`（exit 1）となった。nftablesとiptablesの規則参照も権限不足で失敗した。
- 未観測事項: 固定UDP port、container固定IPv4、host公開interface、NAT静的forward、inbound/return firewall許可。`127.0.0.1:8001`のstatusesも接続不可（curl exit 7）で、既存aiortc sessionは観測できない。

### aiortc停止とPion readiness

- 開始: 未実行
- 終了: 未実行
- aiortc既存session: 未観測（stable endpoint未起動）
- Pion readiness: 未実行
- 結果: 切替前のproduction networkとcompose設定が未検証のため、既存コンテナを停止しなかった。
- 未観測事項: aiortc停止、Pion起動、Consul登録、readiness。

### Pion smoke test

- 開始: 未実行
- 終了: 未実行
- Chrome: 未実行（`google-chrome`は存在するがstable endpointと媒体・認証条件がない）
- Firefox: 未実行（binary未導入）
- session終了後の収束: 未観測
- 結果: 前段未達のため未実行。
- 未観測事項: 接続、1 turn、text、telop、非無音音声、statuses/metrics収束。

### Pion crash復旧

- 開始: 未実行
- 終了: 未実行
- restart/readiness: 未観測
- 新規session: 未観測
- 結果: Pion未起動のため未実行。
- 未観測事項: restart policyによる復旧と新規session受理。

### Pion停止とaiortc復旧

- 開始: 未実行
- 終了: 未実行
- Pion停止所要時間: 未観測
- aiortc smoke test: Chrome / Firefoxとも未実行
- 結果: Pion未起動のため未実行。
- 未観測事項: 6秒以内の停止、aiortc rollback、browser smoke。

## 証拠と残リスク

- private evidence: なし（containerを作成・停止していない）。
- failure原因: production compose環境変数とNAT/firewall control-planeへのアクセスが提供されていない。hostのprivate送信元と外部観測IPの差からNAT配下であることは確認できるが、指定UDP portのforward先と許可規則は検証不能。
- 残リスク: 実環境のPion接続、media、crash restart、rollbackはすべて未検証。解除条件は、実環境の必須Pion環境変数、NAT静的forwardとfirewall許可の確認権限、Chrome/Firefoxと媒体・認証を備えたstable endpointを提供すること。
