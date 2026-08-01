# Review: task-260726211012-pion-phase-2-pipeline-reset-gate-2

## 判定

APPROVED

前回のblocking High 3件はすべて解消され、改訂箇所に新たな破綻はない。production client / codec /
Coordinatorを通す決定的なGate 2として、実装・検証条件が一意になったため実装へ進めてよい。

## 指摘事項

なし。

## 実装者への申し送り

- 再レビュー対象はHEAD `172902c1ca07124ee254f44c86670535ecfa7704`。
- canonicalな6 interfaceは `internal/pipeline/client/set.go` のmethod declarationで固定されている。
  子 `client` packageがcanonical型を所有し、親 `pipeline` はtype aliasだけを公開するためimport cycleはない。
  production constructorは `client.NewSetFactory(resolver, logger, now)` で、dependencyとnil拒否も確定している。
- Processor fixtureは既存Python生成mapを原本とし、列挙fieldだけをpatchする。
  `history.messages` はrequest historyの防御的copyへpatch後responseを1件追加した値であり、
  finalのprefix / length / last element条件を満たす。patch後raw bytesをSynthesizerへ無変更転送し、
  byte equalityと1 turnあたりrequest 1件を検証する。
- reset matrixはstatus 1000 / 1001をそれぞれ `EventRemoteClose`、malformed MessagePack `0xc1` を
  `EventDecodeFailed` とする。explicit local Close / parent cancellationはterminal eventに数えない。
- Gate 2は実serviceやYAMNet / ASR / TTS推論品質を判定材料にせず、in-process WebSocket server、
  production client、MessagePack codec、Coordinator/reset / close semanticsに限定する。
- task.mdに定めたdocumentation同期とcomment audit / comment acceptanceを実装・評価時に全件照合する。
