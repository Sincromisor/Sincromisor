# Gate 5結果

## 実行情報

- `gate_5_result`: `PASS`
- 対象commit: `70af22ea5b4375189dffc46e943459acab45512e`
- VPS merge commit: `89533d3101173821819e754bd583194fbbee3bdc`
- 実行日時: 2026-08-23 04:44:36 JSTから04:56:11 JST
- 環境: `work/vps.md`のstaging VPSと、VPN接続した開発hostの下流4 service
- private evidence: VPSの
  `work/private-artifacts/task-260822233904-pion-phase-5-maintenance-cutover/attempt-1-20260823-maintenance/`

## 切替結果

- 切替前のPionはready、active session 0だった。
- 旧`pion` profileの`sincro-rtc-pion`停止は2秒、メンテナンス開始から新`rtc` profileの`sincro-rtc` readinessまでは77秒だった。
- 新service自身の起動からreadinessまでは12秒だった。
- 新serviceはTCP 8001とUDP 3479を公開し、Consulへ`RTCSignalingServer`、`10.39.2.1:8001`としてpassing登録した。
- 最終状態はPion `healthy`、readiness HTTP 200、active session 0である。下流4 serviceもすべてsession 0へ収束した。

主な実行command:

```sh
docker compose -p sincromisor --profile pion stop -t 6 sincro-rtc-pion
docker compose -p sincromisor --profile rtc build sincro-rtc
docker compose -p sincromisor --profile rtc up -d --no-deps --wait --wait-timeout 150 sincro-rtc
curl --fail --silent http://127.0.0.1:8001/health/ready
curl --fail --silent http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

## Chrome UI smoke

- stable HTTPS endpointのChromeで既存`simple-vrm` UIを使い、`sincro` talk modeの1 turnを確認した。
- ICEは`connected`、Signalingは`stable`、DataChannelは受信済みだった。
- 利用者text、応答text、telopをUIで確認した。合成音声再生中のRemote Audioは19%で非無音だった。
- Pion logはrecognizer、processor、synthesizerへ到達し、pipeline resetは0だった。
- UIから通常終了後、Pion active sessionと下流4 serviceのsessionはすべて0へ収束した。

## 問題、未観測事項、残リスク

- runtime imageに`ip` commandがなく、旧runbookのcontainer interface確認は実行不能だった。Pion readinessと実browser経路が同じnetwork前提を確認するため、重複するcommandをrunbookから削除した。
- `chat` talk modeは開発hostで停止中の外部Dify `10.39.2.8:80`へ接続できず空応答になった。Pion固有問題ではなく、Gate 5はDify不要の既存`sincro` modeで確認した。
- Chromeでは既存Frontend由来のReact snapshot更新errorとMediaPipe timestamp errorを観測したが、RTC会話経路は成立した。Pion固有critical issueは観測していない。
- Chrome UI停止はPion metricsで`reason="data_channel_error"`に3回計上された。各試行でactive sessionと下流接続は0へ収束し、利用者影響や増加し続けるresourceはないため、Gate 5を止めるcritical issueとは判定しない。
- 利用再開後の観測は2026-08-23 04:56:11 JSTから06:16:09 JSTまでの79分58秒だった。利用者がPhase 6着手を判断した時点でもPionはhealthy、active session 0で、pipeline reset、codec error、queue overflow、MessagePack errorは0だった。UI停止時の`data_channel_error`計上も3件から増えていない。
- 観測期間中にPion問題時の対応条件や未解決のPion固有critical issueへ該当しなかったため、Gate 5をPASSとする。
