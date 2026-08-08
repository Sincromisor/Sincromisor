# Capture M1 MacBook Air gesture baseline

## 背景 / 目的

M1 MacBook Air の内蔵カメラで Gesture optional pass の負荷、ちらつき、neutral false-positive を測る。
これは運用 baseline の取得タスクであり、semantic / finger rollback 削除の前提にはしない。

## 完了条件（受け入れ条件）

- [ ] `balanced` profile、同一ブラウザ、同一照明・カメラ位置で Gesture pass `on` / `off` を各60秒収録する。
- [ ] 各 mode は neutral 30秒と mixed gesture 30秒で構成する。mixed gesture では wave、pointing、thumbsUp、peace、
      hand lost / recovered を順に行う。
- [ ] manifest に OS / browser version、camera width / height / fps、照明記述、profile、Gesture pass mode、開始時刻を残す。
      `deviceId` / `groupId` は保存しない。
- [ ] Motion Debug NDJSON は
      `work/private-artifacts/task-260712171317-capture-m1-macbook-air-motion-validation-suite/recordings/` に置き、Git へ追加しない。
- [ ] 公開 artifact は `artifacts/metrics.json`、`artifacts/verdict.md`、`artifacts/capture-manifest.json` とする。
- [ ] 既存の recording parser / metrics helper で両 mode の duration、frameCount、
      `gestureInferenceDurationMsP95`、`totalTrackerDurationMsP95`、`ownedBoneConflictCount`、
      `gestureFlickerPerMinute`、neutral false-positive ms、degradationRate を集計する。
- [ ] gate は `gestureInferenceDurationMsP95 <= 12ms`、`totalTrackerDurationMsP95 <= 28ms`、
      `ownedBoneConflictCount = 0`、`gestureFlickerPerMinute <= 6`、neutral false-positive `<= 1000ms`、
      on-off degradationRate 差 `<= 0.05` とする。欠損値または不正な timestamp があれば PASS にしない。
- [ ] 基準超過時は tuning せず、超過 metric と再現条件を `verdict.md` に記録する。
- [ ] 採用 NDJSON の SHA-256 と集計結果を一度確認し、`npm run tasks:check` と Markdown check を実行する。

## スコープ境界

- 本タスク: 120秒の収録、集計、判定、公開 summary。
- スコープ外: production code 変更、映像の同時保存、将来用途の IK / ROI / calibration 素材、独立評価での全原本再計算、
  複数端末・複数 VRM 比較。

追加の実機素材は、具体的な regression または tuning task が必要とした時点で、そのコードと評価対象に合わせて収録する。

## 実装・検証方針

- `sincromisor-frontend/src/character/motionEvaluation/motionTrackerPerformanceSamples.ts` の既存集計を使う。
- 収録前に10秒以下の preflight で camera permission、export、空き容量を確認する。
- production code または集計 helper の変更が必要なら別タスク化し、本タスクへ混ぜない。

## ドキュメント同期

公開 contract は変わらない。判定によって roadmap の現在地が変わる場合だけ、実施環境と artifact link を追記する。
