# Pion Phase 3のFrontend ICE restart状態機械を実装する

## 背景 / 目的

現行Frontendはpreferred session IDだけを再送し、candidate失敗を握り潰すため、revision競合や
session消失を判別できない。Pionの冪等signalingを利用するsingle-flight状態機械を実装し、
rollback期間のrevisionなしaiortc Answerもinitial接続に限って許容する。

## 完了条件（受け入れ条件）

- [ ] initial Offerは `crypto.randomUUID()` のrequest IDとrevision 1を持ち、同じHTTP retryでは
      payload/SDP/request IDを変えない。新しいSDPを生成するときだけ新request IDを発行する。
- [ ] update Offerは同じsession/request IDとcurrent+1 revisionを使い、成功するまでcurrentを進めない。
      Answerのsession/revision不一致はprotocol errorとしてnegotiationを中止する。
- [ ] Offer生成・送信・candidate flushはPeerConnection単位でsingle-flightであり、update Answerまでは
      そのrevisionのcandidateを最大64件FIFOへqueueする。overflow/Offer失敗はqueueを破棄してgenerationを失敗させる。
- [ ] `disconnected` は10秒grace中のconnected/completed復帰ならrestartしない。`failed` は即時、
      grace超過は1回だけICE restartを開始し、連続eventでも並行Offerを作らない。
- [ ] Offerは10秒、candidateは5秒のAbortController timeoutを持つ。HTTP実行は最大4回
      （initial 1回 + retry 3回）、総30秒とする。429/5xx/network errorだけ再送し、失敗したHTTP実行
      1/2/3の後はそれぞれ500 ms/1秒/2秒をcapとするfull jitter `[0, cap]` で待つ。
      `Retry-After` があればjitterより優先する。各HTTP実行のtimeoutはOffer 10秒/candidate 5秒と
      総期限までの残時間の小さい方へclipする。残時間が0以下、またはsleep時間が残時間以上なら
      新しいHTTP実行を開始せずterminal failureにする。同じserialized bodyを全4回で再利用する。
- [ ] update Offer/candidateの404/410はserver session消失としてcandidateを破棄し、既知の旧session IDを
      `previous_session_id`に付けた新initial Offerを、新しいPeerConnection/DataChannelと新request IDで送る。
      initial Offer自体の410はresponseからsession IDを復元できないため自動再作成せずterminal failureとする。
      409はblind retryせず現negotiationを中止する。
- [ ] revisionなしAnswerはinitial接続をlegacy modeとして受理する。legacy modeの切断はupdate Offerを送らず、
      新しいPeerConnectionでinitial接続し、Pion用状態機械をaiortcへ要求しない。
- [ ] 400/409/413、response parse/identity不一致、またはretry exhaustionは当該negotiation/generationの
      candidate queueを全破棄し、PeerConnectionをcloseしてhealth/UIへterminal errorを通知する。
      update/candidateの404/410によるbundle replacement以外では新sessionを自動作成せず、再試行は明示的な
      AppController start/page reloadを待つ。candidateが最大4回のHTTP実行後も失敗した場合も、
      candidate単体dropではなく同じterminal generation failureにする。
- [ ] stop/track replacement/reconnect timerとの競合でclosed PeerConnectionへcandidate/Offerを送らない。
- [ ] change comprehension surfaceのcomment auditを所定schemaで記録し、state、request identity、
      revision commit、candidate ownership、retry/status分岐、legacy modeを説明する。

## 設計判断（着手前に確定済み）

- `rtcNegotiationStateMachine.ts` に `idle|initializing|connected|restartPending|restarting|replacing|closed`、
  current request/session/revision、candidate generationを集約する。
- wire schemaはinitial/update Offerに `offer_request_id: string`、`offer_revision: number`、
  candidateに `offer_revision: number`、Answerにoptional `offer_revision` を持つ。
  Pion modeではrevision必須、legacy判定はinitial Answerでfieldが欠けた場合だけとする。
- `RTCTalkClient` のreadonly PeerConnection bundleをreplace可能なprivate ownershipへ変え、
  session消失時だけfactoryから新bundleを作る。既存PC上に新sessionをfallback作成しない。
