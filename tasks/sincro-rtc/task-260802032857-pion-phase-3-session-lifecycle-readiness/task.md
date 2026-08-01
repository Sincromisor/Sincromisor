# Pion Phase 3のRTC session lifecycleとreadinessを統合する

## 背景 / 目的

Gate 2でGo pipeline coordinatorは成立したが、PoCのRTC sessionはtest toneだけを所有し、接続未成立でも
sessionを無期限に保持できる。Phase 3の媒体処理を安全に載せる前に、PeerConnection、readiness timer、
pipeline coordinatorを1つのclose-onceへ統合する。

正本は `documents/migration/pion/target-architecture.md:211` から `:218`、
`documents/migration/pion/implementation-phases.md:112` から `:137` とする。

## 完了条件（受け入れ条件）

- [ ] `internal/rtc/lifecycle.go` に `created`、`answer_ready`、`transport_ready`、`media_ready`、
      `running`、`closing`、`closed` を定義する。許可遷移は
      `created -> answer_ready -> transport_ready -> media_ready -> running`、
      任意の非terminal state `-> closing -> closed` だけとする。
      Answer生成、connected callback、3 readiness latch、pipeline Start成功、Close/error/timeout、
      cleanup完了をそれぞれのevent sourceとし、それ以外はtyped transition errorにする。
- [ ] candidate収集済みAnswer生成後15秒以内にPeerConnectionがconnectedにならなければ
      `pre_connect_timeout`、connected後10秒以内にaudio track、`text_ch`、`telop_ch` の3条件が
      そろわなければ `media_readiness_timeout` で同じclose-onceへ収束する。
- [ ] pipeline client setは3つのmedia readiness条件がすべて成立した後に1回だけ作成する。
      timeout、browser close、重複callbackでは下流WebSocketを作成しない、または作成開始済みならclose/joinする。
- [ ] `Session.Close` は非blockingにclosingを1回だけ確定し、timer cancel、pipeline coordinator、
      codec、PeerConnection、session goroutineのclose/joinを開始する。全resource join後だけ
      `closed`、`done` close、registry removeへ進む。`Manager.CloseAll(ctx)` は5秒contextを受け、
      未完了ならdeadline errorを返して `done` / registry removeを偽装せず、cleanup goroutineは完了まで継続する。
      通常resourceは5秒以内にjoinする。
- [ ] session生成時の `talk_mode` をpipeline `Start`へそのまま渡し、`chat` / `sincro` 以外は
      PeerConnection作成前に拒否する。
- [ ] production codeのchange comprehension surfaceをauditし、`path`、`symbol/block/decision`、
      `kind`、`current comment`、`reader question`、`required reader knowledge`、`decision`、
      `action/omission reason`、`reviewer note` を `impl.md` に記録する。変更したpublic API、
      lifecycle、callback、timer、close順序は `documents/rules/source-comments.md` と
      `documents/rules/coding-go.md` を満たし、stale commentを残さない。

## 設計判断（着手前に確定済み）

- `internal/rtc/lifecycle.go` に `sessionState` とclock注入可能なdeadline controllerを置く。
  timerをHTTP handlerやpipeline packageへ分散しない。
- `internal/rtc/session.go` の `Session` が `pipeline.Coordinator` を直接所有する。生成には
  `SessionDependencies{PipelineFactory pipeline.ClientSetFactory, Clock Clock}` を渡し、
  nil dependencyはsession作成前に拒否する。
- readinessは「ICE/DTLS connected、audio track受理、2 DataChannel open」のANDとする。
  channelの到着順やtrackの先着を状態遷移の正本にしない。
- track/channel到着はconnected前でもlatchへ記録する。最後の条件とtimeout/Closeが競合した場合は
  lifecycle mutexを先に取得したeventだけが遷移し、closing以後のcallback/timerはno-opとする。
  同じobject/stateの重複通知はno-op、2本目のaudio trackまたは同じlabelの別DataChannelは
  `duplicate_media` でsessionをcloseし、新resourceを開始しない。
- pipelineはreadiness後に専用goroutineから `Start` する。初回接続失敗はsessionを閉じる。
  接続前から下流WebSocketを張る案はhalf-open sessionの資源保持を招くため採らない。
- `disconnected` は後続ICE restartタスクがgraceを実装するまで即closeの現状を維持する。
- `internal/rtc/lifecycle.go` の最小testable clock契約は
  `Clock.AfterFunc(time.Duration, func()) Timer` と `Timer.Stop() bool` とする。
  callback drainは要求せず、上記mutexでStopとのraceを無害化する。zero durationとnil Clock/Timerは拒否する。
- `internal/rtc/manager.go` に
  `ManagerDependencies{PipelineFactory pipeline.ClientSetFactory, Clock Clock, Logger *slog.Logger}` を置く。
  `NewManager` がdependencyを保持し、sessionごとに
  `pipeline.NewCoordinator(PipelineFactory, Logger)` を1回呼び、Coordinatorとclockを `newSession` へ渡す。

## スコープ境界

- 本タスク: RTC/pipeline ownership、readiness latch、pre-connect/media deadline、close/join。
- 依存タスク: Gate 2済みCoordinatorのreset semanticsは変更しない。
- スコープ外: RTP decode/resample、合成音声、DataChannel payload dispatch、signaling revision、
  Frontend、metrics endpoint、compose、Phase 4のnetwork/soak。

## 実装方針（既存コード整合: file:line）

- `internal/rtc/session.go:22` のSessionはcodec/goroutineだけを所有し、`:182` のcallbackは
  disconnectedを即closeする。
- `internal/rtc/manager.go:68` のCreateはtalk modeをsession生成へ渡していない。
- `internal/pipeline/coordinator.go:63` のCoordinatorは1 session専用で、`:127` のStartまでI/Oを開始しない。
- `internal/pipeline/coordinator.go:212` のCloseはproducer join後にoutput channelを閉じるため、
  Session closeではCoordinatorをcodec/PeerConnectionと同じownershipで1回だけcloseする。

## テスト

- fake clock/factoryで全状態遷移、各deadline、readinessの6順列、重複callback、不正遷移をunit testする。
- pipeline factoryの接続回数を観測し、未ready/timeoutは0、readyは1、close競合後は増えないことを確認する。
- `go test -race ./internal/rtc ./internal/pipeline` で初回接続中closeと100回のclose競合を確認する。
- moduleの`go vet ./...`、`go test -race ./...`、repository rootの`npm run gate`と
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

不要。外部endpoint/JSON/media契約を変えず、移行文書に既に確定した内部lifecycleを実装するため。
