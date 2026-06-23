# Review: task-260623221639-character-animation-3-motion-metrics-baseline

## 判定

APPROVED

前回残指摘は解消され、実装 API とテスト期待値を分岐させる blocking な未確定は残っていない。残る注意点は実装時の整合確認で足りるため、実装へ進ませてよい。

## 指摘事項

なし。

## 実装者への申し送り

- `MotionMetricConfig` と `generatedAtIso` は `task.md:59-69` で固定済み。pure function 方針に従い、実装では `new Date()` や `performance.now()` を呼ばず config / frame timestamp だけを使う。
- comparison status は `not_comparable` を含む 4 値へ統一済み（`task.md:16`, `task.md:87-97`）。片側 `not_available` のテストを追加するとよい。
- metric 入力 slot は先行 schema / recorder / replay タスクの `frame.poseSnapshot` と `frame.solver.poseRetarget` 方針に整合している。実装時は依存タスクの最終 export 名に合わせ、互換 alias を増やさないこと。
- `neutralJitter` は `ratio` 単位へ修正済み。`MotionMetricResult.unit` union には `px` も残るが、初期 metrics では必要な metric だけ正しい unit を使えばよい。
- baseline parser は `parseMotionMetricBaseline(value: unknown)` と success/failure union が固定済み。`motionMetricBaselineSchema.ts` 側でこの result shape をそのまま返す。
