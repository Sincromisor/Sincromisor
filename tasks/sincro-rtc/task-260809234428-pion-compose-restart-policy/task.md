# Pion container crash復旧の原因を特定して解消する

## 背景 / 目的

Gate 4で `docker kill sincromisor-sincro-rtc-pion-1` を実行したところ、container は
exit 137、`RestartCount: 0` のまま停止した。repositoryの`compose/sincro-rtc.yml`は
Swarm用の`deploy.restart_policy`だけを定義する一方、VPSで実行したcontainerには既に
`restart=always` が入っていた。Compose定義、merged override、Docker Engineのいずれが
実効状態を決めたかは未確定である。

Pion containerがSIGKILL後に自動復帰し、readinessと新規session受理へ戻らない直接原因を
特定し、責任範囲の設定または運用手順で解消する。

## 完了条件（受け入れ条件）

- [ ] VPSで使用するproject / profile / merged Compose config、image digest、`docker inspect` の
      `HostConfig.RestartPolicy`、kill前後のstate / StartedAt、`docker events`を同一時刻基準で
      private artifactへ保存し、restart未発火の直接原因を特定する。
- [ ] 原因に対応する最小変更後、VPSの更新済みPionを `--no-build --no-deps` で起動し、`docker kill` から
      自動再起動が1回以上発生し、`/health/ready` と `/statuses` が HTTP 200・`sessions: 0` へ復帰する。
- [ ] 自動復帰後に、既存health / statuses endpointで新規受付可能なready状態まで戻ることを確認する。
      browserによる新規session受理とproduction 1 turnは、監査でoracleを決定後のGate 4再実行で確認する。
- [ ] `npm run gate` が成功する。

## 設計判断

原因を確認するまで、`restart`、override、Compose project、Docker daemonをいずれも
原因と断定しない。対象はcontainer processのSIGKILL後の復旧であり、healthcheck失敗や
Docker daemon障害をrestart policyだけで解消することは求めない。

## スコープ境界

- 本タスク: Pion service のrestart設定、runbook / 運用文書の設定根拠、VPSでのSIGKILL実測。
- スコープ外: aiortc・Consul・下流serviceのrestart方針、systemd導入、restart回数上限、Pionの
  session復元、Gate 4の1 turn出力問題。

## 実装方針

原因がrepository管理下なら`compose/sincro-rtc.yml`と運用文書を最小変更する。外部overrideや
Docker daemonが原因なら、設定供給元と再現条件を記録し、必要な運用変更を明示する。
`docker compose config`、`docker inspect`、Docker events、health/statuses endpointを観測点にする。
SIGKILL失敗時は証拠を保存してからPionをhealthyへ復旧する。

## テスト

- VPSで実効Compose / inspect / eventsを採取し、SIGKILL、自動復帰、ready/statusesを実測する。
- `npm run gate` を実行する。

## ドキュメント同期の要否

要。`documents/migration/pion/phase-4-cutover-runbook.md` と
`documents/migration/pion/rollout-and-operations.md` のrestart確認手順を、原因と実効する
設定 / 運用手順へ同期する。通信契約は変更しない。
