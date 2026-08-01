# Pion Phase 3の可観測性とprocess hardeningを実装する

## 背景 / 目的

媒体/signaling統合後のproduction candidateをGate 3で判定するには、failureが検知されても
session/processのどこで停止したか観測できなければならない。status/health/metrics、panic境界、
startup/shutdownを実装し、Gate testが機械判定できる状態を作る。

## 完了条件（受け入れ条件）

- [ ] `GET /api/v1/RTCSignalingServer/statuses` は
      `{sessions, session_limit, ready, draining}` をJSONで返し、GET以外405である。
- [ ] `/health/live` はprocess event loop稼働中200、`/health/ready` はstartup dependency検証完了かつ
      非drainingなら200、それ以外503を返す。下流serviceの一時障害だけでprocess readinessをfalseにしない。
- [ ] `/metrics` にPrometheus text形式で、session created/active/closed/failed、signaling count/latency、
      ICE transition、deadline、audio sent/received/drop/reorder/duplicate/late、RTCP loss/RTT/NACK、
      pacing lag/abort、codec error、pipeline reconnect、queue depth/overflow、DataChannel error、
      close durationを公開する。
- [ ] metric labelにsession ID、SDP、candidate、chat/音声本文を使わない。構造化logはsession IDと
      reason/stage/countだけを持ち、payload本文を通常logへ出さない。
- [ ] sessionから起動する全goroutine/Pion callbackは共通recover wrapperを通り、panicを当該sessionの
      close-onceへ通知する。HTTP middleware panicは500にし、一部適用済みsessionがあればcloseする。
- [ ] startup時にFrontend dir、ffmpeg、全timeout/queue/cache/session上限をlistener公開前に検証する。
      shutdownは先にreadiness false/draining true、新規initial Offerを503、HTTP accept停止、
      active sessionを最大5秒でclose/joinの順に行う。
- [ ] RTCP drainはpacket typeを分類し、未知feedbackを理由にsessionを閉じない。RTP/RTCP loopの予期せぬ終了は
      close reasonとmetricへ反映する。
- [ ] comment auditを所定schemaで記録し、metric meaning/cardinality、health semantics、panic限界、
      drain順序、privacyを説明する。単なるexport説明やstale PoC commentを残さない。

## 設計判断（着手前に確定済み）

- `internal/observability` packageにPrometheus registryとsession recorder interfaceを置き、
  `github.com/prometheus/client_golang` を固定依存として使う。default global registryは使わない。
- metric schemaを次に固定する。全counterは `_total`、duration/lag/RTTはseconds、queueはitemsである。

  | name | type | labels / buckets |
  | --- | --- | --- |
  | `sincro_rtc_sessions_created_total` | counter | なし |
  | `sincro_rtc_sessions_active` | gauge | なし |
  | `sincro_rtc_sessions_closed_total` | counter | `outcome=closed|failed`, `reason`は定義済みclose reason enum |
  | `sincro_rtc_signaling_requests_total` | counter | `endpoint=config|offer|candidate|statuses`, `status_class=2xx|4xx|5xx` |
  | `sincro_rtc_signaling_duration_seconds` | histogram | `endpoint`; `.005,.01,.025,.05,.1,.25,.5,1,2.5,5` |
  | `sincro_rtc_ice_transitions_total` | counter | `from`,`to`はPion enum |
  | `sincro_rtc_deadlines_total` | counter | `stage=gather|pre_connect|media_readiness|restart|close` |
  | `sincro_rtc_audio_frames_total` | counter | `direction=in|out`, `outcome=accepted|sent|dropped` |
  | `sincro_rtc_rtp_drops_total` | counter | `reason=duplicate|late|missing|reorder_flush` |
  | `sincro_rtc_rtcp_feedback_total` | counter | `type=sr|rr|nack|other` |
  | `sincro_rtc_rtcp_loss_ratio` | histogram | なし; `0,.001,.01,.05,.1,.25,.5,1` |
  | `sincro_rtc_rtcp_rtt_seconds` | histogram | なし; `.001,.005,.01,.025,.05,.1,.25,.5,1,2.5,5` |
  | `sincro_rtc_pacing_lag_seconds` | histogram | なし; `.001,.005,.01,.02,.05,.1,.25,.5,1` |
  | `sincro_rtc_pacing_aborts_total` | counter | `reason=lag|generation|codec` |
  | `sincro_rtc_codec_errors_total` | counter | `direction=decode_in|decode_synth|encode_out` |
  | `sincro_rtc_pipeline_reconnects_total` | counter | `service=extractor|recognizer|processor|synthesizer`, `result=start|success|failure` |
  | `sincro_rtc_queue_depth` | gauge | `queue=input|speech|text|telop` |
  | `sincro_rtc_queue_overflows_total` | counter | `queue`, `action=drop_oldest|reject_close` |
  | `sincro_rtc_datachannel_send_errors_total` | counter | `channel=text|telop` |
  | `sincro_rtc_session_close_duration_seconds` | histogram | `outcome=success|timeout`; `.005,.01,.025,.05,.1,.25,.5,1,2.5,5` |

  Recorderは上記eventを表す型付きmethodだけを公開し、arbitrary metric/label APIを公開しない。
  counterは該当eventで+1、active/queue gaugeはownership取得/解放とenqueue/dequeueで増減し、close後0へ戻す。
  最小interfaceは `SessionCreated`、`SessionClosed`、`SignalingRequest`、`ICETransition`、`Deadline`、
  `AudioFrame`、`RTPDrop`、`RTCPFeedback`、`RTCPQuality`、`PacingLag`、`PacingAbort`、`CodecError`、
  `PipelineReconnect`、`QueueDepthDelta`、`QueueOverflow`、`DataChannelError`、`CloseDuration` とする。
  close reason labelは
  `normal|process_shutdown|offer_failed|pre_connect_timeout|media_readiness_timeout|duplicate_media|`
  `pipeline_start_error|codec_error|media_read_error|media_write_error|invalid_data_channel|`
  `data_channel_error|output_backpressure|ice_failed|ice_disconnected_timeout|restart_timeout|panic|unknown`
  だけへ正規化する。
