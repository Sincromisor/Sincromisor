## 試行 1（2026-08-09）

production環境のPion設定値とNAT/firewall control-planeがworktreeに提供されず、Gate 4はFAILとした。既存コンテナは停止せず、実装worktreeを再開用に保持する。解除条件と直接の証拠は[Gate 4結果](artifacts/gate-4-result.md)を参照する。

## 試行 2（2026-08-09）

先行compose reviewの`NEEDS_REVISION`（Pionの固定media IPv4供給とreadiness probe）は既存実装で解消済みである。今回選択したVPS/VPN topologyでは、Pion専用local gossip agentを使わず、Consul HTTP endpointとPion登録用VPN addressをPion専用envで明示する。

## 試行 3（2026-08-09）

Pion browser smoke は public UDP 3479 の ICE 到達性不足で失敗し、aiortc rollback は未初期化の service-initializer が model download を要求したため成立しなかった。Pion は healthy・active session 0 に復旧した。直接の証拠、未実行項目、解除条件は[Gate 4結果](artifacts/gate-4-result.md)を正本とする。

## 試行 4（2026-08-09）

Pion と aiortc の両方で public Chrome から signaling、ICE または下流接続まで到達したが、実 text processor が空応答のため 1 turn 出力条件を満たさなかった。さらに Pion の `restart: always` は SIGKILL 後に restart attempt を開始しなかった。共有環境を Pion healthy・active session 0 へ戻し、原因と最小再現の証拠は[Gate 4結果](artifacts/gate-4-result.md)に記録した。コード変更は行っていない。
