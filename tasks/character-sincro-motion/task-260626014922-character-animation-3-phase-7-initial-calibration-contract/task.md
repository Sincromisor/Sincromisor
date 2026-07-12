# character animation 3.0 phase 7 initial calibration contract

## 背景 / 目的

Phase 7 は T pose ではなく 4-5 秒の 3-step calibration を標準にし、手指だけ不安定な場合でも腕・頭・体幹の同期を開始できる `ready_without_hands` を許容する。

このタスクでは、初期 calibration の保存 contract、step 評価、status / retry reason、ユーザー向け案内文への変換を pure module として固定する。実カメラ UI の画面遷移や online calibration は後続タスクに分ける。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/calibration/initialSincroCalibration.ts` を追加し、`SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION = "sincro.initial-calibration.v1"`、`InitialSincroCalibrationSession`、`InitialCalibrationStatus`、`InitialCalibrationStepId`、`InitialCalibrationRetryReason`、`evaluateInitialCalibrationStep()`、`summarizeInitialCalibrationSession()`、`createCanonicalCalibrationFromInitialSession()` を export する。
- [ ] step id は `"precheck" | "neutral" | "a_pose" | "hand_open" | "face_yaw_optional"` に固定する。標準完了判定は `precheck`、`neutral`、`a_pose`、`hand_open` の 4 step を評価し、`face_yaw_optional` は失敗しても status を下げない。
- [ ] status は `"not_started" | "ready" | "ready_without_hands" | "retry_recommended" | "failed"` に固定する。
- [ ] summary status の優先順位は `failed` > `ready` > `ready_without_hands` > `retry_recommended` > `not_started` に固定する。ただし `hand_open` は `failed` 判定の required step から除外し、`hand_open=retry|failed|skipped` かつ `precheck/neutral/a_pose` が ready の場合は `ready_without_hands` を返す。
- [ ] `ready` は neutral / a_pose / hand_open が required threshold を満たす場合だけ返す。`ready_without_hands` は neutral / a_pose が required threshold を満たし、hand_open だけ degraded / retry / failed / skipped の場合に返す。
- [ ] `retry_recommended` は precheck / neutral / a_pose の一部が degraded threshold 以上だが required threshold 未満の場合に返す。`failed` は precheck hard failure、または neutral / a_pose が degraded threshold 未満の場合に返す。
- [ ] step 評価は `ReliabilityMap`、optional `CameraQualityScore`、optional `CanonicalUpperBodyState`、`validDurationMs` を入力にし、MediaPipe raw landmark を直接読まない。
- [ ] retry reason は `"shoulders_out_of_frame" | "face_not_front" | "elbow_or_wrist_hidden" | "hand_not_visible" | "too_dark" | "motion_blur" | "low_reliability" | "camera_unavailable"` に固定し、通常 UI 用文言は最大 2 件へ deterministic に絞る。
- [ ] `createCanonicalCalibrationFromInitialSession()` は `CanonicalCalibrationSnapshot` を返し、`id` は `initial-calibration:${startedAtMediaTimeMs}:${completedAtMediaTimeMs}`、`source: "initial"`、`capturedAtMediaTimeMs` は completion 時刻に固定する。
- [ ] `createCanonicalCalibrationFromInitialSession()` は session の `measurements` から必須値を作る。`neutralYawRad` は `measurements.neutralYawRad ?? DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.neutralYawRad`、`shoulderWidth` は `measurements.shoulderWidth ?? DEFAULT...shoulderWidth`、`torsoScale` は `measurements.torsoScale ?? DEFAULT...torsoScale`、`handBaseline` は左右それぞれ `measurements.handBaseline[side] ?? DEFAULT...handBaseline[side]` とする。
- [ ] `evaluateInitialCalibrationStep()` は step 別の field mapping table に従い、未観測 field は該当 threshold を満たさない値として扱う。自由形式 `debug` の値で判定を変えない。
- [ ] `mapInitialCalibrationGuideMessages(reasons)` を export し、priority order と固定文言に従って最大 2 件を返す。
- [ ] `sincromisor-frontend/src/character/calibration/__tests__/initialSincroCalibration.test.ts` を追加し、ready、ready_without_hands、retry_recommended、failed、optional face yaw 失敗、retry reason priority、canonical calibration 変換を検証する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に initial calibration の status、step、入力が reliability/camera/canonical に閉じること、通常 UI と debug UI の情報境界を同期する。

## 設計判断（着手前に確定済み）

- 新規 module は `src/character/calibration/` に置く。`features/gaze/trackingRuntime` は camera / Worker、`character/canonical` は body-local state の責務であり、calibration session の状態管理は character motion pipeline の中間層として独立させる。
- T pose は標準 step にしない。単眼 camera で手が画面外に出やすく、roadmap Phase 7 と調査回答が 3-step を推奨しているため。
- `InitialSincroCalibrationSession` の最小 schema は次に固定する。

```ts
export type InitialCalibrationStatus =
    | "not_started"
    | "ready"
    | "ready_without_hands"
    | "retry_recommended"
    | "failed";