- statusesは運用互換の簡易JSON、metricsは集計時系列として分離する。cleanup GET endpointは
  state-changing GETを温存するためPion版へ実装しない。
- readinessはprocessが新規sessionを安全に作れるかを表す。個別Python serviceの可用性はsession pipelineが
  reset/reconnectするためprocess readinessへ混ぜない。
- recoverは通常error処理の代替にせず、runtime fatal/cgo crashを隔離できないことをlog/docに明記する。
- `internal/rtc/safe.go` に `Session.Go(stage, func(context.Context))` と
  `Session.SafeCallback(stage, func())` を置く。対象はRTCP reader、inbound processor、outbound clock、
  pipeline Start/text/synth consumer、deadline callback、およびICE/connection/track/DataChannel/open/close callbackである。
  panicはclose reason `panic`、failed session counter、stage/error logへ変換する。
- `internal/signaling/recovery.go` のmiddlewareはsession未特定panicを500/logだけにする。
  active sessionを変更するhandlerはlookup後に `withSessionMutation` へsessionを渡し、panic時に同sessionをcloseする。
  initial CreateはManager内部deferがreservation/作成済みresourceをcleanupするためmiddlewareからsessionを推測しない。

## スコープ境界

- 本タスク: status/health/metrics、privacy、panic wrapper、startup validation、graceful drain。
- 依存タスク: media/signaling/frontendが出すevent/counterを接続する。
- スコープ外: external Prometheus/Grafana、alert rule、compose supervisor、NAT、soak、baseline比較。

## 実装方針（既存コード整合: file:line）

- `internal/signaling/http.go:71` のHandlerは3 APIだけで、status/health/metricsを持たない。
- `cmd/pion-poc/main.go:30` のrunはHTTP shutdown後にCloseAllするがreadiness/drainingを公開しない。
- `internal/rtc/session.go:130` のRTCP loopはbytesをdrainするだけでpacket種別を観測しない。
- `documents/migration/pion/validation-plan.md:220` から `:239` が必須metric/privacy正本、
  `target-architecture.md:266` から `:279` がpanic/process model正本である。

## テスト

- status/health/metricsのmethod/status/content type/schemaと、metric label cardinalityをhandler testする。
- 各managed goroutine、Pion callback、HTTP handlerへpanicを注入し、session close/500/process継続を確認する。
- startup invalid dependency/bounds、drain中initial 503、active session 0/1/100の5秒closeをfake clockでtestする。
- payload markerをSDP/candidate/chat/audioへ入れ、captured log/metricsに出現しないprivacy testを行う。
- `go test -race ./internal/... ./cmd/pion-poc`、`go vet ./...`、`npm run gate`、
  `go mod tidy -diff`、`npm run tasks:check`を通し、`go.mod` / `go.sum` を同じcommitへ含める。

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

要。`documents/design/contracts/frontend-rtc.md` のstatuses/cleanup差分と
`documents/migration/pion/rollout-and-operations.md` のhealth/metrics名・drain手順を同期する。
current designのPython→Pion切替はGate 3前なので、本タスクでは
`documents/design/backend/services/sincro-rtc.md` をまだ置換しない。
