# Review: task-260802033116-pion-phase-3-synthesized-audio-decode

## 判定

NEEDS_REVISION

現行コードに存在しない `ManagerDependencies` を注入先としており、共有Decoderを現行Session lifecycleへ
どう渡して所有対象から除外するかも未確定である。このHighを解消するまで実装経路とcleanup契約が一意にならない。

## 指摘事項

- [High] 設計判断が `ManagerDependencies.SynthDecoder` への注入を要求しているが、現行コードに
  `ManagerDependencies` は存在しない。現在の作成経路は
  `internal/rtc/manager.go:24` の `ManagerConfig`、同 `:34` の `sessionBuildRequest`、
  同 `:89` のbuilder、`internal/rtc/session.go:73` の `newSession`、同 `:33` の `Session` である。
  `ManagerConfig` に共有Decoderを受け取り、nilを起動時に拒否し、`sessionBuildRequest` と
  `newSession` を通して各 `Session` が非所有参照を保持する、という現行経路へ task.md を改訂すること。
  さらにDecoderはprocess-wide immutable共有物であり、Sessionが所有して閉じる
  `sessionResourceClosers`（`internal/rtc/session.go:59`）へ追加せず、Session cleanupでもcloseしないことを
  受け入れ条件に明記すること。「Sessionが所有参照を保持」という現記述だけでは、参照保持とresource ownershipが
  区別されず、共有Decoderを最初のSession終了時に破棄する実装も排除できない。
- [Medium] `CommandRunner.Run` の概念的schemaは確定しているが、記載上は `stdin`、`stdoutLimit`、
  `stderrLimit`、`args...` のGo型が省略されている。実装時はencoded voiceを防御的に渡せる型、
  byte上限をoverflowなく表す型、引数配列を明示し、doc commentとfake/実runnerで同じ契約に揃えること。
  interfaceの役割・入出力・ownerを変える複数案ではなく、実装者が妥当に決められる型詳細なので
  High解消後の再レビューを妨げない。

## 実装者への申し送り

- DTOは `internal/pipeline/protocol/dto.go:144`、encoded result channelは
  `internal/pipeline/coordinator.go:210` に現存し、format matrixとsample positionの契約もtask記載どおり成立する。
- `cmd/pion-poc.run` で実runnerと解決済みpathからDecoderを1つだけ生成し、その同一参照を全Sessionへ渡す。
  package globalへrunner/pathを保持せず、本タスクではdecode呼出しやoutbound pacingを先行実装しないこと。
- FFmpeg対応範囲、MIME validation、mora累積丸め、error分類、resource cleanup、README同期、
  comment audit / acceptanceは具体的であり、今回の陳腐化箇所以外は維持すること。
