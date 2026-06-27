# character animation 3.0 phase 10 fixed motion qa regression harness

## 背景 / 目的

Phase 10 は、固定テストモーション、主観評価フォーム、metrics regression を `motion-debug` と接続することを求めている。既存の `MotionMetrics` と baseline parser はあるが、P0 fixture を一括で読み、metrics を計算し、baseline と比較して regression を機械判定する harness がない。

このタスクでは video asset 自体の制作ではなく、`motion-debug` replay log / synthetic fixture log を対象にした fixed motion QA regression harness を作る。これにより、Phase 10 までの pipeline 変更を同じ fixture id / baseline / metrics で比較できるようにする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionQaRegression.ts` を追加し、`MotionQaFixtureManifest`、`MotionQaRegressionConfig`、`MotionQaRegressionInput`、`MotionQaRegressionResult`、`runMotionQaRegression(input)` を export する。
- [ ] `MotionQaFixtureManifest` の schemaVersion は `"sincro.motion-qa-fixture-manifest.v1"` に固定し、`fixtures` は `MOTION_P0_FIXTURE_IDS` の subset を許す。各 fixture は `fixtureId`、`logText` または `logUrl` のどちらか 1 つ、optional `baseline: unknown`、optional `subjectiveChecklist` を持つ。
- [ ] manifest validation は unknown fixture id を fixture result `status: "invalid_fixture"`、duplicate fixture id を 2 件目以降 `status: "invalid_fixture"`、空 `fixtures` を全体 `overall: "fail"` として扱う。P0 全件が揃っていないこと自体は invalid にしない。
- [ ] `MotionQaRegressionConfig` は `{ generatedAtIso: string; thresholdVersion: "initial-v1" | "custom"; thresholds?: Partial<Record<MotionMetricKey, MotionMetricThreshold>>; requireAllP0Fixtures?: boolean }` に固定する。`generatedAtIso` は caller 必須で、helper 内では `Date.now()` / `new Date()` を呼ばない。
- [ ] `runMotionQaRegression(input)` の入力は `{ manifest: unknown; config: MotionQaRegressionConfig; fetchLogText?: (url: string) => Promise<string> }` に固定する。fixture ごとに `parseMotionDebugLogLines()`、`calculateMotionMetricSummary()`、optional `parseMotionMetricBaseline()`、optional `compareMotionMetricSummaries()` を実行し、全 fixture の `summary.severity` と comparison を集約して `overall: "pass" | "warn" | "fail"` を返す。
- [ ] `config.requireAllP0Fixtures === true` の場合だけ、manifest に存在しない P0 fixture id を `status: "missing_fixture"` として result に補い、全体 `overall` を `fail` にする。既定は `false` とし、motion-debug loaded recording 1 件の window API では subset 実行を許す。
- [ ] `logText` と `logUrl` の両方が指定された fixture は invalid として fixture result を `status: "invalid_fixture"` にし、全体 `overall` を `fail` にする。どちらも無い fixture も同じく fail にする。
- [ ] `logUrl` の fetch は `fetchLogText?: (url: string) => Promise<string>` を caller が渡した場合だけ実行する。未指定で `logUrl` がある場合は `status: "unsupported_source"` とし、network fetch を helper 内で直接行わない。
- [ ] `logText` は `text.split(/\\r?\\n/)` で行分割し、末尾の空行だけを除去して `parseMotionDebugLogLines()` に渡す。途中の空行は invalid log として parser に渡し、fixture result を fail にする。
- [ ] baseline がある fixture では、candidate metric が `fail` になった場合、または comparison status が `regressed` かつ severityChanged の場合に fixture result を `fail` にする。`regressed` でも severityChanged が false の場合は `warn` にする。
- [ ] baseline が無い fixture では、metric summary の severity を fixture result として使い、`not_available` metric が 1 つでもある場合は fixture result を少なくとも `warn` にする。
- [ ] subjective QA は採点 UI を作らず、manifest 上の `subjectiveChecklist` を結果へ echo するだけにする。項目は `"natural" | "stable" | "intentReadable" | "noBreakage"` に固定し、機械判定には使わない。
- [ ] `motion-debug` window API に `runQaRegression(config: MotionDebugQaRegressionConfig)` を追加し、loaded recording 1 件に対して manifest subset 形式に包んで regression を実行できる。`MotionDebugQaRegressionConfig` は `MotionQaRegressionConfig & { fixtureId?: MotionP0FixtureId }` に固定する。fixture id は `config.fixtureId` があればそれを使い、無ければ loaded recording manifest の `source.fixtureId` が `MOTION_P0_FIXTURE_IDS` に含まれる場合だけ使う。どちらも無い場合は `fixtureId: "neutral-10s"` を使わず、API result を `{ ok: false; code: "fixture_id_required"; message: string }` にする。既存 `calculateReplayMetrics(config)` は維持する。
- [ ] window API の `runQaRegression()` result 型は `{ ok: true; result: MotionQaRegressionResult } | { ok: false; code: "no_recording_loaded" | "fixture_id_required"; message: string }` に固定する。pure helper の fixture-level errors は `ok: true` の `result.fixtures[].errors` に入れ、window API 自体の失敗は loaded recording / fixture id 解決不能だけに限定する。
- [ ] `sincromisor-frontend/src/character/motionEvaluation/__tests__/motionQaRegression.test.ts` を追加し、全 fixture pass、baseline regression fail、severity unchanged regression warn、missing log fail、unsupported logUrl、subjective checklist echo、旧 baseline missing key warning を検証する。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` または API test を更新し、window API から regression result の fixture id / summary severity / comparison / overall が確認できることを検証する。
- [ ] 小さな synthetic NDJSON fixture log を test helper 内で生成し、repo に大きな動画 / PNG / binary artifact を追加しない。
- [ ] `documents/design/frontend/character/motion.md` に Motion QA fixture manifest v1、regression 判定規則、subjective checklist の非機械判定方針、動画 asset を本タスクで追加しない判断を同期する。

