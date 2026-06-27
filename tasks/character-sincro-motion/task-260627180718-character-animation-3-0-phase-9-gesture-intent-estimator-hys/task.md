# character animation 3.0 phase 9 gesture intent estimator hysteresis

## 背景 / 目的

Phase 9 は Gesture Recognizer を主制御器ではなく `MotionIntent` の補助入力として扱い、confidence、hand reliability、minimum duration、cooldown、hysteresis で gesture label のちらつきを抑えることを要求している（`documents/research/character_animation/roadmap.md:480`、`documents/research/character_animation/roadmap.md:481`）。特に手振りは `Open_Palm` だけで発火させず、肩から顔の高さ、左右速度の符号反転、継続時間を条件にする必要がある（`documents/research/character_animation/roadmap.md:482`）。motion design 調査では intent ごとの初期条件、minimum duration、cooldown が整理されている（`documents/research/character_animation/answers/04-character-motion-design.md:159`、`documents/research/character_animation/answers/04-character-motion-design.md:163`）。

このタスクでは、依存タスクの `MotionIntentState` contract に対して、Temporal / Hand / Reliability / optional gesture label から deterministic に intent を推定する `MotionIntentEstimator` を追加する。MediaPipe Gesture Recognizer の実行そのものは扱わず、既に得られた raw label 風の入力を補助情報として読む pure/stateful estimator に留める。

## 完了条件（受け入れ条件）

- [ ] 依存タスク `task-260627180715-character-animation-3-0-phase-9-motion-intent-contract` の `MotionIntentState`、`ArmMotionIntent`、parser が HEAD に存在しない場合は実装せず、依存未充足として止める。
- [ ] `sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts` を追加し、`MotionIntentEstimator`、`MotionIntentEstimatorConfig`、`MotionIntentEstimatorInput`、`GestureIntentObservation`、`createMotionIntentState(input)` を export する。
- [ ] estimator input は `TemporalUpperBodyState`、optional `ReliabilityMap`、optional `SincroHandMotionSnapshot`、optional gesture observation、caller 指定 `mediaTimeMs` に限定する。`performance.now()`、MediaPipe raw landmark、VRM pose、camera DOM、AnimationMixer は読まない。

```ts
export type GestureIntentObservation = {
    left?: { label: string; confidence: number };
    right?: { label: string; confidence: number };
};

export type MotionIntentEstimatorInput = {
    temporal: TemporalUpperBodyState;
    reliability?: ReliabilityMap;
    hand?: SincroHandMotionSnapshot;
    gesture?: GestureIntentObservation;
    mediaTimeMs: number;
};
```

- [ ] `MotionIntentEstimatorConfig` の最小 schema は次に固定する。すべて optional にし、未指定 field は default を使う。duration override は `0..2000ms`、threshold override は `0..1` に clamp し、非 finite 値は default に戻して warning `invalid_dt` ではなく設定正規化内に閉じる。

```ts
export type IntentTimingConfig = {
    minimumDurationMs: number;
    cooldownMs: number;
};

export type MotionIntentEstimatorConfig = {
    timing?: Partial<
        Record<
            Exclude<ArmMotionIntent, "tracking" | "lost" | "wave">,
            Partial<IntentTimingConfig>
        >
    >;
    thresholds?: Partial<{
        gestureConfidence: number; // default 0.70
        handConfidence: number; // default 0.60
        handReliability: number; // default 0.60
        fingerReliability: number; // default 0.45
        fallbackConfidence: number; // default 0.15
        nearFaceElevationRad: number; // default 0.20
        nearFaceForwardness: number; // default 0.45
        clapDistance2d: number; // default 0.16
        guardedHandDistance2d: number; // default 0.18
    }>;
    wave?: Partial<{
        minimumDurationMs: number; // default 400
        cooldownMs: number; // default 650
        windowMs: number; // default 1200
        minAlternations: number; // default 2
        minElevationRad: number; // default 0.05
        minBodyLocalVelocityX: number; // default 0.05
        minImageVelocityX: number; // default 0.12
    }>;
    predictedSemanticHoldMs?: number; // default 500, clamp 200..700
    sideSwapHoldMs?: number; // default 500, clamp 0..1000
};
```

