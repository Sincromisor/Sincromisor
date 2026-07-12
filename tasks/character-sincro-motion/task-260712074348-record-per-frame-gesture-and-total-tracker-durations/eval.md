# Evaluation: task-260712074348-record-per-frame-gesture-and-total-tracker-durations

## 判定

FAIL

対象 commit: `47345c26fa064a019bbd33d2f3e777827d696198`

## 検証結果

- production build/type: PASS（`npm run build`）。
- Biome: PASS（581 files）。
- parser/summary focused test: PASS（3 tests）。旧 log 欠損、mode 別 total 選択、field 単位 invalid warning、nearest-rank p95 の 0/1/複数 sample を確認した。
- `npm run gate`: FAIL。lint の Markdown format check が task artifact 4件で停止し、後段は gate 経由では未実行。
- 実装差分と既存 test suite を照合した結果、受け入れ条件で明示された runtime duration の focused test が追加されていない。

## Blocking issues

### 1. runtime duration 契約の focused test が不足している

変更された test は `motionTrackerPerformanceSamples.test.ts` のみであり、main-thread / Worker runtime の新しい duration 伝播を直接検証する test はない。既存 `trackerRuntime.test.ts` に Gesture lost の振る舞いを確認する test はあるが、`gestureInferenceTimeMs` や total duration の開始・終了点を assert していない。

受け入れ条件を満たすには、少なくとも次を focused test で固定する必要がある。

- main-thread Gesture executed / skipped / lost frame で、実行時（lost を含む）だけ `gestureInferenceTimeMs` が stats に渡ること。
- main-thread の `mainThreadDetectTimeMs` が callback 冒頭から optional pass 後・stats 合成直前まで、同一 clock の一度の差分であること。
- Worker result が Gesture 実行時（lost を含む）に個別時間を plain number として持ち、skipped 時は欠損すること。
- Worker の initialize 済み / 未済みの両経路で `workerTimeMs` の開始点が `detect()` entry、すなわち未初期化時には initialize cost を含むこと。

これはタスクの明示的な受け入れ条件かつ reviewer の申し送りであり、実装が自然にそう見えることだけでは代替できない。

### 2. 3点ゲートが PASS していない

Markdown format failure は次の4件に限定され、production source、追加 test、変更した設計文書の問題ではない。

- 本 task の `task.md`
- `task-260712044931-expose-calibration-retry-ui/{eval.md,impl.md}`
- `task-260712044932-capture-gesture-camera-performance-baseline/impl.md`

したがってコード実装の不具合とは判定しないが、完了条件の `npm run gate` PASS を満たさないため形式上 blocking である。実装者の変更禁止範囲を越える既存 task artifact 3件はオーケストレーター側で整形責任を判断し、本 task の状態文書も close 前に整形したうえで gate を再実行する必要がある。

## 受け入れ条件・設計文書・comment audit

- stats / Worker message / main-thread propagation / parser / p95 実装は、コード読解上は要求された field と mode 契約に整合する。
- recording は既存 tracker stats 保存経路を利用するため schemaVersion v1 と旧 log 互換を維持している。
- `tracking.md` と `motion.md` は clock、包含範囲、欠損、mode 別 total、p95 母集団、旧 log 互換を同期している。
- `impl.md` の comment audit は必須 boundary を列挙し、実コードの public parser/summary と Worker message boundary のコメント、および設計文書への契約配置と整合する。逐語的・stale な新規コメントは見当たらない。

## 再評価条件

1. 上記 runtime focused tests を追加して PASS させる。
2. Markdown format blocker を解消する。
3. `npm run gate` を対象 commit の clean worktree で PASS させる。

---

## attempt 2

### 判定

PASS

対象 commit: `f1fdacddb51c`

### 前回 blocking の解消確認

- runtime focused tests: 解消。production で利用する duration helper を deterministic clock で直接検証し、main-thread の executed / skipped / lost、Worker message の executed / skipped / lost、Worker initialize 済み / 未済みの開始点を固定している。
- Markdown gate blocker: 解消。前回指摘した task artifact 4件は commit `f1fdacdd` で整形済み。
- `npm run gate`: PASS（clean worktree、lint/build/test は content-addressed cache hit）。full test は 534 passed / 2 skipped。
- focused test を評価者が直接再実行し、2 files / 7 tests PASS。

### Coverage 所見

- `createMainThreadTrackerFrameMeasurement()` は callback entry で clock を1回読み、finish 時に同じ clock を1回だけ読み、optional pass 後の total と Gesture 個別値を返す。skipped は欠損、lost 実行結果は値を保持する。
- `measureWorkerTrackerFrame()` は initialize より前に開始し、initialize と全 detect pass 後に終了する。no-op initialize と model-load 相当の両経路を絶対時刻に依存せず検証している。
- `createWorkerGestureDurationFields()` は executed / lost の plain number を message field にし、skipped のみ省略する。
- parser/summary tests は旧 log 欠損、mode 別 total、不正 field 単位 warning、nearest-rank p95 の 0/1/複数 sample を維持している。

### 設計文書・comment audit

- `tracking.md` / `motion.md` の clock、包含・除外範囲、欠損、mode 別 total、旧 log 互換、p95 母集団は production helper の契約と整合する。
- attempt 2 の comment audit は Worker duration owner、main-thread duration owner、Worker message boundary を追加し、実コードの public comment と一致する。
- recording parser / p95 aggregator を含む attempt 1 の audit も引き続き実装と整合し、stale または逐語的な blocking comment は見当たらない。

### 残課題

なし。
