# Implementation Log: task-260629225919-production-sincro-motion-replay-baselines

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- review.md は APPROVED / freshness FRESH のため実装に進めた。
- Production TypeScript code は変更しない条件のため、`motionMetrics.ts` は current export の確認だけに留めた。
- 現行 `MOTION_P0_FIXTURE_IDS` は `single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return` を使っており、task.md の human-readable fixture id と一部異なる。manifest では requested baseline fixture id と current metrics facade fixture id を分け、後続 metrics summary が current facade の id に合わせられるようにした。
- 実装 sandbox から実カメラ recording / browser camera session を取得できないため、6 件すべてを `source: not-captured` とした。synthetic replay log はこの task artifact では生成していない。実機 baseline と混同しないことを優先した。

### 取得可否

- `neutral-10s`: not captured。再取得条件、synthetic 代替なし、privacy scrub 済みを manifest に記録。
- `left-arm-raise-slow`: not captured。metrics facade id は `single-arm-slow-raise` として記録。
- `both-arms-raise-slow`: not captured。metrics facade id は `both-arms-slow-raise` として記録。
- `arm-dropout-return`: not captured。metrics facade id は `hand-out-and-return` として記録。
- `arms-cross`: not captured。
- `fast-wave`: not captured。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` の motion-debug / metrics 節へ baseline manifest の参照方法と `source` 確認、`sincro.motion-metrics.v1` / `MOTION_P0_FIXTURE_IDS` の扱いを追記した。
- 公開 API / WebRTC 契約 / production TS surface は変更していないため、追加の API 文書同期は不要。

### Comment Audit

- 対象外。Production TypeScript code は変更しておらず、docs / task artifact のみを変更した。

### 検証

- `cd sincromisor-frontend && npm run test -- motionQaRegression`
- `npm run tasks:check`
- `npm run tasks:index:check`
- `npm run gate`

### 未実行

- 実カメラ recording: sandboxed implementation environment に browser camera session と実機入力が無いため未実行。
- Replay log / metrics summary 生成: real production capture が無く、synthetic と実機 baseline の混同を避けるため未生成。

### ゲート補足

- 初回 `npm run gate` は今回の変更外である `task-260629225914-production-sincro-motion-pipeline-state-contract/impl.md` の Markdown table formatting で lint fail した。
- clean commit 上でも gate が再現して通るよう、同ファイルを Prettier-only で整形した。内容判断の変更はない。
- 再実行した `npm run gate` は lint / build / test すべて pass。test は 52 files / 407 tests passed。
- commit: `dfb8d1408f209a0ace850b5db566031da6e421da`