- [ ] `MotionIntentEstimator` は `constructor(config?: MotionIntentEstimatorConfig)`、`update(input: MotionIntentEstimatorInput): MotionIntentState`、`reset(): void` を持つ。`createMotionIntentState(input, config?)` は `new MotionIntentEstimator(config).update(input)` と同じ結果を返す単発 helper とし、過去 frame がないため minimum duration が必要な semantic intent は初回では発火せず `tracking` / `lost` / `fallback` のみ返り得る。
- [ ] v1 の gesture label mapping は `"Open_Palm" -> explain candidate`、`"Pointing_Up" -> pointing candidate`、`"Thumb_Up" -> thumbsUp candidate`、`"Victory" -> peace candidate`、`"Closed_Fist" -> guarded candidate` のみに固定する。`"None"`、`"Thumb_Down"`、`"ILoveYou"`、unknown label は semantic intent にせず `tracking` へ落とす。
- [ ] confidence gate の既定値は gesture confidence `>= 0.70`、hand side confidence `>= 0.60`、ReliabilityMap の該当 `parts.leftHand/rightHand.finalWeight >= 0.60`、finger reliability `>= 0.45` に固定し、`config.thresholds` 指定時だけ override する。ReliabilityMap 欠損時は hand side confidence だけで判定し、警告 `low_hand_reliability` は付けない。
- [ ] minimum duration / cooldown は初期値として `wave 400ms / 650ms`、`pointing 200ms / 500ms`、`thumbsUp 200ms / 500ms`、`peace 200ms / 500ms`、`nearFace 250ms / 300ms`、`explain 300ms / 400ms`、`clapLike 150ms / 800ms`、`guarded 250ms / 500ms`、`fallback 300ms / 0ms` に固定する。
- [ ] `timing` config は `wave` を含まない。`wave` の `minimumDurationMs` / `cooldownMs` は `config.wave` だけで override し、`config.timing` と `config.wave` の二重指定は schema 上発生しない形にする。
- [ ] `wave` は `Open_Palm` label だけでは発火しない。速度ソースは `temporal.arms[side].velocity.wrist?.[0]` を最優先し、欠損時だけ estimator 内部が前回 `hand.<side>Hand.fullFrameWrist[0]` との差分を `dtMs` で割った image velocity へ fallback する。`opennessPerSec` は wave 判定に使わない。該当腕の temporal `elevationRad >= 0.05`、`1200ms` 窓で `abs(bodyLocalVelocityX) >= 0.05` または `abs(imageVelocityX) >= 0.12` の符号反転が 2 回以上、候補継続 `>= 400ms`、cooldown `650ms` 終了の条件をすべて満たした場合だけ `wave` にする。
- [ ] `nearFace` は Face bbox ではなく v1 では temporal arm `classification === "front"`、`elevationRad >= 0.20`、`forwardness >= 0.45`、hand confidence `>= 0.45` の近似条件に固定する。Face ROI geometry を再解釈する案は Phase 9 v1 では採用しない。
- [ ] `clapLike` は左右 hand が両方 detected で full-frame wrist があり、2D 距離 `<= 0.16`、左右 temporal velocity の x 成分が対向している場合だけ candidate にする。拍手音や audio VAD は入力にしない。
- [ ] `guarded` は `temporal.arms.left.classification === "crossed"` または `temporal.arms.right.classification === "crossed"`、または左右 `fullFrameWrist` の 2D 距離 `<= 0.18` かつ左右どちらかの arm `forwardness >= 0.35`、または Reliability / Hand warning に `side_inconsistent` がある場合に candidate にする。`side_inconsistent` 発生後は `sideSwapHoldMs` default `500ms` の間、左右の前回 semantic intent を入れ替えず同じ side に保持し、warning `left_right_swap_suspect` を付ける。
- [ ] hand / pose が lost の場合は、Temporal arm state が `predicted` / `recovering` なら前回 semantic intent を `predictedSemanticHoldMs` default `500ms` まで保持し、その間 warning `fallback_active` は付けない。該当 arm の `observedAgeMs > 700` または temporal state が `lost` かつ confidence `< 0.15` の場合は side intent を `lost` にする。fallback 判定に使う torso confidence は `reliability?.parts.torso.finalWeight` を最優先し、欠損時は左右 temporal arm confidence の平均値を使う。左右両腕が `lost` または confidence `< 0.15` で、torso confidence も `< 0.15` の場合だけ arms を `fallback` へ落とす。動きを完全停止する intent は作らない。
- [ ] estimator は `reset()` を持ち、camera stop、video fixture load、recording load、replay stop、source reset で状態を破棄できる。`dtMs <= 0`、`dtMs > 250`、非 finite dt では counters を更新せず warning `invalid_dt` を返す。
- [ ] `motionIntentEstimator.test.ts` で、Open_Palm 単独では wave にならない、左右速度反転 2 回で wave になる、short flicker は tracking のまま、cooldown 中は再発火しない、`Pointing_Up` / `Thumb_Up` / `Victory` / `Closed_Fist` の mapping、nearFace / clapLike / guarded の閾値、unknown gesture label は tracking、low hand reliability は semantic を抑制、lost -> predicted grace -> lost/fallback の遷移、`reset()`、`invalid_dt`、config clamp を検証する。
- [ ] `documents/design/frontend/character/motion.md` に input boundary、gesture mapping、minimum duration、cooldown、wave 発火条件、Gesture Recognizer を主制御器にしない方針を同期する。

