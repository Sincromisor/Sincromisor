# Pion Phase 3のproduction candidateを検証してGate 3を判定する

## 背景 / 目的

Phase 3の各変更束を実4 Python service、現行Frontend、Pion serverの縦切りで統合し、
`documents/migration/pion/validation-plan.md` の必須functional/failure/resource条件を満たすか判定する。
fake serviceやunit testだけをGate 3 PASSの代替にしない。

## 完了条件（受け入れ条件）

- [ ] `gate3` build tagの固定entrypointを追加し、明示した4 service originが1つでも欠けた場合はskipせずFAILする。
      production client、MessagePack codec、media processor、signaling handlerを差し替えず使う。
- [ ] current FrontendをPlaywright管理のChromiumで接続し、initial Offer、candidate、audio input、
      confirmed user text、processor response、合成音声、`text_ch`、`telop_ch` を1往復完走する。
- [ ] 同じbrowser sessionでICE restartし、session ID/DataChannel/pipelineを維持して2往復目を完走する。
      response消失を模擬したinitial/update Offer再送、旧revision candidate、404/409/410/429/5xx/timeout分岐も確認する。
- [ ] candidate gathering、pre-connect、media readiness、restart、下流1 service停止、codec error、
      malformed/oversized HTTP、DataChannel未open、browser abrupt close、managed panicを注入し、
      expected status/reconnect/close reasonと資源回収を確認する。
- [ ] normal/abnormal closeを各10回行い、active session/WebSocket/codec/queueが0へ戻り、
      各iteration終了後10秒以内にgoroutineがidle baseline+5、fd/socketがbaseline+2以下へ戻る。
      baselineと各iterationのraw countを記録し、1回でも超過すればFAILとする。RSS単独でleak判定しない。
- [ ] process強制終了後にtest supervisorが5秒以内に再起動し、readiness復旧後に新規sessionを受理する。
      1 instanceのsession上限100とprocess停止時最大100 session喪失をartifactへ明記する。
- [ ] production経路にPoC test tone、fixed smoke payload、Python RTC adapterがないことをsource/runtime双方で確認する。
- [ ] 固定command、commit、OS/Go/browser、service image digest、fixture SHA-256、各stage時刻、
      failure/resource/metric結果を `artifacts/gate-3-result.md` に記録する。全必須条件がそろわなければPASSにしない。
- [ ] taskが追加/変更するtest harness/commentについて所定schemaのcomment auditを行い、
      production codeを変更した場合は通常の全change comprehension surface条件も適用する。

## 設計判断（着手前に確定済み）

- fixed entrypointはLinux環境のmodule rootで
  `go test -tags=gate3 -count=1 ./internal/gate3 -run '^TestGate3ProductionCandidate$' -v` とする。
- 4 originはGate 2と同じ `SINCRO_GATE2_*_ORIGIN` を再利用せず、誤実行を避けるため
  `SINCRO_GATE3_{EXTRACTOR,RECOGNIZER,PROCESSOR,SYNTHESIZER}_ORIGIN` を必須にする。
- root `package.json` / lockfileへ `@playwright/test` 1.54.2をdevDependencyとして固定し、
  `playwright.gate3.config.ts` と `sincromisor-frontend/tests/gate3/pionRtcGate3.spec.ts` を追加する。
  setupは `npx playwright install chromium` で管理browserを取得し、Gate本体は取得済みbinaryがなければskipせずFAILする。
  Go Gate testが `npm exec playwright test -- --config=playwright.gate3.config.ts` をsubprocess起動してjoin/cleanupする。
  Firefox/NAT/impairment/30分soakはPhase 4へ残す。
- `internal/gate3/signaling_proxy.go` にtest-only rule
  `{endpoint, responses: [{action=drop_response|status|delay, status, delay}]}` を置く。
  matching requestごとにresponses先頭をconsumeし、空になった後だけtransparentに戻す。
  response dropは1件後の成功、404/409/410は1件、429/5xx/delay terminal caseは3件を設定する。
  `pipeline_proxy.go` に `{service, action=close|malformed|delay}` を置く。
  success pathはbyte-transparent proxyである。codec/deadlineはmalformed inbound RTP、
  malformed synthesizer response、timeout設定、readiness欠損peerでproduction component自体を失敗へ遷移させる。
  production buildへfault endpoint/flag/global hookを追加しない。
- browserは `/simple-vrm/index.html` を開き、role `button` / name `会話を開始` と `接続を停止` を操作する。
  Chromiumへ `--use-fake-device-for-media-stream` と
  `--use-file-for-fake-audio-capture=<gate3/testdata/gate3-ja.wav>` を渡す。
  fixtureはVoiceVoxで固定文「おはようございます。今日もいい天気ですね。」から生成してcommitし、
  `testdata/README.md` にengine/version/speaker/license/privacy、生成command、SHA-256を記録する。
  exact認識文は要求せずconfirmed non-empty user text、non-empty processor/synth outputを要求する。
