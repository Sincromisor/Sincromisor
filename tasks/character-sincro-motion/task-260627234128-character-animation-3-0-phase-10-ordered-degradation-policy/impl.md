# Implementation Log: task-260627234128-character-animation-3-0-phase-10-ordered-degradation-policy

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- review.md の申し送りどおり、既存 `TrackerRuntimeDegradationState` union は変更せず、詳細 stage は `SincroTrackerWorkerStats.degradationPolicy` に閉じた。
- ordered degradation policy は DOM / MediaPipe 非依存の pure controller とし、over-budget / ROI threshold / budget unknown、stage skip 禁止、counter reset、recovery 逆順、main-thread clamp、`ignorePerformanceFallback` 境界を unit test で固定した。
- `ignorePerformanceFallback: true` は `face-only` / `comfortable-idle` 自動遷移だけ抑制し、reduced fps / ROI pause stage と stats 記録は維持した。
- ROI budget controller は policy pause と budget pause を分け、policy 由来 `hand_roi_paused` が `fallbackCount` / `skippedFrames` を直接増やさないようにした。
- Runtime 側は既存 explicit target fps を policy で上げないよう base target で cap した。main-thread fallback 中は既存 clamp を優先する。
- 既存 face-only fallback は Pose tracker lifecycle 上、同一 runtime 内で Pose tracker を自動再初期化しない。policy の recovery 条件と逆順遷移は pure controller で検証し、runtime では既存 fallback 経路を壊さず degrade 入口として接続した。
- ドキュメント同期は `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に実施した。ordered degradation policy v1、stage 一覧、`ignorePerformanceFallback`、`comfortable-idle` の責務境界、metrics layer 表示を追記した。

### 確認

- `npm run test -- trackerRuntimeDegradationPolicy trackerRuntimeRoiBudget trackerRuntime motionDebugViewerModel`
- `npm run check`
- `npm run build`
- `npm run test`
- `npm run tasks:check`
- `npm run gate` PASS at `e19391f2d5752c717c1e457b7030417065d9767c`

### 詰まり / 回避

- root `tasks:check` は implementation worktree 側に root `node_modules` symlink が無く、最初は `yaml` import 不足で失敗した。main checkout の root `node_modules` へ一時 symlink を作成して確認と gate を実行し、gate 後に symlink は削除した。
- `npx prettier` は network lookup へ行き `ENOTFOUND` で失敗したため、ローカル binary `./sincromisor-frontend/node_modules/.bin/prettier` を直接使った。

### 残リスク

- `npm run gate` の表示は、一時 `node_modules` symlink が存在したため `dirty` 付きだった。gate 自体は PASS し、終了後に symlink を削除して implementation worktree は clean に戻した。
- 実機 / Playwright での `motion-debug` 手動確認は未実施。負荷再現が実機依存のため、policy と metrics layer は unit test と gate で代替確認した。

## attempt 2

### 判断 / 対応

- 評価 FAIL 1 への対応として、`budgetStatus: "ok"` でも `input.roi` が欠損している場合は budget unknown と扱い、recovery counter を進めないようにした。focused test で `roi === undefined` の ok frame が counter を増やさないことを固定した。
- 評価 FAIL 2 への対応として、policy が所有する `face-only` / `comfortable-idle` stage の間だけ Pose recovery probe を許可した。policy が `pose-reduced-fps` 以下へ戻った frame で `poseDegradedToFaceOnly` と `comfortableIdleActive` を解除し、以後の Face ROI / Hand cadence が通常の policy stage に従って再開できるようにした。
- legacy の非 policy face-only fallback は既存挙動を維持した。recovery probe は `TrackerRuntimeDegradationPolicyController` の stage が `face-only` / `comfortable-idle` の場合に限定している。
- runtime test は threshold / recovery frame を 1 にした profile と sequenced Pose inference time を使い、`face-only` / `comfortable-idle` 到達後に healthy Pose probe で `pose-reduced-fps` へ戻り、その後 Face ROI と Hand inference が再開することを固定した。
- 公開挙動の文書は attempt 1 で同期済みの内容と矛盾しないため、attempt 2 では追加更新しなかった。

### 確認

- `npm run test -- trackerRuntimeDegradationPolicy trackerRuntime`
- `npm run test -- trackerRuntimeDegradationPolicy trackerRuntimeRoiBudget trackerRuntime motionDebugViewerModel`
- `npm run check`
- `npm run build`
- `npm run test`
- `npm run gate` PASS at `173537dbfef3fbc472f35c4f601338973a994cfb`

### 詰まり / 回避

- runtime test では main-thread fallback 環境のため legacy budget degradation state は `main-thread-low-fps` が優先される。復帰順序の正本は詳細 slot の `degradationPolicy.stage` として検証した。
- `comfortable-idle` 到達 test の slow Pose inference は、face-only stage で Pose cadence が 1fps 相当に落ちるため、1000ms では over-budget にならなかった。2000ms にして profile budget を確実に超えるようにした。

### 残リスク

- 実機 / Playwright の motion-debug 手動確認は未実施。今回の修正範囲は policy controller と TrackerRuntime の状態遷移であり、focused unit / integration test と gate で確認した。
