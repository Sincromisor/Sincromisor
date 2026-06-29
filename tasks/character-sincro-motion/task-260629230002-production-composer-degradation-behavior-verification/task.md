# Verify production composer degradation behavior

## 背景 / 目的

Tracker runtime は ordered degradation policy により ROI pause、pose-reduced-fps、face-only、comfortable-idle へ落ちる。composer dry-run / observe-only pipeline がこれらの状態で固まったり、古い pose を保持し続けたりすると、本番適用時に大きな破綻になる。

本タスクでは degradation 中の observe-only / dry-run state の挙動を検証する。

## 完了条件（受け入れ条件）

- [ ] `artifacts/production-composer-degradation-verification.md` を作成し、`full`、`roi-hand-paused`、`pose-reduced-fps`、`face-only`、`comfortable-idle`、recovery の各 stage で observe-only state と composer dry-run がどう変化したか記録する。
- [ ] `face-only` / `comfortable-idle` では Pose / Hand 欠損により composer dry-run が `not_ready` または comfortable / fallback へ落ち、古い tracking pose を無期限に適用候補として保持しないことを確認する。
- [ ] recovery 時は `TemporalUpperBodyState` が `recovering` または設計された fallback 状態を通り、snap しないことを metrics / log で確認する。
- [ ] ROI pause 中も Face full-frame tracking が継続し、Face retarget の既存挙動を止めないことを確認する。
- [ ] 実機で degradation を再現できない場合は、replay / synthetic stats による検証を許可する。ただし artifact に再現方法の限界を明記する。
- [ ] production code の変更は原則なし。検証に必要な test helper の追加だけ許可する。

## 設計判断（着手前に確定済み）

- 本タスクは検証タスクであり、degradation policy の閾値調整はしない。
- comfortable pose の生成責務は tracker runtime ではなく Temporal / MotionSolver / VrmPoseComposer 側に置く既存設計を維持する。
- 「古い pose を保持しない」の判定は time-based にし、frame count だけに依存しない。低 fps / hidden tab で誤判定するため。

## スコープ境界

- 本タスクでやること: degradation stage ごとの observe-only / dry-run 検証、artifact、必要最小限の test helper。
- 本タスクでやらないこと: policy 閾値変更、performance profile 追加、VRM 適用 flag 追加。
- 依存タスクとの境界: dry-run task と Hand / ROI task が観測 state を提供する。本タスクはその劣化時挙動を確認する。

## 実装方針（既存コード整合: file:line）

- ordered degradation stage は `"full" -> "gesture-reduced-fps" -> "optional-pass-reduced-fps" -> "roi-hand-paused" -> "pose-reduced-fps" -> "face-only" -> "comfortable-idle"` である（`documents/design/frontend/character/tracking.md:90`）。
- `TrackerRuntimeDegradationPolicy` は comfortable-idle stage を持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeDegradationPolicy.ts:146`）。
- 設計文書は comfortable pose の blend を tracker ではなく Temporal / MotionSolver / VrmPoseComposer の責務にしている（`documents/design/frontend/character/tracking.md:104`）。

## テスト

- `cd sincromisor-frontend && npm run test -- trackerRuntimeDegradationPolicy`
- `cd sincromisor-frontend && npm run test -- trackerRuntime`
- `cd sincromisor-frontend && npm run test -- temporalStateEstimator`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。検証結果は本番適用 gate の一部になるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に degradation 中の observe-only / dry-run 期待挙動を同期する。
