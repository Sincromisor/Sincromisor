# Implementation Log

## attempt 1

### 変更概要

- Worker result message と main-thread stats に optional `gestureInferenceTimeMs` を追加し、lost を含む Gesture pass 実行 frame の実測値を recording の既存 tracker stats 経路へ渡した。
- total duration は既存 `workerTimeMs` / `mainThreadDetectTimeMs` を維持した。Worker の開始点は `detect()` entry の initialize 前、main-thread は callback 冒頭のままで、どちらも result / stats 合成直前に同一 performance clock から一度だけ算出する。
- motion-debug tracker duration の layer parser と baseline 専用 nearest-rank p95 summary を追加した。mode 別 total 選択、旧 log 欠損、field 単位 warning、0/1/複数 sample を focused test で固定した。
- `tracking.md` / `motion.md` に clock、包含・除外範囲、欠損、旧 log 互換、p95 母集団を同期した。

### 検証

- focused: motion tracker performance samples + tracker runtime、9 tests PASS。
- Biome: 581 files PASS。
- frontend build/type: PASS。
- full tests: 78 files PASS / 1 skipped、530 tests PASS / 2 skipped。
- `npm run gate`: lint 段の Markdown check で、実装前から存在する task artifact 4 files（本 task の変更禁止 `task.md` を含む）の format 差分により FAIL。production source、追加 test、設計文書には format 差分なし。変更禁止ファイルと他 task の artifact は編集しなかった。

### TypeScript production comment audit

| path                                  | symbol or decision                                        | kind                    | current comment                                                                         | decision   | required maintenance knowledge                                                                                 | action                                      | reviewer note                                                 |
| ------------------------------------- | --------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `sincroTrackerWorkerTypes.ts`         | `SincroTrackerWorkerResultMessage.gestureInferenceTimeMs` | Worker message boundary | pass 実行 frame と Worker clock を説明                                                  | retain/add | skipped は欠損、lost result は実測値を保持し、plain number だけを跨がせる                                      | field comment を追加                        | Worker transport latency と混同しない                         |
| `sincroTracker.worker.ts`             | `detect()` duration owner                                 | duration owner          | module contract と既存 resource comment。開始点はコード上 `initialize()` 前で明白       | retain     | `workerTimeMs` は初回 initialize cost を含み、result 組み立て直前まで。round-trip は除外                       | 逐語 comment は追加せず設計文書へ契約を記録 | start marker を optional pass 内へ移動しない                  |
| `sincroTrackerWorkerTypes.ts`         | `SincroTrackerWorkerStats`                                | stats contract          | module comment が保存可能な message contract を説明                                     | retain     | gesture field は optional。total field を二重化せず mode 別既存 field を使う                                   | type field を追加                           | finite/non-negative validation は recording parser 境界で行う |
| `trackerRuntimeMainThreadPipeline.ts` | `runTrackerRuntimeMainThreadPipeline()`                   | duration owner          | exported pipeline comment が callback publish boundary を説明                           | retain     | callback 冒頭から optional Gesture を含む stats 合成直前までを同一 clock で計測し、skipped は欠損、lost は保持 | gesture result を stats input へ接続        | `performance.now()` の追加 clock を Gesture 用に作らない      |
| `motionTrackerPerformanceSamples.ts`  | `parseTrackerPerformanceDurationSamples()`                | recording layer parser  | module comment と public function comment が旧 log、field 単位 invalid、mode 分離を説明 | add        | 欠損は warning なし。不正 field だけ除外し、別 mode の total field は混用しない                                | module/public comment を追加                | warning path は固定 union                                     |
| `motionTrackerPerformanceSamples.ts`  | `calculateTrackerPerformanceDurationSummary()`            | p95 aggregator          | public function comment が finite parsed sample と nearest-rank を説明                  | add        | Gesture skipped は分母外、初回 initialize sample は除外せず、0件は null                                        | public comment と設計文書を追加             | 既存 `MotionMetricSummary` へ接続しない                       |

### 逸脱・詰まり

- worktree 作成直後が指定ブランチではなく detached HEAD だったため、最初のコミット後に指定ブランチを同じ HEAD から作成した。実装内容・commit SHA は失われていない。
- gate の Markdown failure は上記4 task artifact の既存 formatting。task.md 変更禁止と他 task 非干渉を優先し、変更していない。

## attempt 2

### 評価指摘への対応

- Worker の duration owner を `measureWorkerTrackerFrame()` に抽出し、clock start が initialize callback より前、clock end が detect callback 後になる契約を production code と deterministic test で共有した。initialize 済み（no-op）/未済み（model load 相当）の両経路を絶対時刻へ依存せず固定し、初回 cost を除外しない。
- main-thread の duration owner を `createMainThreadTrackerFrameMeasurement()` に抽出した。callback entry で一度 start を読み、optional Gesture pass 後・stats publish 直前に同じ injected clock から一度だけ total を算出する。
- main-thread の Gesture executed / skipped / lost と Worker message の executed / skipped / lost を focused test に追加した。lost は `detected` 状態にかかわらず pass の `inferenceTimeMs` を保持し、skipped は field を省略する。

### 検証

- focused duration/parser: 2 files、7 tests PASS。
- Biome: 583 files PASS。
- frontend build/type: PASS。
- full tests: 79 files PASS / 1 skipped、534 tests PASS / 2 skipped。
- Markdown gate blocker 4件は親オーケストレーター対応のため変更していない。

### TypeScript production comment audit（追加分）

| path                                   | symbol or decision                          | kind                       | current comment                                                            | decision | required maintenance knowledge                                                    | action                                                 | reviewer note                                                           |
| -------------------------------------- | ------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `trackerRuntimeDurationMeasurement.ts` | `measureWorkerTrackerFrame()`               | Worker duration owner      | public comment が detect entry、initialize、全 inference pass の包含を説明 | add      | clock start を initialize 後へ移動すると初回 frame だけ契約が変わる               | production helper と deterministic clock test を追加   | initialized/no-op と uninitialized/model-load の双方で同じ owner を使う |
| `trackerRuntimeDurationMeasurement.ts` | `createMainThreadTrackerFrameMeasurement()` | main-thread duration owner | public comment が単一 monotonic clock と optional Gesture を説明           | add      | start/end で同じ clock closure を使い、finish は stats publish 直前に一度だけ呼ぶ | production helper と executed/skipped/lost test を追加 | callback intervalやrender時間を含めない                                 |
| `trackerRuntimeDurationMeasurement.ts` | `createWorkerGestureDurationFields()`       | Worker message boundary    | public comment が pass result 存在時だけserializeする条件を説明            | add      | lost は結果が存在するため保持、skipped のみ欠損                                   | production helper と detected/lost/skipped test を追加 | plain number以外のruntime objectをmessageへ含めない                     |

### コミット

- `a08bff2d` `test(tracking): fix duration measurement contracts`
