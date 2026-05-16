# Sincro Motion タスク群

Sincromisor 本来の目的である「ものまね / 同期」キャラクターモーション基盤を扱うタスク群です。

この大分類では、`chat` の対話相手注視と `sincro` の顔・姿勢同期を明確に分け、将来の手・腕・上半身同期へ拡張できる設計を優先します。最小変更にこだわらず、認識入力、状態集約、VRM retarget、モード別 orchestration、性能計測を基底から整えます。

## タスク一覧

- Open: `open/TASK-3100-sincro-motion-foundation-epic.md`
- Done: `done/TASK-3101-sincro-motion-architecture-and-design-doc.md`
- Open: `open/TASK-3102-face-tracking-runtime-and-sincro-face-tracker.md`
- Done: `done/TASK-3103-sincro-face-retargeting-head-eye-mouth.md`
- Done: `done/TASK-3104-talk-mode-aware-character-motion-orchestration.md`
- Open: `open/TASK-3105-pose-landmarker-feasibility-spike.md`
- Done: `done/TASK-3106-optional-sincro-pose-tracker-and-performance-gates.md`
- Done: `done/TASK-3107-sincro-motion-observability-settings-and-verification.md`
- Done: `done/TASK-3108-sincro-head-pitch-direction-fix.md`
- Done: `done/TASK-3109-sincro-separate-blink-expression-calibration.md`
- Done: `done/TASK-3110-sincro-blink-open-threshold-tuning.md`
- Done: `done/TASK-3111-sincro-pose-retarget-formalization-and-tuning.md`
- Done: `done/TASK-3112-sincro-tracker-workerization-and-load-isolation.md`
- Done: `done/TASK-3113-sincro-pose-camera-space-arm-targets.md`
- Done: `done/TASK-3114-sincro-lightweight-two-bone-arm-ik.md`
- Done: `done/TASK-3115-sincro-pose-upper-body-anchor-and-ik-fallback.md`
- Open: `open/TASK-3116-sincro-pose-ik-observability-verification-and-design-sync.md`

## 前提

- `TASK-3048` のキャラクター対話存在感強化は完了済みとして扱う。
- 3100 系は `TASK-3048` で追加された `CharacterBehaviorState`、`CharacterMotionOrchestrator`、eye / idle / AI speech motion を前提に、`sincro` の同期モーション基盤を後続拡張する。
- WebRTC の `talk_mode` 契約は既存のまま使い、endpoint / JSON を変更する場合は別途明示して判断する。

## 推奨実行順とフェーズゲート

1. `TASK-3101`: 設計文書を更新し、用語、責務境界、mode 切替仕様、性能ゲートを正本化する。
2. `TASK-3102`: 共有 camera / tracker runtime と `SincroFaceTracker` を実装する。
3. `TASK-3103`: FaceLandmarker snapshot から head / eye / mouth への retarget を実装する。
4. `TASK-3104`: `chat` / `sincro` の motion priority と active session 中の `talkMode` 切替を整理する。
5. `TASK-3107`: face-only の観測性、設定、確認、設計同期を行う。

Pose Landmarker は face-only の本流と分けて進める。

1. `TASK-3105`: Pose Landmarker の性能・精度を検証する。
2. 採用判断:
   - 採用または条件付き採用なら `TASK-3106` へ進む。
   - 延期なら `TASK-3106` は保留し、`TASK-3107` は face-only 完了として閉じる。
3. `TASK-3106`: optional `SincroPoseTracker` と性能ゲートを実装する。
4. Pose を採用した場合は、`TASK-3107` の pose 観測性・確認項目も完了条件に含める。
5. `TASK-3111`: optional pose pipeline をキャラクター動作として正式化し、設定・適用 gate・反映強度・実カメラ確認を整える。
6. `TASK-3112`: Face / Pose tracker を Worker 化し、model load と同期推論による main thread ブロックを軽減する。
7. `TASK-3113`: 簡易 IK の入力として、肩・肘・手首 target を snapshot に正規化する。
8. `TASK-3114`: 新規外部ライブラリへ置き換えず、軽量 two-bone arm IK で腕先を target へ寄せる。
9. `TASK-3115`: 上半身 anchor、motion priority、部位別 fallback を調整して IK の破綻を抑える。
10. `TASK-3116`: IK の観測性、実カメラ検証、設計文書同期を行う。
