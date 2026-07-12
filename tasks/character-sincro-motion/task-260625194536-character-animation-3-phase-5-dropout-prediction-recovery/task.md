# character animation 3.0 phase 5 dropout prediction recovery

## 背景 / 目的

Phase 5 の価値は、手や頭が短時間消えたときに motion が急に neutral へ落ちず、再検出時にも snap しないことにある。前段タスクで observed frame の temporal state / filter は入るため、このタスクでは dropout 中の短期 prediction、comfortable pose への滑らかな退避、再検出時の recovering blend を追加する。

依存:

- `task-260625194536-character-animation-3-phase-5-temporal-state-estimator-filte`

## 完了条件（受け入れ条件）

- [ ] `TemporalStateEstimatorConfig` に `predictionMaxMs: 700`、`predictionVelocityDampingPerSec: 0.55`、`comfortableFallbackAfterMs: 700`、`recoveringBlendMs: 260`、`maxRecoveringAngleJumpRad: 15 * Math.PI / 180` 相当の scalar clamp 設定を追加する。`recoveringBlendMs` は `180..400` に clamp する。
- [ ] `TemporalStateEstimator.update()` は arm が `lost` になってから `observedAgeMs <= predictionMaxMs` の間、前回 filter 後 state と velocity から `state: "predicted"`、`source: "predicted"` の arm を返す。prediction 中は velocity を `predictionVelocityDampingPerSec` で減衰し、warnings に `prediction_active` と `velocity_damped` を含める。
- [ ] `observedAgeMs > comfortableFallbackAfterMs` の arm は `state: "lost"`、`source: "comfortable"` にし、neutral へ即時 snap せず、前回 predicted / filtered 値から comfortable pose へ 260ms で近づける。comfortable pose の scalar は `reach: 0.35`、`elevationRad: -0.25`、`openness: 0.15`（左右符号は arm side に合わせる）、`forwardness: 0.15`、`elbowFlexionRad: 1.15`、`classification: "side"` に固定する。
- [ ] lost / predicted 後に confidence が `>= 0.65` へ戻った arm は `state: "recovering"`、`source: "mixed"` とし、観測値へ snap せず `recoveringBlendMs` で filtered observation へ復帰する。`TemporalArmState.recoveringBlend` は `from`、`progress`、`durationMs` を保存し、warnings に `recovery_blend` を含める。
- [ ] recovering 中の 1 frame あたり scalar jump は `maxRecoveringAngleJumpRad` 相当を上限にする。`elevationRad` / `elbowFlexionRad` は rad clamp、`reach` / `openness` / `forwardness` は同じ比率を各値域へ換算した clamp を使う。
- [ ] prediction / recovering は左右腕ごとに独立して動作する。左腕 dropout 中に右腕が tracked の場合、右腕の state / filter / classification hold は影響を受けない。
- [ ] head は v1 では optional 対応に留め、canonical head が存在する場合だけ yaw / pitch / roll に同じ `tracked` / `predicted` / `lost` / `recovering` policy を適用する。Face matrix 由来 head reliability の追加は Phase 8 以降へ残す。
- [ ] unit test で、200ms dropout は predicted を返す、700ms 以内は neutral へ落ちない、700ms 超過後は comfortable へ滑らかに近づく、再検出時は recovering になり jump clamp が効く、`reset()` 後は prediction / recovering が残らないことを検証する。
- [ ] `documents/design/frontend/character/motion.md` に prediction window、comfortable pose scalar、recovering blend duration、head v1 の optional 範囲を同期する。

## 設計判断（着手前に確定済み）

- 実装先は既存 `src/character/temporal/temporalStateEstimator.ts` の拡張に固定する。prediction 専用 class を別に作る案は、state transition と filter state の所有者が分かれて reset / replay lifecycle が複雑になるため採用しない。
- prediction は body-local canonical scalar / tuple に閉じる。VRM quaternion や IK pole prediction は Phase 6 の `MotionSolver / IK / VrmPoseComposer` で扱う。
- constant-velocity prediction の上限は 700ms に固定する。roadmap の「手が 200-700ms 程度消えても腕が急に neutral へ落ちない」を受け、700ms を超えたら自然な comfortable pose へ退避する。
- recovering blend の既定値は 260ms に固定する。roadmap の 180-400ms の中央寄りで、遅すぎず snap もしにくい値として採用する。UI 設定は本タスクでは追加せず config override のみにする。
- comfortable pose は authored clip ではなく scalar 値で定義する。AnimationMixer / semantic clip は Phase 9 の責務であり、本タスクでは canonical control の退避姿勢に閉じる。
- 外部 API / backend / WebRTC 契約は変更しない。

## スコープ境界

- 本タスクでやること:
    - arm / optional head の dropout prediction。
    - velocity damping。
    - comfortable pose 退避。
    - recovering blend と jump clamp。
- 本タスクでやらないこと:
    - IK elbow pole の measured / previous / fallback blend。
    - final quaternion slerp / log-space smoothing。
    - motion-debug recording / replay / metrics 接続。
    - user-facing calibration / camera guide UI。

## 実装方針（既存コード整合: file:line）

- canonical arm state は `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、body-local wrist / elbow を持つ（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:83`）。prediction はこの値だけを使い、MediaPipe raw result へ戻らない。
- temporal contract は `TemporalArmState.velocity` と `recoveringBlend` を保存できる前提で起票済みである（`tasks/character-sincro-motion/task-260625194536-character-animation-3-phase-5-temporal-state-contract/task.md`）。本タスクはその field を実際に埋める。
- Phase 4 downstream は `lost` arm を canonical source `neutral` / confidence 0 にするが、`suspect` は低 confidence 観測として残す（`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:125`、`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:137`、`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:236`）。本タスクは lost 直後に即 neutral へ落とさず、previous temporal state から predicted / comfortable へ遷移する。
- motion-debug live / replay の pose handling はまだ `behaviorState.applyPoseMotion(snapshot)` を直接呼んでいる（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:568`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:597`）。本タスクでは runtime 接続を変更せず、estimator の unit test に閉じる。

## テスト

- `cd sincromisor-frontend && npm run test -- temporalStateEstimator`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な temporal behavior が増えるため、`documents/design/frontend/character/motion.md` に prediction window、comfortable pose、recovering blend、head v1 の optional 範囲、Phase 6 へ残す IK / quaternion smoothing 境界を同期する。公開 WebRTC / backend 契約は変更しない。
