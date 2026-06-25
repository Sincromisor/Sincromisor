# Implementation Log: task-260626014922-character-animation-3-phase-7-initial-calibration-contract

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- review.md の申し送りどおり、`hand_open` は optional hand step として扱い、`degraded` / `retry` の両方で `ready_without_hands` になる test を追加した。
- initial calibration は MediaPipe raw landmark や browser camera API を読まない pure contract として実装した。入力は `ReliabilityMap`、optional `CameraQualityScore`、optional `CanonicalUpperBodyState`、`validDurationMs` に限定した。
- `precheck` は camera unavailable の hard failure だけを session `failed` の根拠にし、`neutral` / `a_pose` が degraded threshold 未満の場合だけ core failure として扱うようにした。
- `initialSincroCalibration.ts` は公開 export 境界に留め、step check、step evaluation、session summary、guide message mapping を分割した。各ファイルを構造ルールの hard threshold 未満に抑えるため。
- 公開挙動の追加なので、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に status / step / 入力境界 / 通常 UI と debug UI の情報境界を同期した。

### 確認結果

- `cd sincromisor-frontend && npm run test -- initialSincroCalibration`: PASS
- `cd sincromisor-frontend && npm run check:biome`: PASS
- `cd sincromisor-frontend && npm run check:md`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS (`lint` / `build` / `test`, full vitest 28 files / 226 tests)

### 未実行確認

- 実カメラ UI / wizard / persistence は本タスクのスコープ外のため未実行。

### 残リスク

- `too_dark` は現行 `CameraQualityScore` に直接対応する reason が無いため、今回の pure module では明示入力が来た場合の guide message mapping のみ固定した。brightness 解析や camera quality component 追加は後続 task の範囲。