## 設計判断（着手前に確定済み）

- harness は `src/character/motionEvaluation/motionQaRegression.ts` に置く。`pages/motionDebug` 配下に閉じる案は、将来 CI / task acceptance からも使うため採用しない。
- fixture manifest は subset 可を既定にする。P0 全件必須にすると loaded recording 1 件の window API と衝突するため、全件必須は `requireAllP0Fixtures: true` の opt-in に限定する。
- 初回は replay log / synthetic log を入力にし、video fixture の再推論は行わない。MediaPipe / browser / Worker 差で非決定になりやすく、Phase 10 regression harness の最初の目的である pipeline regression 判定に向かないため。
- `logUrl` は helper 内で直接 `fetch()` しない。ブラウザ / Node / test の実行環境差を避けるため、caller provided `fetchLogText` に限定する。
- subjective checklist は結果へ echo するだけで、pass / fail 判定には使わない。主観評価は重要だが、このタスクでは機械 regression harness と混ぜない。
- 動画 / PNG / 大きな fixture binary は追加しない。テストは synthetic NDJSON を使い、実動画 asset 追加は別タスクに残す。
- 外部境界は motion-debug NDJSON、baseline JSON、optional caller fetcher だけである。parse error は fixture 単位の fail とし、他 fixture の判定は継続する。

最小スキーマ:

