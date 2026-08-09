# 評価: task-260809234428-pion-compose-restart-policy

## 判定

FAIL

## 根拠

- 受け入れ条件 1: private artifact に VPS の merged Compose config、image digest、`HostConfig.RestartPolicy=always`、kill 前後の state / `StartedAt`、Docker events が保存されている。`docker-kill-20260809T145636Z.txt` は `docker kill` 後に `RestartCount=0`、`exited`、`kill` / `die` のみであることを示すため、Docker の明示 kill が restart policy を抑止する直接原因は特定できている。
- 受け入れ条件 2・3: `docker kill` 後の自動再起動、`RestartCount` 増加、ready / statuses への自動復帰は未実測である。VPS の healthy 復旧は explicit recovery 後の `ready_http=200` と `{"sessions":0,"session_limit":10,"ready":true,"draining":false}` に限られる。`process-kill-root-20260809T145757Z.txt` も `RestartCount=0` と不変の `StartedAt` であり、host PID SIGKILL と再起動を立証していない。
- 受け入れ条件 4: `/tmp/eval-115877887f3a-wzuJH6` で `npm run gate` を実行した。dirty 状態の同一キャッシュを使用し、lint、build、test はすべて PASS（579 passed、2 skipped）。
- 候補差分は `compose/sincro-rtc.yml` の `restart: always` と、Compose / Pion 運用文書 3 件の同期であり、公開 API・通信契約の変更はない。候補差分は未コミットのまま実装 worktree にのみ存在し、メイン作業ツリーへのマージは確認されなかった。

## 残課題

- VPS の権限を持つ運用者が、更新済み Pion を `--no-build --no-deps` で起動後、host namespace の container PID に SIGKILL を実行し、`RestartCount` が1以上増加して30秒以内に `/health/ready` と `/statuses`（`sessions: 0`）へ自動復帰する証跡を保存すること。成功後に候補差分をコミットし、同一差分で再度 `npm run gate` を確認すること。
