# Evaluation: task-260802032916-pion-phase-3-backend-ice-restart

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] update Offer identity / talk mode — `handleUpdateOffer`と`Manager.Update`がstrict ULID session ID、
  initial UUID、revision、必須かつ有効な`talk_mode`を検証し、保存値不一致を409へ写像する。
  `TestUpdateOfferSchemaAndStatusBoundaries`と
  `TestManagerICERestartKeepsSessionPeerChannelsAndPipeline`でHTTP境界とpipeline不変を確認した。
- [✓] revision retry / conflict / status — `revisionState.beginUpdate`は完了済み同revision・同SDPだけ
  cached Answerを返し、異SDP、old/future、別request ID、in-flightを`ErrOfferConflict`にする。
  unknown/closing/closedは`activeSession`から404/410へ写像され、initial fallbackはない。
- [✓] revision transaction / partial apply — `operationMu`がOffer/candidateを直列化し、完成Answerだけを
  commitする。`TestUpdateFailureAfterRemoteApplyClosesWithoutCachingAnswer`はvalid restart SDPを
  PeerConnectionへ適用した後のAnswer failureを注入し、`update_offer_partial_apply` close、
  revision 1とinitial Answerの維持、`updateInFlight`解除、終了session retryの`ErrSessionClosed`を
  確認する。`TestUpdateAndCandidateOperationsAreSerialized`はupdate中のcandidateがreturn/applyせず、
  revision 2 commit後だけ適用されることを確認する。
- [✓] candidate presence / null / canonical tuple / 64件 — `json.RawMessage`でmissingとexplicit nullを
  区別し、raw candidate文字列、optional値、end-of-candidatesを曖昧性なくhash化する。
  missing/null fixture、null dedupe、optional empty/valueの非衝突、64件成功と65件目429を確認した。
- [✓] candidate error matrix — HTTPの8 KiB境界、syntax/type/ULID/revision 0、404/410/409/429写像に
  加え、`TestManagerRejectsOldAndFutureCandidatesBeforePionApply`が実Manager/Sessionのcurrent
  revision 1にold 0/future 2を渡す。両方の`ErrOfferConflict`、Pion apply未到達、
  candidate hash非保持を確認し、buffer/fallbackしないことを固定した。
- [✓] disconnect grace / restart deadline / close-once — fake clockで10秒grace、自然復旧、
  failed後15秒deadline、media readiness timerとの独立、成功commitでのcancel、deadline/Close競合を
  確認した。`beginCloseLocked`は通常timerとrecovery timerをともに停止する。
- [✓] same-PC restart invariants / audio resume —
  `TestManagerICERestartKeepsSessionPeerChannelsAndPipeline`は同じsession、PeerConnection、
  2 DataChannel object、pipeline factory 1回を確認する。attempt 2ではserver側の共有
  `InputCounterObserver`についてrestart前の`PipelineUnavailable`をsnapshotし、restart後に送信した
  別sampleでcounterが増えるまで待つため、既存TrackRemoteからInputProcessor境界までの新規audio
  受信をrestart前と区別して観測する。
- [✓] comment audit — commits `baa0704cde934294c8cf5cf5cf77fc685959b0cd`、
  `5a2da7f2ad563a8a2d5253802571ffdc4aa0c71c`の変更production codeと、
  `impl.md`に列挙されたAPI/boundary/orchestration/state/event/data/lifecycle surfaceを全件実コードと
  照合した。revision transaction、candidate dedupe/上限、partial apply close、
  grace/restart deadlineのreader knowledgeは近接commentに記録され、stale commentは更新済みである。
  attempt 2のprivate `negotiateUpdate` / `candidateApplier` seamにもproduction binding、呼出位置、
  partial-apply bool、validation通過後だけ呼ぶ制約が近接commentで説明されている。未照合範囲はない。

## テスト結果

- `npm run gate` — PASS。HEAD `5a2da7f2ad563a8a2d5253802571ffdc4aa0c71c`のclean tree cacheを
  再検証し、lint / build / frontend testの
  3点すべてPASS（3 passed, 0 failed）。
- `GOCACHE=/tmp/eval-5a2da7f-gocache GOMODCACHE=/tmp/sincromisor-attempt4-gomodcache
/tmp/go1.26.5-toolchain/bin/go vet ./...` — PASS。
- `... go test -race ./... -count=1` — PASS（9 packages passed, 0 failed）。
- `... go test -race ./internal/rtc -run
'TestManagerICERestartKeepsSessionPeerChannelsAndPipeline|
TestUpdateFailureAfterRemoteApplyClosesWithoutCachingAnswer' -count=3` — PASS
  （audio/partial-apply focused set、3反復）。
- `... go test -race ./internal/rtc -run
'TestManagerRejectsOldAndFutureCandidatesBeforePionApply|
TestUpdateAndCandidateOperationsAreSerialized' -count=10` — PASS
  （candidate/serialization focused set、10反復）。
- `npm run tasks:check` — PASS（273 tasks / 273 directories）。
- `npm run tasks:index:check` — PASS（13 categories、差分なし）。
- カバレッジ評価 — PASS。attempt 1で不足したpartial apply close/cache、old/future candidate非適用、
  update/candidate直列化、restart後server audio再受信をattempt 2のfocused testが直接assertする。

## ドキュメント整合性

- 公開通信契約の変更あり。
  `documents/design/contracts/frontend-rtc.md`はupdate Offer/Answer、revision retry/conflict、
  candidate presence/canonicalization/8 KiB/64件、404/409/410/413/429/504、
  partial apply compatibility、10秒grace/15秒deadline、同一resource維持へ同期済み。
- `internal/signaling/testdata/update_offer_request.json`、
  `update_offer_answer.json`、`candidate_requests.json`も同じcommitで追加済み。
  OpenAPI、codegen生成物、公開barrelの同期対象はない。ドキュメント未同期は認めない。
- attempt 2はprivate test seamとtestのみの変更で公開契約を変えないため、追加の文書同期は不要である。
