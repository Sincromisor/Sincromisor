# character animation 3.0 phase 12 motion metrics module split

## 背景 / 目的

`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts` は 1946 行あり、metric contract、threshold、Zod parser、各 metric calculator、summary、baseline comparison が 1 ファイルに同居している。`documents/rules/code-structure.md:17` の hard threshold を大幅に超え、`documents/rules/code-structure.md:29` の「schema validation と純粋計算を混ぜない」にも反している。

このタスクでは外部 API と挙動を維持したまま、motion metrics を責務別 module に分割し、公開 API と非自明な metric 判断にコメントを追加する。

依存:

- `task-260628200308-character-animation-3-0-phase-12-code-structure-guard`

## 完了条件（受け入れ条件）

- [ ] 既存 import 互換のため、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts` は facade として残し、既存 export 名を維持する。
- [ ] `motionMetrics.ts` から次の module へ責務を分割する。
    - `motionMetricTypes.ts`: `MotionMetricKey`、`MotionMetricResult`、`MotionMetricSummary`、`MotionMetricConfig`、`MotionMetricComparison` などの公開型。
    - `motionMetricThresholds.ts`: `MOTION_P0_FIXTURE_IDS`、`MOTION_METRIC_KEYS`、`DEFAULT_MOTION_METRIC_THRESHOLDS`、unit / direction 定義。
    - `motionMetricFrameParsers.ts`: replay frame / Zod parser / parser helper。
    - `motionMetricBaseCalculators.ts`: neutral jitter、elbow flip、reach clamp、tracking loss、side swap、latency。
    - `motionMetricTrackerCalculators.ts`: tracker budget / dropped frame / degradation / ROI pause。
    - `motionMetricTemporalCalculators.ts`: temporal arm state / temporal jitter / recovery jump。
    - `motionMetricSolverCalculators.ts`: solver / final pose / angular velocity 系。
    - `motionMetricIntentCalculators.ts`: gesture flicker / semantic fallback / cooldown / invalid intent。
    - `motionMetricSummary.ts`: `calculateMotionMetricSummary()`。
    - `motionMetricComparison.ts`: `compareMotionMetricSummaries()`。
- [ ] 各新規 production module は原則 300 行以下にする。超える場合は同じ行に `// reason: structure-threshold-exception <理由>` を付け、なぜさらに分割しないかを書く。
- [ ] `calculateMotionMetricSummary()` と `compareMotionMetricSummaries()` の引数・戻り値・既存挙動を変えない。
- [ ] `MotionMetricKey` と `MOTION_METRIC_KEYS` の順序を変えない。
- [ ] `DEFAULT_MOTION_METRIC_THRESHOLDS` の値を変えない。
- [ ] Zod parser の失敗時挙動を変えない。旧 replay log の欠損 field は現状と同じ `not_available` / fallback になる。
- [ ] 公開型、facade、metric group module の先頭に、日本語コメントで「保存 contract / metric group の境界 / 非対象」を説明する。
- [ ] threshold や comparison tolerance のような非自明な判断には、理由または由来を日本語コメントで残す。単純な代入説明コメントは追加しない。
- [ ] 既存テストを module split 後も通す。テスト都合だけで private helper を export しない。テストが必要な helper は責務名付き module へ移す。
- [ ] `documents/design/frontend/character/motion.md` の metrics / QA regression 説明に、実装 module の責務分割を短く同期する。

## 設計判断（着手前に確定済み）

- facade 方式を採用する。既存 call site の import を一斉に変えると差分が広がるため、`motionMetrics.ts` から re-export する。
- metric group は phase 名ではなく責務名で分ける。Phase 番号は履歴であり、現在の読み手には tracker / temporal / solver / intent の責務名の方が検索しやすいため。
- parser は calculator から分離する。schema validation と metric 計算が同居すると旧 log 互換の判断と数値計算の変更影響が読みにくいため。
- `MOTION_METRIC_KEYS` の順序は保持する。candidate report や baseline comparison が deterministic order に依存しているため。
- 外部境界は replay log frame の `unknown` 値だけである。network、LLM、DB、外部 telemetry は使わない。境界値は parser module で検証し、calculator には型付き値を渡す。

## スコープ境界

- 本タスクでやること:
    - `motionMetrics.ts` の責務別分割。
    - 既存公開 API の維持。
    - 主要境界コメントの追加。
    - design doc の実装責務分割同期。
- 本タスクでやらないこと:
    - metric key の追加・削除。
    - threshold / status 判定の変更。
    - QA regression の判定仕様変更。
    - motion-debug UI の変更。
    - baseline artifact の更新。
- 依存タスクとの境界:
    - code structure guard は悪化防止を提供する。本タスクは最初の大規模分割対象として、その guard の方針に合わせて例外を最小化する。

## 実装方針（既存コード整合: file:line）

- `MotionMetricKey` は `motionMetrics.ts:34` で定義されている。分割後も同じ union と key 名を維持する。
- `DEFAULT_MOTION_METRIC_THRESHOLDS` は `motionMetrics.ts:138` にある。値を変えず `motionMetricThresholds.ts` へ移す。
- Zod parser 群は `motionMetrics.ts:201` から始まり、frame parser helper は `motionMetrics.ts:327` 以降にある。これらを `motionMetricFrameParsers.ts` へ移す。
- `calculateMotionMetricSummary()` は `motionMetrics.ts:1631` で export されている。公開入口は維持し、実体は `motionMetricSummary.ts` へ移す。
- `compareMotionMetricSummaries()` は `motionMetrics.ts:1819` で export されている。公開入口は維持し、実体は `motionMetricComparison.ts` へ移す。
- design doc は motion-debug metrics と QA regression の契約を `documents/design/frontend/character/motion.md:79` 以降で説明している。実装責務の説明はこの周辺へ追記する。

## テスト

- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run test -- motionQaRegression`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check:frontend-structure`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、motion metrics は developer-visible replay / QA artifact の中核であり、実装責務分割を `documents/design/frontend/character/motion.md` に同期する。