```ts
export type MotionQaSubjectiveChecklistItem =
    | "natural"
    | "stable"
    | "intentReadable"
    | "noBreakage";

export type MotionQaFixtureManifest = {
    schemaVersion: "sincro.motion-qa-fixture-manifest.v1";
    fixtures: Array<{
        fixtureId: MotionP0FixtureId;
        logText?: string;
        logUrl?: string;
        baseline?: unknown;
        subjectiveChecklist?: MotionQaSubjectiveChecklistItem[];
    }>;
};

export type MotionQaRegressionConfig = {
    generatedAtIso: string;
    thresholdVersion: "initial-v1" | "custom";
    thresholds?: Partial<Record<MotionMetricKey, MotionMetricThreshold>>;
    requireAllP0Fixtures?: boolean;
};

export type MotionQaRegressionInput = {
    manifest: unknown;
    config: MotionQaRegressionConfig;
    fetchLogText?: (url: string) => Promise<string>;
};

export type MotionDebugQaRegressionConfig = MotionQaRegressionConfig & {
    fixtureId?: MotionP0FixtureId;
};

export type MotionDebugQaRegressionApiResult =
    | { ok: true; result: MotionQaRegressionResult }
    | {
          ok: false;
          code: "no_recording_loaded" | "fixture_id_required";
          message: string;
      };

export type MotionQaRegressionResult = {
    schemaVersion: "sincro.motion-qa-regression.v1";
    overall: "pass" | "warn" | "fail";
    fixtures: Array<{
        fixtureId: MotionP0FixtureId;
        status:
            | "pass"
            | "warn"
            | "fail"
            | "invalid_fixture"
            | "unsupported_source"
            | "missing_fixture";
        summary?: MotionMetricSummary;
        comparison?: Record<MotionMetricKey, MotionMetricComparison>;
        subjectiveChecklist: MotionQaSubjectiveChecklistItem[];
        errors: string[];
    }>;
};
```

## スコープ境界

- 本タスクでやること:
    - fixed motion QA regression harness。
    - manifest parser / runner / result aggregation。
    - loaded replay log からの motion-debug window API 接続。
    - unit test 用 synthetic NDJSON fixture。
    - motion 設計文書の同期。
- 本タスクでやらないこと:
    - 実動画 fixture asset の作成 / 追加。
    - Playwright で camera / video fixture を再推論してログを生成する E2E。
    - subjective QA form UI。
    - CI workflow への組み込み。
    - metrics key の追加。
- 依存タスクとの境界:
    - `task-260627234129-character-animation-3-0-phase-10-degradation-metrics` は degradation metrics を fixed key として追加する。本タスクはその metrics を含む `calculateMotionMetricSummary()` を呼ぶだけで、metric 定義は増やさない。

## 実装方針（既存コード整合: file:line）

- P0 fixture id は `MOTION_P0_FIXTURE_IDS` に固定されている（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:23`）。manifest はこの union だけを受け入れる。
- `calculateMotionMetricSummary()` は replay frames と config から summary を返す（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1502` 付近）。harness はこの関数を再利用し、別の metrics engine を作らない。
- `compareMotionMetricSummaries()` は metric ごとの regression comparison を返す（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1545`）。baseline がある fixture はこれを使う。
- baseline parser は `parseMotionMetricBaseline()` を正本とし、旧 baseline の missing key を補完する（`sincromisor-frontend/src/character/motionEvaluation/motionMetricBaselineSchema.ts:192`、`sincromisor-frontend/src/character/motionEvaluation/motionMetricBaselineSchema.ts:226`）。harness では raw baseline object を直接信用しない。
- motion-debug replay metrics は loaded recording から summary を計算している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:461`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:469`）。新 API は同じ loaded recording を manifest に包んで runner へ渡す。
- `MotionDebugApi` は window API の型正本である（`sincromisor-frontend/src/pages/motionDebug/types.ts:238`）。`runQaRegression(config)` は additive に追加し、既存 API は維持する。
- `MotionDebugApp.loadVideoFixture()` は fixture video stream を読み込むが、これは video re-inference 用である（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:359`）。本タスクの regression harness は replay log 入力に限定し、この関数を呼ばない。
- recording frame は `frame.metrics.tracker` と `frame.metrics.cameraQuality` を保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:223`）。harness は保存済み metrics を読むだけで live runtime には触らない。

## テスト

- `cd sincromisor-frontend && npm run test -- motionQaRegression`
- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run test -- motionMetricBaselineSchema`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer-visible な motion-debug QA regression API と artifact manifest が増えるため、`documents/design/frontend/character/motion.md` に Motion QA fixture manifest v1、判定規則、subjective checklist の扱い、動画 asset を本タスクで追加しない判断を同期する。
