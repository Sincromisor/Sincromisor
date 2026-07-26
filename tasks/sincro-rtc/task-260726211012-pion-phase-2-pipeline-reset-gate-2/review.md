# Review: task-260726211012-pion-phase-2-pipeline-reset-gate-2

## 判定

APPROVED

前回残った ProcessorResult、実 4-stage Gate、Speech fixture、client event handoff、Close 中 Start の
各指摘は解消された。今回の改訂箇所にも実装を止める Critical / High の破綻はない。

## 指摘事項

なし。

## 実装者への申し送り

- ProcessorResult は `task.md:61-70` のとおり、intermediate を
  `end_of_response=false` / request history 同一、final を
  `end_of_response=true` / request history + response として排他的に検証する。中間の non-empty
  `voice_text` だけを TTS へ渡し、final の history commit と混同しない。
- `ClientSet.Activate` の linearization point と Coordinator の `running` 遷移は
  `task.md:174-211` の lock / event gate 順序を維持する。Connect return 前、
  return / Activate 間、Activate / publish 間の event race testを省略しない。
- Gate 2 は `task.md:268-318` の固定 command で、個別 stage resultを注入せず同じ Coordinatorへ
  PCMだけを投入して 4 stageを連続して通す。既存 `sample02.wav` は原本 SHA-256
  `3f9169ec597de0f8fc17b4b6e4f89ea05e8792f42bfb48bfa7c33277318d3759`、
  24 kHz / mono / s16 PCMであることを現行 repositoryで確認した。指定 nearest-neighbor 変換も
  171,008 byte、SHA-256
  `a0375e761e7a483117a7535a5da7ed0ef0036611916a0b0e534403e551789933` と一致する。
- 初回接続中の明示 `Close()` では待機中 `Start` が `ErrClosed` を返す契約と、external output の
  generation barrier / close ownershipを race testで確認する。
- 実 service、model / backend、4 originを用意できない場合は Gate 2 を skip / PASS にせず、
  task.mdどおり FAIL として artifactへ記録する。
