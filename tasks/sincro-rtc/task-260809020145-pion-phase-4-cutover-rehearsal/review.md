# レビュー: task-260809020145-pion-phase-4-cutover-rehearsal

## 判定

NEEDS_REVISION

## 根拠

- 依存task `task-260809124736-pion-inbound-eof-session-close` は `done` / `PASS` であり、現在HEADの `ccc4691` は入力RTPの `io.EOF` を既存の `Session.Close("normal")` に集約し、registry収束を確認するin-memory WebRTC回帰testを追加している。cutover runbookも、Pion / aiortc のsmoke、crash復旧、6秒shutdown、収束観測を受け入れ条件どおりに定義している。
- staging VPSは Pion readiness、`/statuses`の`{"sessions":0,...}`、`sincro_rtc_sessions_active 0`、TCP 8001 / UDP 3479公開、HTTPS origin、VPN経由のConsul discoveryと下流4 serviceへの到達性を満たしている。restart policyも `always` である。
- ただし現在stagingで稼働するimageは `2026-08-08T21:46:40Z` 作成（containerも同時刻）で、修正commit `ccc4691`（`2026-08-09T12:55:05+09:00`）より前である。remote checkoutも `64589c1d` のままで、正常EOF close修正を含むimageがdeployされていない。この状態の`active=0`はcontainer再起動による既存session消滅であり、修正の実環境検証にはならない。

## リハーサル時の重点確認

- `ccc4691`を含むPion imageをstagingへdeployしてから、新規browser sessionを正常終了させ、`/statuses`と`/metrics`のactive session・下流接続が0へ収束することを確認する。この条件を満たせない限りGate 4をPASSにしない。
- deploy後に、固定container IPv4、public IPv4 `163.44.97.57`、UDP 3479、外向きinterface、NAT forward/firewallを再照合し、ChromeとFirefoxのPion/aiortc双方のsmoke、SIGKILL後のrestart/readiness、新規session、6秒shutdownを実施する。
