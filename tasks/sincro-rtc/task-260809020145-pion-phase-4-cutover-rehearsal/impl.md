## 試行 1（2026-08-09）

production環境のPion設定値とNAT/firewall control-planeがworktreeに提供されず、Gate 4はFAILとした。既存コンテナは停止せず、実装worktreeを再開用に保持する。解除条件と直接の証拠は[Gate 4結果](artifacts/gate-4-result.md)を参照する。

## 試行 2（2026-08-09）

先行compose reviewの`NEEDS_REVISION`（Pionの固定media IPv4供給とreadiness probe）は既存実装で解消済みである。今回選択したVPS/VPN topologyでは、Pion専用local gossip agentを使わず、Consul HTTP endpointとPion登録用VPN addressをPion専用envで明示する。
