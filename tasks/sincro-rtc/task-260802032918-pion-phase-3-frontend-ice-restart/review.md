# Review: task-260802032918-pion-phase-3-frontend-ice-restart

## 判定

NEEDS_REVISION

切断猶予が依存backend・通信契約と矛盾し、retry回数とinitial 410後の再作成契約にも一意に実装できない
Highの欠陥がある。いずれも受け入れ条件を直してから実装へ進む必要がある。

## 指摘事項

- [High] `task.md:17` はFrontendの`disconnected` graceを5秒とするが、依存backendは
  `sincromisor-server/sincro-rtc-pion-poc/internal/rtc/lifecycle.go:17-20` と
  `internal/rtc/recovery.go:5-9,24-50` で10秒grace・15秒restart deadlineを実装済みであり、
  正本契約も `documents/design/contracts/frontend-rtc.md:175-177` で10秒としている。本タスクは
  backend変更をスコープ外とし、依存backend契約をconsumeすると明記しているため、文書を「実装値」の5秒へ
  書き換える解決もできない。`task.md:17`、対応するgrace test、ドキュメント同期方針を10秒へ統一すること。
- [High] `task.md:19-22` の「最大3 attempt」と、attempt 1から500 ms・1秒・2秒という3段の
  backoffが両立していない。3回をHTTP実行総数と読むとsleepは最大2回で2秒capが使われず、
  initial 1回+retry 3回と読むとHTTP実行は4回になる。また、総30秒の残りがOffer 10秒／candidate 5秒の
  per-attempt timeout未満の場合にattemptを開始してtimeoutを残り時間へclipするかも未定義である。
  HTTP実行総数とretry数のどちらを3とするか、各失敗後に使うcap、総期限到達直前のattempt timeoutと
  terminal条件を明記し、fake clock testの期待call数・時刻を一意にすること。
- [High] `task.md:23-24` はすべての404/410で新PeerConnectionを作り、新initial Offerへ
  `previous_session_id`を必須で付けるよう読めるが、initial Offer自体もtombstone retry時に410を返す
  (`documents/design/contracts/frontend-rtc.md:159-161`、
  `sincromisor-server/sincro-rtc-pion-poc/internal/signaling/http.go:184-200`)。この410 error bodyは
  `http.go:262-264` のerror文字列だけでsession IDを返さないため、Frontendは
  `previous_session_id`を生成できず、現条件は実現不能である。update Offer／candidateの404/410と
  initial Offerの410を分け、後者で新PC・新requestを作るか、再作成を止めるか、
  `previous_session_id`を省略可能にするかを一つに確定し、それぞれをtable testへ追加すること。
- [Medium] `task.md:55` の行参照は現HEADとずれている。readonly PeerConnection bundleの実体は
  `sincromisor-frontend/src/features/rtc/rtcTalkClient.ts:20-22`、再交渉時のsession ID clearは同`:80`
  である。前提自体は正しいため、改訂時に参照だけ更新すればよい。

## 実装者への申し送り

- wire schema、revision commit、candidate queueの64件上限、legacy初回Answer、terminal generation failureの
  基本方針は、依存backend実装と共有fixtureに整合している。
- comment acceptanceは所定9列、change comprehension surface、rewrite/delete、省略理由、TODO、
  evaluatorのFAIL条件まで定義済みである。改訂後も `RTCTalkClient`、境界parser、retry、
  state/lifecycle flowを監査対象から漏らさないこと。
- 公開通信契約を変えるため、`documents/design/contracts/frontend-rtc.md` と
  `documents/design/index.md` の同期を同じ実装変更で行う条件は維持すること。
