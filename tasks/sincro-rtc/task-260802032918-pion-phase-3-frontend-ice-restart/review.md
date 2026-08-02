# Review: task-260802032918-pion-phase-3-frontend-ice-restart

## 判定

APPROVED

前回のblocking High 3件はすべて解消され、改訂箇所にも新たな破綻はない。
10秒grace、retryの実行回数・期限、operation別404/410処理は既存backend契約と一意に整合する。

## 指摘事項

- なし。

## 実装者への申し送り

- `disconnected` graceはbackendの
  `sincromisor-server/sincro-rtc-pion-poc/internal/rtc/lifecycle.go:17-20`、
  `internal/rtc/recovery.go:5-9,24-50` および
  `documents/design/contracts/frontend-rtc.md:175-177` と同じ10秒として実装する。fake clock testでは
  10秒内の復帰と10秒超過後のrestartを区別し、連続eventでsingle-flightが崩れないことも固定する。
- retryは最大4 HTTP実行（initial 1回 + retry 3回）であり、失敗した実行1/2/3の後に
  500 ms/1秒/2秒capを順に適用する。Offer 10秒／candidate 5秒のtimeoutを30秒総期限の残時間へclipし、
  sleepが残時間以上なら次のHTTP実行を開始しない条件を、call数とfake clock時刻までtestで固定する。
- typed HTTP errorのoperationを失わないこと。initial Offerの410はterminal、update Offer/candidateの
  404/410だけは既知の旧session IDを`previous_session_id`に付けた新bundleのinitial Offerへ遷移する。
  backendのinitial tombstone 410は
  `sincromisor-server/sincro-rtc-pion-poc/internal/signaling/http.go:184-200,262-264`、
  operation別statusの既存testは
  `internal/signaling/http_test.go:228-246,259-278,365-366,446-468` を参照する。
- 前回指摘したFrontendの行参照は現HEADと一致している。readonly bundleは
  `sincromisor-frontend/src/features/rtc/rtcTalkClient.ts:20-22`、session ID clearは同`:80`である。
- 公開通信契約の変更として、`documents/design/contracts/frontend-rtc.md` と
  `documents/design/index.md` の同期、およびtask.md所定schemaのcomment auditを受け入れ条件どおり行うこと。
