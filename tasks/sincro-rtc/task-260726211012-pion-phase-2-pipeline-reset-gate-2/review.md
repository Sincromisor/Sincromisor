# Review: task-260726211012-pion-phase-2-pipeline-reset-gate-2

## 判定

NEEDS_REVISION

import cycle、TTS用field patch、close frameのwire操作は概ね解消したが、canonical interfaceの最小schema、
final historyのpatch値、decode event名が未確定または現行コードと矛盾する。Gate実装・期待値を一意にできない
Highが残るため実装へ進めない。

## 指摘事項

- [High] import cycleを避けるpackage配置は確定したが、新設するcanonical interfaceの最小schemaが
  task.mdから欠落している。`task.md:161-166,181-188` は親 `pipeline` を
  `client.ExtractorConnection` / `RecognizerConnection` / `ProcessorConnection` /
  `SynthesizerConnection` / `Set` / `SetFactory` のaliasにし、子から親をimportしないため、
  前回のcycle自体は解消する。しかし子packageに新設する6 interfaceについてmethod setがなく、
  `SetFactory.Connect` の戻り値、`Set` の4 accessor / `Activate` / `Close`、各connectionの
  `Send*` / `Results` / `Events` が型として固定されていない。interface methodの戻り値型が前回の
  破綻点そのものなので、proseから実装者に再構成させず、`internal/pipeline/client/set.go` に置く
  全canonical interfaceのGo declarationをtask.mdへ明記する必要がある。

- [High] Processor fixtureのpatch対象fieldは列挙されたが、final `history` の値が受け入れ条件と矛盾する。
  `task.md:63-70` はfinal resultを `history = request history + response message` のときだけ受理すると
  固定する一方、`task.md:267-270` は `history` を他のidentity fieldとまとめて「requestと一致させる」と
  記載している。`history` をrequest historyと完全一致させればintermediate条件になり、
  `end_of_response=true` のfinalはprotocol errorとしてresetされ、必須のTTS/output/次turnへ到達しない。
  patch後の `history.messages` を「request historyの防御的copyへ、patch後の
  `response_message` を末尾に1件追加した値」と明記し、prefix / length / final elementの期待値を一意に
  する必要がある。`end_of_response=true`、non-empty `voice_text`、patch後raw bytesのbyte equality、
  1 turnあたりSynthesizer request 1件の指定は解消済みである。

- [High] malformed MessagePack caseの期待EventKindが存在しないAPI名を参照している。
  `task.md:282-286` はpayload `0xc1` の期待値を `EventDecode` とするが、現行の正しい定数は
  `internal/pipeline/client/client.go:47-48` の `EventDecodeFailed` であり、
  decode failureも `internal/pipeline/client/connection.go:231-235` から同定数を通知する。
  存在しない `EventDecode` のままでは固定matrixの期待値を実装・検証できないため、
  `EventDecodeFailed` に訂正する必要がある。status 1000 / 1001をそれぞれ異なるwire caseとして発生させ、
  どちらも `EventRemoteClose` とする指定は現行 `connection.go:217-224` と整合している。

## 実装者への申し送り

- 再レビュー対象はHEAD `7128a1de0f3c74b85a2812aa80b663d61c9f835a`。前回指摘だけと改訂箇所の
  新規破綻を確認した。
- canonical interfaceを子 `client` packageに置き、親 `pipeline` はtype aliasのみ公開する設計なら
  import cycleは生じない。`client.NewSetFactory(resolver, logger, now)` の所在・dependency・nil拒否も
  一意になっている。
- Processor fixtureを原本mapとして限定fieldだけpatchし、Go DTOから成功responseを新規生成しない方針、
  patch後raw bytesをそのままSynthesizer requestへ渡すbyte equality、request count 1件は明確である。
- 実service / YAMNet / ASR / TTS推論品質をGate 2から除外する限定スコープと、旧音声fixture metadata問題の
  解消状態を維持する。
