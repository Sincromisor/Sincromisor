# 評価: task-260822233904-pion-phase-5-maintenance-cutover

## 判定

切替・smoke checkpoint: PASS

Gate 5最終判定: OBSERVING（taskはopenのまま）

## 根拠

- 実装commit `70af22e` とVPS merge `89533d3` により、旧 `sincro-rtc-pion` を停止後、`rtc` profileの通常service `sincro-rtc` へ切り替えた。旧service停止は2秒、メンテナンス開始から新service readinessまでは77秒だった。
- 新serviceはTCP 8001とUDP 3479を公開し、Consulへ `RTCSignalingServer` / `10.39.2.1:8001` としてpassing登録された。healthy、`/health/ready`、`/statuses`、および下流4 serviceのsession 0収束を確認した。
- stable HTTPS endpointのChrome UIで、`sincro` modeの1 turnについてICE `connected`、signaling `stable`、DataChannel受信、利用者・応答text、telop、19%の非無音Remote Audio、Pion pipelineのrecognizer / processor / synthesizer到達、pipeline reset 0を確認した。通常終了後にPionと下流4 serviceのsessionは0へ収束した。
- aiortc動作確認は、Pion移行を前提として不要と確定済みであり、判定対象外である。
- runtime imageに存在しない `ip` commandをrunbookから削除した。readinessと実browser smokeがnetwork成立の確認を担うため、削除後の手順は実行可能である。

## 残課題

- 最終Gate 5は、利用者がPhase 6着手を判断するまでの安定化観測中であり、PASSにしない。Pion問題時の対応条件への該当、または未解決のPion固有critical issueがあれば、証拠を保存してforward-fix taskを起票する。
- Chrome UIの通常停止3回は `sessions_closed_total{outcome="failed",reason="data_channel_error"}=3` と記録された。ただし各回で会話は成立し、registry・下流4 serviceは0へ収束し、reset / reconnect loop / resource増加もないため、現在の問題条件には該当しない。終了理由の計測精度は観測中の残リスクとして維持する。
- `chat` modeの空応答は停止中の外部Difyへの接続失敗であり、Pion固有ではない。React snapshot更新errorとMediaPipe timestamp errorも既存Frontend由来で、今回確認したRTC会話経路を阻害していない。