## 設計判断（着手前に確定済み）

- estimator は stateful class と pure helper の両方を提供する。live / replay では class の hysteresis を使い、unit test や単発 debug では `createMotionIntentState()` を使えるようにする。
- Gesture Recognizer raw result の型はこのタスクで MediaPipe 型に依存させない。`GestureIntentObservation` の label/confidence へ正規化済みの値だけを読むことで、後続の Gesture Recognizer 実行 task と責務を分ける。
- `nearFace` は v1 では temporal / hand の近似条件で判定する。Face ROI bbox 依存をここで作ると Phase 8 の Face reliability / ROI metadata と責務が絡むため採用しない。
- `wave` は左右速度符号反転を必須にする。`Open_Palm` と高さだけで発火する案は誤発火が多く roadmap の禁止方針に反するため採用しない。
- cooldown は side ごとに持つ。片手の wave が反対手の pointing を抑制しないようにするため。

## スコープ境界

- 本タスクでやること:
    - MotionIntent estimator と hysteresis / cooldown。
    - optional gesture label の正規化入力。
    - intent 推定 unit test。
- 本タスクでやらないこと:
    - `@mediapipe/tasks-vision` GestureRecognizer の初期化 / Worker 接続。
    - `ReliabilityMap.gesture` の本格更新。
    - motion-debug recording への `frame.intent` 保存。
    - semantic pose / finger pose 生成。
    - UI 表示や本番 VRM 適用。
- 依存タスクとの境界:
    - 依存 task が MotionIntent の保存 schema を定義する。
    - 後続 debug/replay task が estimator を motion-debug recording に接続し、saved `frame.intent` を表示する。

## 実装方針（既存コード整合: file:line）

- `TemporalUpperBodyState` は canonical / reliability 後段の保存可能な state で、intent / IK が読む前提になっている（`documents/design/frontend/character/motion.md:194`、`documents/design/frontend/character/motion.md:196`）。
- Hand snapshot は `fullFrameWrist`、finger curl、openness、confidence、warnings を持つ（`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:37`、`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:45`、`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:46`）。Gesture Recognizer raw result はここに追加しない。
- ReliabilityMap は gesture reliability slot を持つが、Phase 8 までは neutral placeholder である（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:145`、`documents/design/frontend/character/motion.md:39`）。本タスクでは hand / finger reliability と optional gesture observation を読むだけにする。
- `MotionDebugRecordingController.recordPoseFrame()` は canonical / reliability / temporal を同じ `mediaTimeMs` で解決している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:137`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:159`）。接続は後続 task でこの流れに intent estimator を挿入する。

## テスト

- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`
- `cd sincromisor-frontend && npm run test -- motionIntentState`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な motion intent 推定規則を追加するため、`documents/design/frontend/character/motion.md` に input boundary、gesture mapping、minimum duration、cooldown、wave 発火条件、Gesture Recognizer を主制御器にしない方針を同期する。