- page/UI ready 15秒、initial connected 15秒、pipeline 1往復60秒、ICE restart30秒、close収束10秒を
  独立deadlineにする。CDP offlineを6秒適用してgrace超過後onlineへ戻し、revision 2・同じsession IDでの
  restartをtriggerする。
- supervisorはGate専用subprocess harnessとし、production composeの排他切替はPhase 4で実装する。
- Gate失敗時もartifactへ観測済み/未観測とcleanup結果を残し、期待値を緩めてPASSにしない。
- injection期待値は、response drop=同一request/revision再送、404/410=新PC+previous session、
  409=terminalで新sessionなし、429/5xx/delay=3 attempt/30秒内のretry後terminal、
  gather/pre-connect/media/restart deadline=対応close reason、pipeline close=同session内全client reset/reconnect、
  codec error=当該session close、DataChannel未open=media readiness timeoutとする。
- managed panicはobservability依存タスクが追加したinventory別panic testの実行結果をGate artifactへ取り込み、
  Gate packageからfake codec/processorをproduction constructorへ追加注入しない。

## スコープ境界

- 本タスク: Gate 3 harness、実4-service/browser縦切り、failure/resource/restart判定、結果artifact。
- 依存タスク: production codeの機能追加は原則行わず、不具合は該当先行タスクへ戻して是正する。
- スコープ外: aiortc baseline比較、Firefox、NAT/firewall、fixed UDP mux、impairment、30分soak、
  compose切替runbook（Phase 4）、運用切替（Phase 5）。

## 実装方針（既存コード整合: file:line）

- `documents/migration/pion/implementation-phases.md:132` から `:143` がGate 3条件である。
- `documents/migration/pion/validation-plan.md:45` から `:84` がfunctional/pipeline、
  `:199` から `:218` がfailure injection正本である。
- Gate 2の実service entrypointと記録方式は
  `tasks/sincro-rtc/task-260726211012-pion-phase-2-pipeline-reset-gate-2/artifacts/gate-2-result.md`
  を踏襲するが、Gate 2 PASSをGate 3の代替にしない。
- `cmd/pion-poc/main.go:30` の実process lifecycleと、Frontend `rtcTalkClient.ts:69` の接続入口を使う。

`artifacts/gate-3-result.md` は `判定`、`対象commit`、`環境`（OS/Go/Node/Playwright/Chromium）、
`service origins/image digests`、`fixture provenance/hash`、`固定command`、`functional stage/deadline表`、
`signaling/restart表`、`failure injection表`、`normal/abnormal 20 iteration resource表`、
`supervisor restart`、`未観測/残リスク` を必須sectionとする。未観測は空欄でなく `未観測（理由）` と書く。

## テスト

- 上記固定Gate commandを実4-service origin付きでPASSさせ、Playwright Chromium scenarioも完走させる。
- `go test -race ./...`、`go vet ./...`、Frontend lint/typecheck/test/build、root `npm run gate`、
  `npm run tasks:check`を通す。
- evaluatorはartifactのcommand/log/metricと実行結果を照合し、未実行、skip、fake代替、資源未収束をFAILにする。

## ソースコードコメント受け入れ条件

- test harnessと、例外的に変更するproduction code、その理解に必要な直接の
  helper/state/event/lifecycle/data transformationをchange comprehension surfaceとして全件auditする。
  `impl.md` は `path`、`symbol/block/decision/flow`、`kind`、`current comment`、`reader question`、
  `required reader knowledge`、`decision (keep/rewrite/delete/add)`、`action/omission reason`、
  `reviewer note` の列を持つ。
- public API/boundaryは目的、入力境界、戻り値/observable output、失敗条件、副作用、非対象を説明する。
  internal Gate orchestration/fault injection/state/event/data flowは、処理段階、data表現、前後関係、
  production経路へ混入しない境界、cleanup責務を局所的に理解できる説明にする。
- 弱い/stale commentはrewrite/deleteし、新規file/symbolは現行規約を満たす。省略は規約の具体的条件を
  auditへ書き、private、短い、型、test、既存無commentを単独理由にしない。TODOは理由、削除条件、
  canonical task ID、期限/判断基準を必須とし、構造改善をreader-oriented説明の省略理由にしない。
- evaluatorは変更対象とsurfaceを全件照合し、未照合範囲と残リスクを `eval.md` に書く。
  逐語説明、確認先だけ、失敗mode/cleanupのない説明、production混入境界の不明、stale comment、
  定型的な省略理由が1件でもあればFAILとする。

## ドキュメント同期の要否

要。PASS時は `documents/design/backend/services/sincro-rtc.md` にPion production candidateの責務と
Python現行backendがrollback対象であることを追記し、`documents/design/architecture/overview.md` と
`documents/design/index.md` の導線を同期する。`documents/migration/pion/roadmap.md` にはPhase 3の
Gate 3 artifact/taskへの参照だけを追加し、Phase 4以降を完了扱いにしない。FAIL時はcurrent designを更新しない。
