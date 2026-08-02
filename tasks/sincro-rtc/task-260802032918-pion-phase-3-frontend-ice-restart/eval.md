# Evaluation: task-260802032918-pion-phase-3-frontend-ice-restart

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] initial Offer の identity/retry — `RTCTalkClient.runInitialNegotiation` が SDP generation ごとに
  `crypto.randomUUID()` と revision 1 を発行する。`rtcNegotiation.ts` は SDP/payload を HTTP retry
  loop の外で一度だけ生成・serialize し、最大4実行で同じ body を再利用する。
- [✓] update Offer の revision commit — `RtcNegotiationStateMachine.beginRestart` は同じ
  session/request ID と current+1 revision を返し、Answer の session/revision 一致確認後だけ
  current identity を進める。mismatch 時に revision が不変であることを単体テストで固定している。
- [✓] single-flight / 64 FIFO — negotiation は PeerConnection generation ごとの
  `negotiationFlight` で直列化される。Answer 前 queue は最大64件で、65件目は queue を破棄して
  generation failure になる。attempt 2 では queue drain を `candidateSendFlight` へ載せてから
  `pendingIdentity` を解除し、flush 中に発生する candidate も同じ chain の末尾へ接続するよう修正した。
  owner test が保留中の1件目に対し2件目・3件目が並行送信されず FIFO となることを確認している。
- [✓] disconnected/failed recovery — 単一10秒 grace timer、9,999 ms での復帰取消、10,000 ms
  expiry、連続 disconnected、failed 連打時の即時かつ単一 restart を timer/state/owner tests で確認した。
- [✓] timeout/retry — Offer 10秒、candidate 5秒、最大4 HTTP実行、総30秒 deadline、
  500/1,000/2,000 ms cap の full jitter、Retry-After 優先、同一 body、network/timeout exhaustion、
  deadline 直前の per-attempt clip と call 時刻を fake clock tests で確認した。
  200 response の JSON parse は retry loop 外へ移され、JSON syntax/schema failure は1 HTTP実行で
  terminal になる。
- [✓] operation 別 status/replacement — typed error は operation/status を保持し、
  update Offer/candidate の404/410だけが replacement へ遷移する。initial Offer 410、409、
  400/413等は terminal である。replacement は旧 session を `previous_session_id` に渡し、
  新 PeerConnection/DataChannel/UUID を作る owner table tests で確認した。
- [✓] legacy rollback mode — revision なし initial Answer だけを legacy として受理する。
  legacy の failed/disconnect recovery は update Offer を作らず、既知の旧 session と新 request IDで
  新 bundle の initial Offerへ移ることを owner test で確認した。
- [✓] terminal generation failure — non-replacement status、identity mismatch、candidate retry
  exhaustion は queue/generation を閉じ、PeerConnection を close して error/health UIへ通知し、
  自動 bundle replacementを行わない。candidate failure を握り潰さないことを sender/owner tests で
  確認した。
- [✓] stop/track replacement/replacement guards — generation guard と AbortSignal が旧 callback/I/Oを
  無効化する。replacement close は `stopSenderTracks: false` で旧 DataChannel/transceiver/PCだけを閉じ、
  liveな最新 audio track を新 bundleへ渡す。logical stop/terminal closeは既定値trueでtrackを停止する。
  shutdown tests と owner tests が両 ownership、旧 callback、最新 track の引継ぎを確認している。
- [✓] comment audit — 変更 production code と直接 comprehension surface
  (`rtcPeerConnectionFactory`, events, shutdown, audio senderを含む)を全件照合した。
  attempt 2 audit は前回漏れていた exported types/getters/public methods、track ownership、
  parse boundary、candidate chain の reader question と required knowledge を所定 schemaで補完した。
  追加・更新コメントは実装の state transition、resource owner、失敗条件、順序と一致し、
  stale/定型的省略/TODO不足はない。

## テスト結果

- `npm run gate` @ `7678bf6d31bd5bafd77bfd2c2fe59f7aead15185` — PASS
  （clean SHA cache hit: lint / build / test 全3点）。
- `npm --prefix sincromisor-frontend run check` — PASS
  （Biome 593 files、Markdown Prettier）。
- `npm --prefix sincromisor-frontend run build` — PASS
  （TypeScript compile、Vite build、880 modules transformed）。
- `npm --prefix sincromisor-frontend run test` — PASS:
  85 files passed、1 file skipped、577 tests passed、2 tests skipped（計579）。
- focused RTC suite
  (`rtcBoundarySchema`, `rtcDisconnectedGraceTimer`, `rtcIceCandidateSender`,
  `rtcNegotiationStateMachine`, `rtcPeerConnectionShutdown`, `rtcSignalingHttp`,
  `rtcTalkClient`) — PASS: 7 files、51 tests。
- `npm run tasks:check:frontend-structure` — PASS
  （`rtcTalkClient.ts` 349行は理由付き structure-threshold warning）。
- `npm run tasks:check` — PASS（273 tasks）。
- `npm run tasks:index:check` — PASS（13 categories、変更なし）。
- `npm run commit:check` — PASS
  （sandbox内の初回は `spawnSync git EPERM` となったため、同じ read-only command を承認済みの
  sandbox外実行で再確認）。
- カバレッジ評価: task.md が指定する initial/restart、single-flight、64/65 FIFO、
  disconnected/failed、全 retry cap/timeout/deadline、operation別 status、legacy、terminal、
  candidate failure、stop/track/bundle replacementを局所テストと owner-level tests の両方で覆っている。
  browser実機/network matrixは明示された Phase 4 scopeであり、本タスクの合否に残る不足はない。

## ドキュメント整合性

- 公開 signaling 契約の変更あり。
- `documents/design/contracts/frontend-rtc.md` は request/revision、status別 terminal/replacement、
  64 FIFO、10秒 grace、最大4実行、timeout/deadline/jitter、legacy modeに加え、
  replacement時にaudio trackを停止せず新 PeerConnectionへ引き継ぐ ownershipへ同期済み。
- `documents/design/index.md` の Frontend RTC 導線は ICE restart/retry を含む説明へ同期済み。
- app shell公開操作、compose/env、公開barrel、生成物の変更はなく、追加同期・再生成対象なし。
- ドキュメント未同期はない。
