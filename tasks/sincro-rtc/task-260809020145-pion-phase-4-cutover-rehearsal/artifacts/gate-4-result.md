# Gate 4 結果

## 実行情報

- commit: `9408dd6e`（`ccc4691` を含む `origin/migration/aiortc-to-pion`）
- 実行日時: 2026-08-09T13:26:21+09:00 から 13:32+09:00
- 実行者: Codex
- 環境: `gloria@malvales.hachune.net` の `/tmp/sincromisor-gate4-rehearsal` を `origin/migration/aiortc-to-pion` から detached checkout し、既存 checkout の `.env` だけを複写した。既存 checkout は分岐しているため変更しなかった。
- 判定: FAIL

## 段階結果

### Pion image と切替前の収束

- `docker compose --project-name sincromisor --profile pion build sincro-rtc-pion` 後、Pion service だけを `--no-deps --no-build --force-recreate` した。Frontend と下流 service は rebuild しなかった。
- readiness は再作成後 5 秒で HTTP 200、`/statuses` は `sessions: 0`、metrics は `sincro_rtc_sessions_active 0` だった。

### Pion browser smoke

- Chrome: 既存 `playwright.gate3.config.ts` と `gate3-input.wav` を使い、SSH localhost tunnel 経由で実行した。offer/answer までは到達したが、3 session 全てが ICE `checking` から 15 秒で `pre_connect_timeout` となった。text、telop、非無音音声は未観測。
- session 終了後: `/statuses` は `sessions: 0`、metrics は `sessions_created_total 3`、`sessions_closed_total{reason="pre_connect_timeout"} 3`、`sessions_active 0` へ収束した。
- Firefox: 既存 Gate 3 config は `browserName: "chromium"` と Chrome executable 固定であり、host の `firefox` binary も未導入だった。新規 harness は task scope 外のため実行しなかった。
- 直接原因: SSH tunnel は signaling HTTP だけを転送する一方、browser の ICE は Pion が広告する public IPv4 の UDP 3479 へ直接送る。外部 HTTP 8001 も timeout し、Pion log に candidate pair の `connected` はない。public UDP/NAT/firewall 到達性がこの実行元から成立していない。

### 停止と rollback

- `docker compose --project-name sincromisor --profile pion stop -t 6 sincro-rtc-pion` は 1,474 ms で完了し、6 秒以内だった。
- aiortc の `full` profile は `service-initializer` が未初期化で Hugging Face model download を開始し、`sincro-rtc` は `Created` のままになった。下流 service を再初期化しない rollback 条件を満たさないため、initializer を停止した。
- Pion を `--no-deps --no-build` で復旧し、最終状態は healthy、`/health/ready` は HTTP 200、`/statuses` は `sessions: 0`。aiortc は再起動していない。
- Pion SIGKILL restart/readiness、新規 session、aiortc の Chrome/Firefox smoke は、Pion smoke の critical failure と rollback failure により未実行とした。

## 証拠と残リスク

- private evidence: VPS の `work/private-artifacts/task-260809020145-pion-phase-4-cutover-rehearsal/` に Pion log、metrics、statuses、停止時間、aiortc rollback の `ps` と log を保存した。session ID、SDP、candidate、会話、音声 payload は転載していない。
- failure原因: public UDP 3479 の到達性未成立と、aiortc rollback に必要な初期化済み service state の欠如。
- 解除条件: 外部 browser から public UDP 3479 の ICE 到達性を実証できる stable HTTPS origin と、下流 service を再初期化せず aiortc を起動できる rollback image/state を準備してから、本 runbook を最初から再実行する。
