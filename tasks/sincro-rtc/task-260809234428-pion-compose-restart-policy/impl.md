## 判断

- `deploy.restart_policy` は単一hostのCompose v2でcontainer restart policyを設定しないため、Pionだけを `restart: always` に補完した。
- VPSでは `docker kill` が明示停止としてrestartを抑止することを実測した。原本は `work/private-artifacts/task-260809234428-pion-compose-restart-policy/` の `prechange-20260809T145223Z.txt`、`docker-kill-20260809T145636Z.txt`、`recreate-20260809T145614Z.txt` に保存した。
- 更新済みComposeで `--no-build --no-deps --force-recreate` 後、`RestartPolicy=always` とready/statuses（`sessions: 0`）への復旧は確認済み。host PIDへのSIGKILLはVPS作業ユーザーがsudo passwordを必要とするため未実測である。
- 受け入れ条件は `docker kill` ではなく、権限を持つ運用者によるhost PID SIGKILL後の `RestartCount` 増加とready/statuses復旧へ改訂が必要である。
