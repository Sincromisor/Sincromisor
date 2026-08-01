# Pion Phase 3のoffer revisionとICE restartを実装する

## 背景 / 目的

initial signalingの冪等境界に、同じsession IDを維持するupdate Offerとrevision付きcandidateを追加する。
旧revisionや不明sessionを新規sessionへfallbackさせず、PeerConnection/DataChannel/pipelineを維持して
ICE restartだけを直列化する。

## 完了条件（受け入れ条件）

- [ ] active sessionへのOfferは既存ULID `session_id`、同じsessionのinitial request ID、
      現在値+1の `offer_revision` を必須とし、成功Answerに同じsession ID/revisionを返す。
      `talk_mode` も必須とし、enum外は400、session作成時に保存した有効値と異なる場合は409にして
      pipeline/talk modeを変更しない。
- [ ] 同じrevision/同じSDPの再送は保存済みAnswer、同じrevision/異なるSDPと並行update Offerは409、
      旧/未来revisionは409、不明sessionは404、closed sessionは410を返しfallbackしない。
- [ ] Offer適用、Answer生成、candidate追加はsession単位で直列化する。update失敗がremote description適用前なら
      現revisionを維持し、適用後で安全なrollback不能ならsessionをcloseする。未完成Answerをcacheしない。
- [ ] candidate requestは `session_id`、`offer_revision` を必須とし、current accepted revisionだけへ適用する。
      同一session/revision/candidate（nullを含む）は冪等、1 revision 64件を超えた新規candidateは429にする。
- [ ] candidate文字列8 KiB超過は413、syntax/type/ULID/revision異常は400、旧/未来revisionは409、
      unknown/closedは404/410である。
- [ ] `disconnected` は10秒grace中の自然復旧なら何もしない。`failed` またはgrace超過後は15秒の
      restart deadlineを開始し、同一sessionの成功updateでcancel、超過でclose-onceへ収束する。
- [ ] restart成功時に既存DataChannel、pipeline generation/session IDを維持し、audioを再開する。
- [ ] comment auditを所定schemaで記録し、revision transaction、candidate dedupe/上限、
      partial apply時close、grace/restart deadlineを説明する。

## 設計判断（着手前に確定済み）

- `internal/rtc/revision.go` に
  `revisionState{current uint64, requestID UUID, sdpHash, answer, candidateHashes, updateInFlight}` を置く。
  revisionは1開始でstrictly +1とし、usernameFragmentをgenerationの正本にしない。
- update Offerにはinitialと同じ `offer_request_id` を要求し、別IDは409にする。
- candidate dedupeはcandidate JSONのcanonical field tupleをSHA-256化し、nullも1件として記録する。
- candidate field自体のmissingは400、explicit nullはend-of-candidatesとして有効とする。
  tupleはcandidate stringの受信bytesと、`sdpMid`、`sdpMLineIndex`、`usernameFragment` の値を使い、
  optional fieldのmissingとexplicit nullは同一視する。stringのtrim/case変換はせず、empty candidate stringは400にする。
- future candidateをserverでbufferしない。FrontendがAnswerまでqueueする契約なので、current以外は拒否する。
- Pion rollback APIへ依存せず、remote description適用後の失敗はsession closeを選ぶ。

## スコープ境界

- 本タスク: backend update Offer、revision transaction、candidate dedupe/limits、restart deadline。
- 依存タスク: initial Offer registry/cache/limitsは変更せず拡張する。
- スコープ外: Frontend state machine、new PeerConnection作成、Phase 4 network matrix、TURN、multi-instance。

## 実装方針（既存コード整合: file:line）

- `internal/rtc/session.go:79` のnegotiateはinitial Offer専用で直列化/再送cacheがない。
- `internal/rtc/manager.go:96` のAddCandidateはrevisionを受け取らない。
- `internal/signaling/http.go:133` はsession ID付きOfferを501にする。
- `documents/migration/pion/contracts-and-types.md:45` から `:56` がrevision/rollback正本である。

## テスト

- local Pion pairで同一PCのICE restart後もsession ID、2 DataChannel、pipeline factory countが不変でaudioが復旧する。
- revision 1→2、再送、異SDP、0/skip/old/future、並行Offer、candidate duplicate/null/64/65をtable testする。
- update `talk_mode` のmissing/enum外/保存値一致/有効だが不一致と、candidate field missing/null、
  optional field missing/nullのdedupe同一性を共有fixtureで確認する。
- disconnected自然復旧、failed、grace/restart timeout、close競合をfake clockとrace testで確認する。
- `go test -race ./internal/rtc ./internal/signaling`、`go vet ./...`、`npm run gate`、
  `npm run tasks:check`を通す。

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

要。`documents/design/contracts/frontend-rtc.md` のupdate Offer、Answer、candidate、error、timeout、
rollback compatibilityを同期し、前タスクの共有signaling JSON fixtureへrevision caseを追加する。
