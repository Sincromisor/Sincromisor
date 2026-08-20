# 評価: task-260809020145-pion-phase-4-cutover-rehearsal

## 判定

PASS

## 根拠

- コミット `3b2efaf` は Gate 4 実行コミット `9408dd6e` の結果だけを更新しており、`artifacts/gate-4-result.md`、`impl.md`、`documents/migration/pion/roadmap.md` が同じ変更で同期されている。公開 API・通信契約・公開挙動の変更はない。
- 受け入れ条件の未達は Gate 4 の必須 FAIL として明示されている。Chrome の3 session は offer/answer 後に ICE `checking` から15秒で `pre_connect_timeout` となり、public UDP 3479 の NAT/firewall 到達性不足、text/telop/非無音音声未観測、Firefox 未実行を記録している。
- rollback は `service-initializer` が未初期化で model download を開始し、aiortc `sincro-rtc` が `Created` のままになった直接原因と、下流 service を再初期化しない条件に反するため中止した判断を記録している。解除条件として外部 browser からの UDP 3479 到達性と、下流再初期化なしで aiortc を起動できる state を定め、runbook 全体を再実行する。
- Pion は停止後に `--no-deps --no-build` で復旧し、最終状態 healthy、`/health/ready` HTTP 200、`/statuses` の `sessions: 0` を記録している。Chrome 失敗後も metrics の active session 0 と close reason `pre_connect_timeout` 3件への収束を記録している。
- 実装 worktree は index・作業ツリーとも clean、コミット差分は上記3文書のみである。`npm run gate` は `3b2efaf` の clean cache を使用し、lint、build、test（579 passed、2 skipped）を全て通過した。

## 残課題

- なし

## 試行4（2026-08-21）

### 判定

PASS

### 根拠

- コミット `6ff42d9` はtask記録と移行文書だけを変更しており、公開API、通信契約、本番コードの変更はない。したがってソースコメント点検は対象外である。
- `artifacts/gate-4-result.md` は、PionでのICE `connected`、1 turnの利用者/応答text、telop、非無音音声、通常終了、終了後の`/statuses` `sessions: 0`、stage countと`reset: 0`、Frontend・下流serviceをrebuildしない切替、最終Pion healthy/readiness/statusを記録する。改訂後のtask受け入れ条件と一致し、aiortcの`disconnected`は診断情報・残リスクとして限定されている。
- `documents/migration/pion/`はGate 4、runbook、検証計画、運用手順、roadmapをforward-fix方針へ同じ変更で同期している。`rg`で確認した残存`rollback`は、aiortcを運用rollback先にしない旨または会話成立をGate対象外とする旨の否定記述だけである。browser matrixをaiortc baselineがある場合だけ別task化するスコープ制限は、Gate 4必須条件ではない。
- `git diff --check 6ff42d9^ 6ff42d9`、`npm run tasks:check`、`npm run tasks:index:check`はPASSした。frontendの`check`、`build`、`test`はこの専用worktreeと元worktreeに必要な実行ファイルがなく再実行できなかったが、評価対象は文書変更のみであり、コミット記録の既存確認を否定する根拠はない。

### 残課題

- なし
