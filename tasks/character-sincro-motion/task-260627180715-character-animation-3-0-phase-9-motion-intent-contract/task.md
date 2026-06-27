# character animation 3.0 phase 9 motion intent contract

## 背景 / 目的

Phase 9 は、完全追従ではなく「ユーザーの動作意図が伝わるキャラクター motion」として `sincro` motion を扱う段階である。roadmap は `MotionIntent` として `tracking`、`wave`、`pointing`、`thumbsUp`、`peace`、`nearFace`、`explain`、`clapLike`、`guarded`、`lost`、`fallback` を導入し、Gesture Recognizer は主制御器ではなく補助入力にする方針を定めている（`documents/research/character_animation/roadmap.md:473`、`documents/research/character_animation/roadmap.md:479`、`documents/research/character_animation/roadmap.md:480`）。motion design 調査も `MotionIntent` を Reliability / Canonical / Temporal の後段、tracking pose / semantic additive clip の前段に置く構成を推奨している（`documents/research/character_animation/answers/04-character-motion-design.md:12`、`documents/research/character_animation/answers/04-character-motion-design.md:117`）。

このタスクでは Phase 9 の最初の足場として、保存可能な `MotionIntentState` contract、parser、default / clone helper、motion-debug log の strict parse 境界を追加する。Gesture の推定ロジック、semantic pose、finger bone 適用は後続タスクに残し、まず後段が同じ intent 名、単位、失敗時挙動を読める状態にする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionIntent/motionIntentState.ts` を追加し、`MOTION_INTENT_SCHEMA_VERSION = "sincro.motion-intent.v1"`、`ArmMotionIntent`、`TorsoMotionIntent`、`MotionIntentState`、`MotionIntentParseResult`、`parseMotionIntentState(value)`、`createDefaultMotionIntentState(mediaTimeMs)`、`cloneMotionIntentState(state)` を export する。
- [ ] `ArmMotionIntent` は `"tracking" | "wave" | "pointing" | "thumbsUp" | "peace" | "nearFace" | "explain" | "clapLike" | "guarded" | "lost" | "fallback"` に固定する。保存値は lower camel case とし、roadmap 上の表記から外れた `"thumbs_up"`、`"openPalm"`、Gesture Recognizer 生 label は reject する。
- [ ] `TorsoMotionIntent` は `"neutral" | "leaning" | "turning" | "settling"` に固定する。v1 では arms と同じ semantic gesture 名を torso に入れない。
- [ ] `MotionIntentState` の最小 schema は次に固定する。`sourceGestureLabel` は Gesture Recognizer の raw label を説明用に保存するだけで、`intent` の代替値にはしない。

```ts
export type MotionIntentSideState = {
    intent: ArmMotionIntent;
    confidence: number;
    reliability: number;
    expressiveness: number;
    ageMs: number;
    stableDurationMs: number;
    cooldownRemainingMs: number;
    source:
        | "temporal"
        | "hand"
        | "gesture"
        | "reliability"
        | "fallback"
        | "mixed";
    sourceGestureLabel?: string;
    warnings: MotionIntentWarningCode[];
};

export type MotionIntentState = {
    schemaVersion: typeof MOTION_INTENT_SCHEMA_VERSION;
    timestamp: { mediaTimeMs: number };
    arms: { left: MotionIntentSideState; right: MotionIntentSideState };
    torso: {
        intent: TorsoMotionIntent;
        confidence: number;
        source: "temporal" | "fallback" | "mixed";
        warnings: MotionIntentWarningCode[];
    };
    warnings: MotionIntentWarningCode[];
};
```

- [ ] `MotionIntentWarningCode` は `"low_hand_reliability" | "low_pose_reliability" | "gesture_unstable" | "gesture_cooldown" | "wave_motion_missing" | "near_face_hold" | "left_right_swap_suspect" | "fallback_active" | "invalid_dt"` に固定し、parser は unknown enum を `invalid_state` として返す。
- [ ] parser は `unknown_schema_version`、`invalid_state`、`out_of_range` の error code を返す。`confidence`、`reliability`、`expressiveness` は `0..1`、`ageMs`、`stableDurationMs`、`cooldownRemainingMs`、`mediaTimeMs` は finite かつ `>= 0` に固定し、`NaN`、`Infinity`、class instance、`THREE.Vector3` / `THREE.Quaternion` 風 extra key、function、unknown extra key を reject する。
- [ ] default state は左右腕を `intent: "tracking"`、`confidence: 0`、`reliability: 0`、`expressiveness: 0`、`source: "fallback"` にし、top-level warning に `fallback_active` を含める。`mediaTimeMs` は caller 指定値を保存し、`performance.now()` は呼ばない。
- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts` の `frame.intent` は optional slot のまま維持し、log 全体 parse では `z.unknown().optional()` として後方互換を保つ。strict validation は新規 `parseMotionIntentState()` と replay viewer 側で行い、旧 log に `intent` が無い場合は log load を失敗させない。
- [ ] `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts` の intent layer は `RESERVED_PHASE_1_LAYERS` から外し、saved `frame.intent` を `parseMotionIntentState()` で `available` / `invalid` / `not_recorded` に分けて表示する。live snapshot fallback はこのタスクでは追加しない。
- [ ] `sincromisor-frontend/src/character/motionIntent/__tests__/motionIntentState.test.ts` と `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` を追加 / 更新し、valid state、unknown schema、unknown intent、値域外 scalar、runtime object 風 value、旧 log 欠損の `not_recorded`、schema invalid の `invalid` を検証する。