export type InitialCalibrationStepId =
    | "precheck"
    | "neutral"
    | "a_pose"
    | "hand_open"
    | "face_yaw_optional";

export type InitialCalibrationStepResult = {
    id: InitialCalibrationStepId;
    status: "ready" | "degraded" | "retry" | "failed" | "skipped";
    validDurationMs: number;
    score: number;
    retryReasons: InitialCalibrationRetryReason[];
    measurements: {
        neutralYawRad?: number;
        shoulderWidth?: number;
        torsoScale?: number;
        handBaseline?: CanonicalCalibrationSnapshot["handBaseline"];
    };
    debug: Record<string, number | boolean | string>;
};

export type InitialSincroCalibrationSession = {
    schemaVersion: "sincro.initial-calibration.v1";
    status: InitialCalibrationStatus;
    startedAtMediaTimeMs: number;
    completedAtMediaTimeMs?: number;
    steps: Partial<
        Record<InitialCalibrationStepId, InitialCalibrationStepResult>
    >;
    userGuideMessages: string[];
    debugReasons: InitialCalibrationRetryReason[];
};
```

- threshold は初期値として固定し、後続で metrics に基づき調整する。required ready は `validDurationMs >= 1000`、degraded は `>= 700`、torso reliability ready `>= 0.75` / degraded `>= 0.60`、head reliability ready `>= 0.70` / degraded `>= 0.55`、elbow/wrist ready `>= 0.65` / degraded `>= 0.50`、border risk ready `< 0.30` / degraded `< 0.45` とする。
- step 別 field mapping は次に固定する。

| step                | 入力 field                                                                   | ready           | degraded        | retry reason             |
| ------------------- | ---------------------------------------------------------------------------- | --------------- | --------------- | ------------------------ |
| `precheck`          | `cameraQuality.overall.status !== "bad"` または camera quality 未指定        | true            | true            | `camera_unavailable`     |
| `precheck`          | `cameraQuality.components.torsoInFrame.score`                                | `>= 0.75`       | `>= 0.60`       | `shoulders_out_of_frame` |
| `neutral`           | `reliability.parts.torso.finalWeight`                                        | `>= 0.75`       | `>= 0.60`       | `low_reliability`        |
| `neutral`           | `reliability.parts.head.finalWeight`                                         | `>= 0.70`       | `>= 0.55`       | `low_reliability`        |
| `neutral`           | `Math.abs(canonical.torso.yawRad)`                                           | `<= 10deg`      | `<= 15deg`      | `face_not_front`         |
| `a_pose`            | min of left/right elbow and wrist joint `finalWeight`                        | `>= 0.65`       | `>= 0.50`       | `elbow_or_wrist_hidden`  |
| `a_pose`            | `cameraQuality.components.borderRisk.score` converted to risk `1 - score`    | `< 0.30`        | `< 0.45`        | `shoulders_out_of_frame` |
| `hand_open`         | max of `reliability.parts.leftHand.finalWeight` / `rightHand.finalWeight`    | `>= 0.65`       | `>= 0.50`       | `hand_not_visible`       |
| `hand_open`         | `cameraQuality.components.handSmallRisk.score` converted to risk `1 - score` | `< 0.45`        | `< 0.65`        | `hand_not_visible`       |
| `face_yaw_optional` | `reliability.parts.head.finalWeight` and `canonical.torso.yawRad`            | same as neutral | same as neutral | `face_not_front`         |

- `CameraQualityScore` に該当 component が存在しない場合は、その camera-quality 判定だけを skipped 扱いにし、step 全体の status は reliability / canonical 判定で決める。`ReliabilityMap` / `CanonicalUpperBodyState` の該当 field がない場合は failed input として扱う。
- step status は、全 required checks が ready なら `ready`、全 required checks が degraded 以上かつ 1 つ以上 ready 未満なら `degraded`、required checks のいずれかが degraded 未満なら `retry`、precheck の `camera_unavailable` だけは `failed` とする。
- session summary では `hand_open` を optional hand step として扱う。`hand_open` の `retry` / `failed` は `ready_without_hands` の根拠にはなるが、session 全体の `failed` にはしない。
- `measurements` の生成元は次に固定する。`neutral` step は `canonical.torso.yawRad` を `neutralYawRad`、`canonical.torso.shoulderWidth` を `shoulderWidth`、`canonical.torso.torsoScale` を `torsoScale` として保存する。`hand_open` step は `canonical.calibration.handBaseline` を `handBaseline` として保存する。複数 step に同じ measurement がある場合は `neutral`、`a_pose`、`hand_open` の順に後者で上書きしない。
- retry reason priority と文言は次に固定する。重複 reason は最初の 1 件だけ残し、priority 上位 2 件を返す。

| priority | reason                   | message                                          |
| -------: | ------------------------ | ------------------------------------------------ |
|        1 | `camera_unavailable`     | `カメラを確認してください。`                     |
|        2 | `shoulders_out_of_frame` | `肩まで画面に入るように、少し下がってください。` |
|        3 | `face_not_front`         | `正面を向いてください。`                         |
|        4 | `elbow_or_wrist_hidden`  | `肘と手が見えるようにしてください。`             |
|        5 | `hand_not_visible`       | `手をカメラに見える位置へ移動してください。`     |
|        6 | `too_dark`               | `部屋を明るくしてください。`                     |
|        7 | `motion_blur`            | `ゆっくり動くか、部屋を明るくしてください。`     |
|        8 | `low_reliability`        | `姿勢をもう一度合わせてください。`               |

- user-facing message は内部語を出さず、上記固定文言から選ぶ。主警告 1 件 + 補助 1 件の最大 2 件にする。
- 外部 API / backend / WebRTC は変更しない。camera permission などの hard failure は本 module では reason code に変換するだけで、ブラウザ API 呼び出しはしない。

## スコープ境界

- 本タスクでやること:
    - 初期 calibration session / step / status / retry reason contract。
    - reliability / camera quality / canonical からの step 評価。
    - canonical calibration snapshot への変換。
    - unit test と設計文書同期。
- 本タスクでやらないこと:
    - 実際の UI wizard、button、camera start/stop。
    - online calibration。
    - Hand / Face ROI の新規実行。
    - profile 永続化、ユーザー設定保存。
    - motion-debug recording / viewer への接続。
- 依存タスクとの境界:
    - `ReliabilityMap` と `CameraQualityScore` は入力品質を提供する。
    - `CanonicalUpperBodyState` は `CanonicalCalibrationSnapshot` の保存 shape を提供する。

## 実装方針（既存コード整合: file:line）

- `CanonicalCalibrationSnapshot` は `id`、`source`、`neutralYawRad`、`shoulderWidth`、`torsoScale`、`handBaseline`、optional `capturedAtMediaTimeMs` を持つ（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:56`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:66`）。initial calibration はこの shape へ変換する。
- default canonical calibration は既に `source: "default"` で定義されている（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:129`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:131`）。本タスクは `source: "initial"` を使う。
- torso estimator は calibration を clone し、pose 由来の shoulder width が有効な場合に calibration shoulder width を更新している（`sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts:243`、`sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts:268`、`sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts:269`）。initial calibration も同じ calibration snapshot を後段へ渡す。
- motion-debug recording は pose frame ごとに canonical / reliability / temporal を生成している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:136`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:148`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:150`）。本タスクでは recording 接続はしないが、同じ入力型を読む pure function にする。
- calibration UX 調査は 3-step、status、`ready_without_hands`、失敗 step だけ retry を推奨している（`documents/research/character_animation/answers/08-calibration-ux.md:48`、`documents/research/character_animation/answers/08-calibration-ux.md:54`、`documents/research/character_animation/answers/08-calibration-ux.md:93`、`documents/research/character_animation/answers/08-calibration-ux.md:104`、`documents/research/character_animation/answers/08-calibration-ux.md:108`）。
- 通常 UI では内部 score ではなく行動文へ変換する方針が示されている（`documents/research/character_animation/answers/08-calibration-ux.md:225`、`documents/research/character_animation/answers/08-calibration-ux.md:229`、`documents/research/character_animation/answers/08-calibration-ux.md:255`）。

## テスト

- `cd sincromisor-frontend && npm run test -- initialSincroCalibration`
- `cd sincromisor-frontend && npm run test -- canonicalUpperBodyState`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、ユーザーに見える calibration status と developer-visible calibration contract を追加するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に status、step、retry reason、通常 UI / debug UI の情報境界を同期する。