- HTTP helperはstatusをtyped errorへ変換し、candidate senderでcatchして握り潰さない。
- jitterはtest注入可能なrandom/clockを使う。retryは同じserialized bodyを再利用する。
- retry controllerはHTTP実行回数、総期限、per-attempt deadlineを同じ注入clockで所有する。
  3 retryを「最大3 attempt」と数える案は2秒capを使えず期待call数が曖昧になるため採らない。
- typed HTTP errorはinitial Offer、update Offer、candidateのoperation種別を保持する。
  initial Offerの410だけは旧session IDを復元できないためterminalとし、update/candidateの404/410だけを
  bundle replacementへ遷移させる。

## スコープ境界

- 本タスク: Frontend schema/state machine、timeout/retry、candidate queue、grace、legacy rollback mode。
- 依存タスク: backend revision/error契約を共有fixtureどおりconsumeする。
- スコープ外: backend変更、UI redesign、service worker、automatic page reload、Phase 4 browser/network matrix。

## 実装方針（既存コード整合: file:line）

- `rtcTalkClient.ts:20` から`:22` は1 PeerConnection bundleをreadonly所有し、`:80` で
  再交渉ごとにsession IDを消す。
- `rtcNegotiation.ts:6` のpayloadはrequest ID/revisionを持たず、`:79` から`:94` は429以外を
  一括errorにする。
- `rtcIceCandidateSender.ts:13` はerrorを内部catchし、callerへfailureを返さない。
- `rtcConnectionStateHandler.ts:35` はdisconnectedで待たず、failedごとにreconnectを呼ぶ。
- `rtcBoundarySchema.ts:17` のAnswer parserはrevisionなしだけを受理する現行shapeである。

## テスト

- fake fetch/clock/PeerConnectionでinitial retry、restart single-flight、candidate順序/64/65、
  disconnectedの10秒内復帰/10秒超過、failed連打、stop競合をunit testする。
- 200/400/404/409/410/413/429/5xx/timeout/network errorの分岐とRetry-Afterをtable testする。
- retry tableは最大4 HTTP実行、500 ms/1秒/2秒cap、総30秒直前のper-attempt timeout clip、
  sleep時間が残時間以上のterminalを、call数とfake clock時刻まで固定する。
- initial Offerの410はterminal、update/candidateの404/410は旧session ID付きreplacementとなることを
  operation別table testで固定する。
- Go側共有JSON fixtureをTypeScript parser/serializer testでも読み、field/statusの乖離を検出する。
- legacy Answer初回成功、legacy切断時の新PC initial、Pion revision不一致拒否をtestする。
- `npm --prefix sincromisor-frontend run lint`、`typecheck`、`test`、`build`、
  rootの`npm run gate`と`npm run tasks:check:frontend-structure`を通す。

## ソースコードコメント受け入れ条件

- 変更production codeと、その理解に必要な直接のhelper/state/event/lifecycle/data transformationを
  change comprehension surfaceとして全件auditする。`impl.md` は `path`、`symbol/block/decision/flow`、
  `kind`、`current comment`、`reader question`、`required reader knowledge`、`decision
(keep/rewrite/delete/add)`、`action/omission reason`、`reviewer note` の列を持つ。
- exported/public APIとboundaryは目的、入力境界、戻り値/observable output、失敗条件、副作用、非対象を
  必要に応じて説明する。内部orchestration/pipeline/state transition/event source/data transformationは、
  処理段階、data表現、state change、前後関係、後段へ委ねる責務を局所的に理解できる説明にする。
- 弱い/stale commentはrewrite/deleteし、新規file/symbolは現行規約を満たす。省略は
  `documents/rules/source-comments.md` の具体的条件をauditに書き、private、短い、型がある、testを読める、
  既存も無commentを単独理由にしない。TODOは理由、削除条件、canonical task ID、期限/判断基準を必須とする。
  コメント前に命名/関数分割/型/options object/module境界を検討するが、構造改善を説明省略理由にしない。
- evaluatorは変更対象とsurfaceを全件照合し、未照合範囲と残リスクを `eval.md` に書く。
  逐語説明、確認先だけ、失敗modeのないheuristic説明、内部flowの理解不能、stale comment、
  定型的な省略理由が1件でもあればFAILとする。

## ドキュメント同期の要否

要。`documents/design/contracts/frontend-rtc.md` のretry/status/legacy rollback記述を実装値へ同期する。
`documents/design/index.md` の契約導線も確認・同期する。app shellの公開操作は変えないため
`documents/design/frontend/app-shell.md` の更新は不要。
