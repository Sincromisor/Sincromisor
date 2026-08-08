# レビュー: task-260802212220-pion-gate3-frontend-browser-harness

## 判定

APPROVED

## 理由・申し送り

- 前回指摘した重大な欠落は解消された。Go統合試験を最上位ownerとする起動・逆順cleanup、途中失敗時のjoin、段階別期限、失敗条件、固定実行commandが定まり、一意に実装・検証できる。
- 合否の正本がHTTP request、実DataChannel、native ICE getter、Web Audio sample、`pipelinecontract.Transcript`へ分離され、revision 2、同一session、既存DataChannel、2 turnをbrowser内部の自己申告だけで合格にできない。
- 現行コードと整合する。PionはFrontend staticとRTC APIをsame-origin配信し、Frontendは`failed`から既存`RTCPeerConnection`上の`createOffer({ iceRestart: true })`へ進む。`pipelinecontract.Entry`にはsession、sequence、service順、byte同一性の観測値があり、2正常turnへの`Verify`の最小拡張で足りる。
- 追加されたproduction修正も一意かつ最小である。修正前の`executeRequest`は`params.fetchImplementation(...)`により注入関数をparams objectのmethodとして呼ぶため、native `window.fetch`へ誤った`this`を渡していた。共有境界で関数をdetachして呼べばinitial/update Offerとcandidateの全callerを一度に修正でき、公開APIやretry契約は変わらない。`rtcSignalingHttp.test.ts`で`this === undefined`を固定する1件の回帰試験で十分であり、caller別の重複修正・試験は不要である。
- Recognizer期待値`固定文`は既存fixtureとwebsocket結合契約に一致する。反復するChromium固定WAVへの応答上限も、browser ownerだけが`MaxSpeechResults=2`を設定し、`0`と既存callerのdefaultを無制限に保つ仕様へ限定された。これにより2正常turnで観測を静止させつつ、既存3-attempt fault scenarioを変更せず維持できる。
- post-Answer candidate flush中の`failed`欠落もowner境界のroot causeに対する最小修正である。stateが`connected`なのに残っているflightだけを待ち、同じgenerationがconnectedのままなら完了後にrecoveryを再評価するため、initializing/restartingとの重複を増やさず、stop・replacement・terminal failure後のintentを破棄できる。2回の`failed`をdeferred candidate中に発火する単体回帰が、flush中は追加Offerなし、完了後はICE restart 1回を固定している。
- 実装時は`Verify`の既存1正常turn・3 attempt契約を維持する回帰試験も更新すること。page readinessの`開始する`はstartup dialog、会話開始操作は別の`会話を開始`buttonなので、selectorと操作順を混同しないこと。
- Playwright全体180秒は成功経路の外枠、各段階期限は個別failure境界として扱うこと。cleanupはGo側の10秒枠で別に判定し、Playwright成功後でも台帳またはcleanupが失敗すれば統合試験を失敗させること。
- 追加proxy、HTTP障害注入、独自JSON protocolは不要である。共有HTTP境界、新規test owner、browser API境界、復元処理のコメントはtask.mdへ規約を複製せず、実装時に`documents/rules/source-comments.md`を直接参照すること。
- 確認: `npm run test -- src/features/rtc/__tests__/rtcTalkClient.test.ts`は17件すべてPASSした。