## 設計判断（着手前に確定済み）

- `MotionIntent` は `src/character/motionIntent/` に置く。`features/gaze/handTracking` は観測 snapshot、`character/reliability` は品質 snapshot、`character/temporal` は時系列状態の責務であり、intent はそれらの後段 contract であるため。
- schema version は `sincro.motion-intent.v1` に固定する。`MotionIntent` 単独の version を持たせ、motion-debug log schema version には載せ替えない。
- `frame.intent` の log schema は現状どおり unknown optional を維持する。旧 log 互換を壊さず、layer viewer と個別 parser で strict validation する既存 Phase 6 / Phase 7 の形に合わせる。
- Gesture Recognizer の raw label は `sourceGestureLabel` に閉じ、`ArmMotionIntent` には入れない。Google 側 label の変化や `Open_Palm` 誤発火を motion pipeline の保存 contract に漏らさないため。
- `source` は intent の入力由来を説明する enum であり、複数入力を使う場合は `"mixed"` にする。配列 source 案は初期 v1 では解析と diff が煩雑になるため採用しない。

## スコープ境界

- 本タスクでやること:
    - MotionIntent v1 の型、default、clone、parser。
    - motion-debug replay viewer の intent layer parse。
    - contract と viewer の unit test。
- 本タスクでやらないこと:
    - Gesture Recognizer の初期化、実行、raw result serializer。
    - Temporal / Hand / Reliability から intent を推定する estimator。
    - semantic clip、AnimationMixer、VRM pose 合成。
    - finger bone rotation の生成。
    - 本番 `VRMCharacterManager.update()` の pose 適用順序変更。
- 依存タスクとの境界:
    - Phase 8 完了タスク `task-260627141813-character-animation-3-phase-8-roi-cadence-fallback-docs` までの Hand / Face ROI、ReliabilityMap、Temporal state、motion-debug layer を前提にする。
    - 後続 gesture estimator task は本タスクの `MotionIntentState` だけを出力し、schema や enum を拡張しない。

## 実装方針（既存コード整合: file:line）

- `motionDebugLogSchema.ts` は `frame.intent` を optional unknown slot として持っている（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:102`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:113`）。この形は維持し、log parse 自体の破壊的変更を避ける。
- `motionDebugViewerModel.ts` は layer key に `"intent"` を含み、現在は reserved layer として扱う（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:50`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:85`）。本タスクで reserved から実装済み layer へ移す。
- `createLayerSnapshots()` は現状 `context.replayFrame?.intent` をそのまま unknown 表示している（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:131`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:145`）。ここを parsed layer snapshot にする。
- `ReliabilityMap` は gesture reliability の placeholder schema を既に持つ（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:145`、`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:175`）。本タスクではこの型を変更せず、MotionIntent の入力候補として後続 task に残す。
- Hand snapshot は `openness` と finger curl を低次元 plain object として持つ（`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:18`、`sincromisor-frontend/src/features/gaze/handTracking/sincroHandMotionSnapshot.ts:34`）。本タスクでは読むだけの前提を文書化し、推定は実装しない。

## テスト

- `cd sincromisor-frontend && npm run test -- motionIntentState`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な motion-debug `frame.intent` と `character/motionIntent` contract を追加するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に MotionIntent v1 の schema version、enum、保存対象、Gesture Recognizer raw label を直接 intent にしない方針を同期する。
