# Review: task-260629225942-production-retarget-composer-motion-metrics-comparison

## 判定

NEEDS_REVISION

レビュー時点では APPROVED だったが、依存タスクの完了結果により前提が変わった。
`task-260629225919-production-sincro-motion-replay-baselines` は done/PASS だが、baseline
artifact は全 6 fixture が `source: not-captured` であり、replay log / metrics summary は未生成である。

## Blocking findings

- [High] `task.md` は「baseline replay と dry-run result」を使い、「baseline artifact の 6 fixture について旧経路と composer dry-run の comparison summary を生成できる」ことを完了条件にしている。しかし現在の baseline manifest は全 fixture が `source: not-captured` で、実比較に使う replay log / metrics summary が存在しない。実データに基づく旧経路と composer dry-run の comparison summary は生成できない。
- [High] `not-captured` fixture を `not_available` warn 以上の availability / comparison-unavailable summary として完了扱いにできる、という解釈が `task.md` に明記されていない。現状の `not_available` 条件は「composer dry-run が無い旧 log」の扱いであり、「旧 log 自体が無い baseline manifest」の扱いではないため、実装者と evaluator の解釈が分かれる。

## Non-blocking notes

- dry-run 側の `SincroVrmPoseComposerDryRunResult` / state / Debug Console summary、`motionMetrics.ts` facade re-export、`not_available` を warn 以上にする設計前提は現在 HEAD でも成立している。
- この task を進めるなら、`source: not-captured` の 6 fixture は実比較ではなく `comparison-unavailable` / `not_available` summary を生成する、と受け入れ条件、artifact schema、severity、検証方法に明記する必要がある。
- 実録比較を必須にするなら、baseline recapture を先行依存に戻す必要がある。

## 最終判断

NEEDS_REVISION。現状の task.md のまま実装へ進むと、実比較 summary 必須なのか unavailable summary で可なのかが曖昧なままになり、独立評価で判定が割れる。
