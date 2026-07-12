# character animation 3.0 phase 11 sequence classifiers

## 背景 / 目的

Phase 11 の候補には gesture sequence classifier と anomaly detector が含まれる（`documents/research/character_animation/roadmap.md:523`、`documents/research/character_animation/roadmap.md:524`）。report02 も、MediaPipe より重い検出器ではなく、MediaPipe / canonical 出力の軽量 post-processing を将来候補にしている（`documents/research/character_animation/report02.md:785`、`documents/research/character_animation/report02.md:792`）。

このタスクでは learned classifier ではなく、`TemporalUpperBodyState` / `MotionIntentState` / `ReliabilityMap` / Hand snapshot の低次元 sequence window と rule-based classifier baseline を追加する。出力は Phase 11 post-processing result の corrections と sequence event に限定し、VRM pose や IK solver へ直接反映しない。

依存:

- `task-260628161547-character-animation-3-0-phase-11-post-processing-contract`
- `task-260628161551-character-animation-3-0-phase-11-replay-failure-mining`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionPostProcessing/motionSequenceWindow.ts` を追加し、`MotionSequenceSample`、`MotionSequenceWindowConfig`、`MotionSequenceWindowSnapshot`、`MotionSequenceWindow` を export する。
- [ ] `MotionSequenceSample` は `{ mediaTimeMs; temporal?: TemporalUpperBodyState; intent?: MotionIntentState; reliability?: ReliabilityMap; hand?: SincroHandMotionSnapshot }` に固定する。MediaPipe raw landmark、Gesture Recognizer raw result、VideoFrame、ImageBitmap、Three.js object は受け取らない。
- [ ] `MotionSequenceWindowConfig` は `{ maxDurationMs: number; maxSamples: number }` に固定し、default は `maxDurationMs: 1200`、`maxSamples: 90` とする。`add(sample)` は `mediaTimeMs` が前回より小さい場合に window を reset し、warning `non_monotonic_time_reset` を snapshot に残す。
- [ ] `MotionSequenceWindowSnapshot` は `schemaVersion: "sincro.motion-sequence-window.v1"`、`startMediaTimeMs`、`endMediaTimeMs`、`sampleCount`、`inputAvailability`、`warnings`、`features` を持つ。`inputAvailability` は `{ temporal: boolean; intent: boolean; reliability: boolean; hand: boolean }` に固定し、window 内に該当 input が 1 件でもあれば true にする。features は side ごとの `MotionSequenceSideFeatures` とする。

```ts
export type MotionSequenceSideFeatures = {
    intentTransitions: number;
    semanticHoldMs: number;
    stableSemanticIntent?: ArmMotionIntent;
    gestureFlickerCount: number;
    trackingLossMs: number;
    sideSwapSuspectCount: number;
    wristVelocitySignChanges: number;
    handOpenCloseTransitions: number;
};
```

- [ ] feature aggregation は window 内の sample を `mediaTimeMs` 昇順で扱い、sample `i` の duration は `max(0, sample[i + 1].mediaTimeMs - sample[i].mediaTimeMs)`、最後の sample duration は `0` とする。欠損 input の sample は該当 feature では無視し、欠損を 0 duration として補間しない。
- [ ] `intentTransitions` は consecutive valid `sample.intent.arms[side].intent` の変化回数を数える。途中の missing intent sample は無視し、前回 valid intent を保持する。
- [ ] semantic intent は `"wave" | "pointing" | "thumbsUp" | "peace" | "nearFace" | "explain" | "clapLike" | "guarded"` に固定する。`semanticHoldMs` は同じ semantic intent が連続した run の duration 合計の最大値とし、`stableSemanticIntent` は最大 run の intent を入れる。同値 tie は先に出現した run を採用する。
- [ ] `gestureFlickerCount` は既存 metrics と同じ定義にする。previous valid intent が semantic intent かつ `previous.stableDurationMs < 150`、current が `"tracking"` または previous と異なる semantic intent の場合に 1 加算する。
- [ ] `trackingLossMs` は sample duration を、`temporal.arms[side].state === "lost"`、または `intent.arms[side].intent` が `"lost"` / `"fallback"`、または `reliability.parts.leftArm/rightArm.state === "lost"` のいずれかが true の sample だけ合計する。side と part の対応は left -> `leftArm`、right -> `rightArm` に固定する。
- [ ] `sideSwapSuspectCount` は sample ごとに最大 1 加算する。条件は `intent.arms[side].warnings` に `"left_right_swap_suspect"` がある、または `reliability.warnings` / 該当 arm part warnings / 該当 shoulder-elbow-wrist joint warnings のいずれかに `"side_inconsistent"` がある場合に固定する。
- [ ] `wristVelocitySignChanges` は `temporal.arms[side].velocity.wrist?.[0]` の body-local X 軸だけを見る。`abs(x) < 0.02`、missing wrist、non-finite は無視し、前回 non-zero sign と異なる sign が出た回数を数える。
- [ ] `handOpenCloseTransitions` は `hand.leftHand/rightHand.features.openness` の `"open"` / `"closed"` 間の変化回数を数える。`"half"`、`"unknown"`、missing hand は無視し、前回 valid open/closed を保持する。
- [ ] `sincromisor-frontend/src/character/motionPostProcessing/motionSequenceClassifier.ts` を追加し、`classifyMotionSequence(snapshot, input)` を export する。`input` は `{ mediaTimeMs: number; source: "live" | "replay" | "fixture"; processorId?: string }` に固定する。出力は `MotionSequenceClassifierResult` とし、schemaVersion `"sincro.motion-sequence-classifier.v1"`、`events`、`postProcessing` を持つ。
- [ ] event schema は `{ label; side; confidence; source; reasonCode; featureValue; startMediaTimeMs; endMediaTimeMs }` に固定する。event label は `"wave_sequence" | "gesture_flicker" | "side_swap_anomaly" | "tracking_loss_anomaly" | "stable_semantic_hold"`、`side` は `"left" | "right"`、`source` は `"rule_based"`、`confidence` は `0..1` に固定する。events order は label order `wave_sequence -> gesture_flicker -> side_swap_anomaly -> tracking_loss_anomaly -> stable_semantic_hold`、同一 label では `left -> right` に固定する。
- [ ] rule は一意に固定する。`wristVelocitySignChanges >= 2 && semanticHoldMs < 500 && trackingLossMs < 200` を `wave_sequence`、`gestureFlickerCount >= 2` を `gesture_flicker`、`sideSwapSuspectCount >= 1` を `side_swap_anomaly`、`trackingLossMs >= 300` を `tracking_loss_anomaly`、同じ semantic intent の `semanticHoldMs >= 600 && gestureFlickerCount === 0` を `stable_semantic_hold` とする。
- [ ] confidence は fixed formula にする。`wave_sequence`: `min(1, wristVelocitySignChanges / 3)`、`gesture_flicker`: `min(1, gestureFlickerCount / 3)`、`side_swap_anomaly`: `1`、`tracking_loss_anomaly`: `min(1, trackingLossMs / 600)`、`stable_semantic_hold`: `min(1, semanticHoldMs / 900)`。
- [ ] `event.reasonCode` は label と同じ文字列、`featureValue` は rule 判定に使った主 feature 値、`startMediaTimeMs` / `endMediaTimeMs` は snapshot の `startMediaTimeMs` / `endMediaTimeMs` をそのまま入れる。
- [ ] `postProcessing` は `MotionPostProcessingResult` を返す。`processor.id` は `input.processorId ?? "rule-sequence-classifier"`、`processor.version` は `"v1"`、`processor.mode` は `"rule_based"`、`timestamp.mediaTimeMs` は `input.mediaTimeMs`、`inputAvailability` は `{ canonical: false; temporal: snapshot.inputAvailability.temporal; intent: snapshot.inputAvailability.intent; reliability: snapshot.inputAvailability.reliability }` に固定する。`hand` は sequence feature 専用入力であり、Phase 11 post-processing result の availability には出さない。`output` は `{}`、`warnings` は events が空なら `["low_confidence"]`、events があるなら `[]` に固定する。
- [ ] corrections は events order に従って生成する。ただし `wave_sequence` と `stable_semantic_hold` は event のみで correction を作らない。`gesture_flicker` では target `intent`、path `arms.${side}.intent`、kind `gesture_sequence_classification`、reasonCode `gesture_flicker`。`side_swap_anomaly` では target `canonical`、path `arms.${side}`、kind `anomaly_rejection`、reasonCode `side_swap_suspect`。`tracking_loss_anomaly` では target `temporal`、path `arms.${side}.state`、kind `anomaly_rejection`、reasonCode `tracking_loss`。correction `confidence` は event confidence、`previousValue` / `nextValue` は省略する。
- [ ] `MotionIntentEstimator` の existing update path は変更しない。本タスクの classifier は別 helper として呼べるだけにし、live runtime / replay runtime の intent 推定結果を自動で上書きしない。
- [ ] `sincromisor-frontend/src/character/motionPostProcessing/__tests__/motionSequenceWindow.test.ts` を追加し、duration eviction、sample count eviction、non-monotonic reset、feature aggregation、input availability、raw object を受け取らない型境界を検証する。raw object 境界は TypeScript の `@ts-expect-error` compile-time test でよく、runtime parser は追加しない。
- [ ] `sincromisor-frontend/src/character/motionPostProcessing/__tests__/motionSequenceClassifier.test.ts` を追加し、wave sequence、gesture flicker、side swap anomaly、tracking loss anomaly、stable hold、output empty correction-only を検証する。
- [ ] `documents/design/frontend/character/motion.md` に Phase 11 sequence window / rule-based classifier baseline、learned classifier ではないこと、correction-only で state を書き換えないことを同期する。

## 設計判断（着手前に確定済み）

- sequence classifier は `src/character/motionPostProcessing/` に置く。MotionIntentEstimator 本体へ混ぜると Phase 9 の rule-based intent 推定と Phase 11 の候補 classifier の責務が曖昧になるため。
- v1 は learned classifier ではなく rule-based baseline に固定する。学習データ、モデル形式、runtime loader を導入する前に、同じ feature window と event contract を replay / metrics で検証する。
- classifier は state を書き換えず `MotionPostProcessingResult.corrections` だけを返す。補正適用を同時に行うと、sequence event の検証と motion 変化の検証が混ざるため。
- `MotionSequenceSample` は低次元 contract だけを受け取る。MediaPipe raw landmark や Gesture Recognizer raw result は既存方針どおり motion pipeline の保存 contract に漏らさない。
- feature aggregation は window snapshot に閉じ、classifier は snapshot features だけを見る。classifier が raw samples を再走査する案は、aggregation と classification の期待値が二重化するため採用しない。
- `hand` availability は `MotionSequenceWindowSnapshot` だけに保持し、`MotionPostProcessingResult.inputAvailability` へは写さない。依存 contract が canonical / temporal / intent / reliability に固定されており、hand は補正対象ではなく classifier feature の材料であるため。
- non-monotonic time は error throw ではなく reset と warning にする。replay source 切替や seek で window が古い時刻を跨がないことを優先する。
- 外部境界はない。network、ML runtime、DB、WebRTC / backend 契約は変更しない。

## スコープ境界

- 本タスクでやること:
    - sequence window と feature aggregation。
    - gesture / anomaly rule-based classifier baseline。
    - post-processing correction-only result。
    - unit test と design doc 同期。
- 本タスクでやらないこと:
    - learned classifier / model training。
    - live runtime での automatic intent override。
    - motion-debug UI panel。
    - new MotionIntent enum の追加。
    - VRM pose / IK solver への直接反映。
- 依存タスクとの境界:
    - replay failure mining task は candidate target を分類する。本タスクは sequence classifier / anomaly detector target の実装足場を作るが、candidate report を必須入力にはしない。
    - post-processing contract task は `MotionPostProcessingResult` を定義する。本タスクはその correction schema を使い、schema version を変更しない。

## 実装方針（既存コード整合: file:line）

- `MotionIntentEstimatorInput` は temporal / reliability / hand / gesture / mediaTimeMs を受ける（`sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts:20`、`sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts:25`）。本タスクの sequence sample も同じ低次元入力境界に合わせるが、estimator 本体は変更しない。
- `MotionIntentEstimator` は existing rule-based update API を持つ（`sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts:785`、`sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts:801`）。sequence classifier はこの後段の別 helper として置く。
- `MotionIntentState` の arm side state は intent、confidence、reliability、age、stable duration、cooldown、source、warnings を持つ（`sincromisor-frontend/src/character/motionIntent/motionIntentState.ts:54`、`sincromisor-frontend/src/character/motionIntent/motionIntentState.ts:64`）。sequence features はこの保存値を読む。
- `TemporalUpperBodyState` は arm velocity と optional body-local wrist を持つ（`sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:68`、`sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:77`）。wave / tracking loss features はこの contract だけから作る。
- motion metrics には gesture flicker、semantic fallback、intent cooldown、intent invalid が既にある（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1727`、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1745`）。本タスクでは metric key を増やさず、sequence classifier の unit test で同じ failure family を扱う。
- design doc は MotionIntent が raw gesture label を保存 contract に漏らさない方針を定めている（`documents/design/frontend/character/motion.md:53`、`documents/design/frontend/character/motion.md:55`）。sequence classifier も raw label ではなく saved intent / hand feature を入力にする。

## テスト

- `cd sincromisor-frontend && npm run test -- motionSequenceWindow`
- `cd sincromisor-frontend && npm run test -- motionSequenceClassifier`
- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な Phase 11 sequence window / classifier contract と post-processing correction source が増えるため、`documents/design/frontend/character/motion.md` に責務、rule baseline、state を書き換えない方針を同期する。
