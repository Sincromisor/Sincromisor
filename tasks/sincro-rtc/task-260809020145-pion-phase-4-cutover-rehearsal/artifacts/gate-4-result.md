# Gate 4 結果

## 実行情報

- commit: `9408dd6e`（`ccc4691` を含む `origin/migration/aiortc-to-pion`）
- 実行日時: 2026-08-09T23:58+09:00 から 2026-08-10T00:05+09:00
- 実行者: Codex
- 環境: `gloria@malvales.hachune.net` の `/tmp/sincromisor-gate4-rehearsal`。public IPv4、TCP 8001、固定 UDP 3479、VPS VPN 経由の既存下流 4 service を使用した。
- 判定: FAIL

## 段階結果

### Pion 切替、Chrome smoke、収束

- Pion は `running/healthy`、readiness HTTP 200、`/statuses` は `sessions: 0` で開始した。public HTTPS origin の Chrome fake microphone smoke では offer/candidate と ICE `connected` まで到達した。
- 実下流 service は利用者発話を受理したが、text processor の応答は空で、合成対象も生成されなかった。このため、利用者/応答 text、telop、非無音の合成音声を含む 1 turn は不成立だった。
- Chrome session 終了後は Pion の `/statuses` と `sincro_rtc_sessions_active` がともに 0 へ収束した。resource 増加は既存 observability からは観測されなかった。
- Firefox は、Chrome の必須 1 turn が不成立となった時点で追加実行しなかった。

### Pion process restart

- `docker kill sincromisor-sincro-rtc-pion-1` を実行した。container の restart policy は `always` だが、exit 137 のまま `RestartCount: 0` で自動復帰せず、readiness と新規 session 受理は確認できなかった。
- 復旧優先で `docker compose --project-name sincromisor --profile pion up -d --no-build --no-deps sincro-rtc-pion` を実行し、Pion を healthy、`sessions: 0` に戻した。

### aiortc rollback

- Pion 停止後、`docker compose --project-name sincromisor --profile full up -d --no-build --no-deps sincro-rtc` で aiortc を起動した。rollback readiness まで 5,473 ms で、`SINCRO_CONSUL_AGENT_HOST` は VPS VPN の既存 Consul endpoint を参照していた。Frontend と下流 service は rebuild していない。
- Chrome fake microphone smoke は signaling、利用者発話、下流 4 service 接続まで到達したが、実 text processor の応答が空のため、応答 text、telop、非無音の合成音声を確認できなかった。Firefox は同じ必須条件が Chrome で不成立のため未実行とした。
- aiortc 停止後に Pion を再起動し、最終状態は Pion `running/healthy`、readiness HTTP 200、`/statuses` は `sessions: 0` である。

## 証拠、直接原因、復旧

- private evidence: VPS の `work/private-artifacts/task-260809020145-pion-phase-4-cutover-rehearsal/` に command、時刻、container state、metrics、statuses、Pion/aiortc log を保存する。session ID、SDP、candidate、会話、音声 payload は転載しない。
- 直接原因 1: 実環境の text processor が空の応答を返し、voice text もないため、両 backend の 1 turn 出力条件が不成立だった。
- 直接原因 2: `restart: always` が設定された Pion container は SIGKILL 後に Docker の restart attempt を開始せず、exit 137 のまま停止した。
- 復旧: shared service 影響を止めるため aiortc rollback 確認後、Pion を `--no-build --no-deps` で再起動して healthy・active session 0 へ戻した。
- 解除条件: text processor が非空の応答を返す production 相当下流状態と、SIGKILL 後に restart policy が実際に Pion を自動復帰する Docker/compose 状態を用意してから、本 runbook を最初から再実行する。
