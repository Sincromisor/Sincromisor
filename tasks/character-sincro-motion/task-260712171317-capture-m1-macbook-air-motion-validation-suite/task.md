# M1 MacBook Airでジェスチャーの基準値を取得

## 背景 / 目的

M1 MacBook Air の内蔵カメラでジェスチャー任意合格の負荷、ちらつき、中立姿勢での誤検出を測る。
これは運用基準の取得タスクであり、意味に基づく動作 / 指切り戻し削除の前提にはしない。

## 完了条件（受け入れ条件）

- [ ] `balanced` プロファイル、同一ブラウザ、同一照明・カメラ位置でジェスチャー合格 `on` / `off` を各60秒収録する。
- [ ] 各モードは中立 30秒と複数のジェスチャー 30秒で構成する。複数のジェスチャーでは手振り、pointing、thumbsUp、peace、
      手未検出 / 復帰済みを順に行う。
- [ ] 構成情報に OS / ブラウザバージョン、カメラ幅 / 高さ / fps、照明記述、プロファイル、ジェスチャー合格モード、開始時刻を残す。
      `deviceId` / `groupId` は保存しない。
- [ ] Motion 診断 NDJSON は
      `work/private-artifacts/task-260712171317-capture-m1-macbook-air-motion-validation-suite/recordings/` に置き、Git へ追加しない。
- [ ] 公開成果物は `artifacts/metrics.json`、`artifacts/verdict.md`、`artifacts/capture-manifest.json` とする。
- [ ] 既存の記録解析処理 / 指標補助処理で両モードの継続時間、`frameCount`、
      `gestureInferenceDurationMsP95`、`totalTrackerDurationMsP95`、`ownedBoneConflictCount`、
      `gestureFlickerPerMinute`、中立姿勢での誤検出 ms、`degradationRate` を集計する。
- [ ] 検査は `gestureInferenceDurationMsP95 <= 12ms`、`totalTrackerDurationMsP95 <= 28ms`、
      `ownedBoneConflictCount = 0`、`gestureFlickerPerMinute <= 6`、中立姿勢での誤検出 `<= 1000ms`、
      有効時と無効時の `degradationRate` 差 `<= 0.05` とする。欠損値または不正な時刻があれば PASS にしない。
- [ ] 基準超過時は調整せず、超過指標と再現条件を `verdict.md` に記録する。
- [ ] 採用 NDJSON の SHA-256 と集計結果を一度確認し、`npm run tasks:check` と Markdown 確認を実行する。

## スコープ境界

- 本タスク: 120秒の収録、集計、判定、公開要約。
- スコープ外: 本番コード変更、映像の同時保存、将来用途の IK / ROI / 較正素材、独立評価での全原本再計算、
  複数端末・複数 VRM 比較。

追加の実機素材は、具体的な回帰または調整タスクが必要とした時点で、そのコードと評価対象に合わせて収録する。

## 実装・検証方針

- `sincromisor-frontend/src/character/motionEvaluation/motionTrackerPerformanceSamples.ts` の既存集計を使う。
- 収録前に10秒以下の事前確認でカメラ権限、公開、空き容量を確認する。
- 本番コードまたは集計補助処理の変更が必要なら別タスク化し、本タスクへ混ぜない。

## ドキュメント同期

公開契約は変わらない。判定によって取り組み計画の現在地が変わる場合だけ、実施環境と成果物リンクを追記する。
