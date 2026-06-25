# character animation 3.0 phase 7 online calibration guard

## 背景 / 目的

Phase 7 の online calibration は、ユーザー側の neutral yaw / shoulder width / body scale / hand open baseline だけを高信頼度・near-neutral 時に低速更新する。VRM rest rotation、bone length、humanoid mapping、handedness mapping、関節 limit は online で変えてはいけない。

このタスクでは、online calibration の gate、candidate / committed の 2 段階状態、freeze reason、drift clamp を pure module として追加する。実 UI、永続化、AvatarMotionProfile の変更は扱わない。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/calibration/onlineSincroCalibration.ts` を追加し、`SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION = "sincro.online-calibration.v1"`、`OnlineSincroCalibrationState`、`OnlineSincroCalibrationStateParseResult`、`OnlineCalibrationFreezeReason`、`parseOnlineSincroCalibrationState()`、`cloneOnlineSincroCalibrationState()`、`evaluateOnlineCalibrationGate()`、`updateOnlineCalibrationState()`、`createCanonicalCalibrationFromOnlineState()` を export する。
- [ ] `OnlineSincroCalibrationState` は `initial`、`candidate`、`committed` を分けて保存する。`candidate.stableDurationMs >= 3000` かつ gate open が継続した場合だけ committed へ反映する。
- [ ] 更新対象は `neutralYawRad`、`shoulderWidth`、`torsoScale`、`handBaseline.left/right.palmSize`、`handBaseline.left/right.openSpread` に限定する。
- [ ] gate は torso reliability、head reliability、both shoulders visible、border risk、motion blur risk、arm activity、face yaw、bone length consistency を評価し、閉じている場合は state を更新せず `freezeReasons` を返す。
- [ ] drift clamp は initial calibration から `shoulderWidth ±15%`、`torsoScale ±20%`、`neutralYawRad ±10deg`、`handBaseline palmSize/openSpread ±20%` に固定する。clamp 発生時は `drift_clamped` reason を残す。
- [ ] EMA は `alpha = 1 - Math.exp(-dtSec / tauSec)` を使い、tau は shoulder/body scale `120s`、neutral yaw `90s`、hand baseline `20s` に固定する。
- [ ] `createCanonicalCalibrationFromOnlineState()` は `CanonicalCalibrationSnapshot` を返し、`id` は `online-calibration:${committed.updatedAtMediaTimeMs}`、`source: "online"`、`capturedAtMediaTimeMs` は committed updated 時刻に固定する。committed がない場合は initial snapshot を clone して返す。
- [ ] `parseOnlineSincroCalibrationState()` は `{ ok: true; state: OnlineSincroCalibrationState } | { ok: false; errors: OnlineSincroCalibrationStateParseError[] }` を返す。unknown freeze reason、`NaN` / `Infinity`、negative duration、extra key、runtime object 風 value は reject し、`invalid_state` または `out_of_range` に分類する。
- [ ] `sincromisor-frontend/src/character/calibration/__tests__/onlineSincroCalibration.test.ts` を追加し、gate open、各 freeze reason、gate close 後の candidate reset、candidate only、committed promotion、drift clamp、parse failure、EMA tau、canonical calibration 変換を検証する。
- [ ] `documents/design/frontend/character/motion.md` に online calibration の更新対象、変更禁止対象、gate、drift clamp、debug 表示項目を同期する。

## 設計判断（着手前に確定済み）

- module 所在は initial calibration と同じ `src/character/calibration/` とする。`canonicalTorsoFrameEstimator.ts` 内へ直接入れる案は、観測から canonical を作る責務と long-lived calibration state が混ざるため採用しない。
- online calibration は `CanonicalCalibrationSnapshot` を出力するが、`AvatarMotionProfile` は変更しない。avatar 構造値と人間側観測基準を分けるため。
- `OnlineSincroCalibrationState` の最小 schema は次に固定する。

```ts
export type OnlineCalibrationFreezeReason =
    | "torso_low_reliability"
    | "head_low_reliability"
    | "shoulders_not_visible"
    | "border_risk"
    | "motion_blur"
    | "arm_activity_high"
    | "face_yaw_not_neutral"
    | "bone_length_inconsistent"
    | "candidate_not_stable"
    | "drift_clamped";

export type OnlineCalibrationSample = {
    mediaTimeMs: number;
    neutralYawRad?: number;
    shoulderWidth?: number;
    torsoScale?: number;
    handBaseline?: CanonicalCalibrationSnapshot["handBaseline"];
    gate: {
        torsoReliability: number;
        headReliability: number;
        bothShouldersVisible: boolean;
        borderRisk: number;
        motionBlurRisk: number;
        armActivity: number;
        faceYawAbsRad: number;
        boneLengthConsistency: number;
    };
};

export type OnlineSincroCalibrationState = {
    schemaVersion: "sincro.online-calibration.v1";
    initial: CanonicalCalibrationSnapshot;
    candidate?: CanonicalCalibrationSnapshot & { stableDurationMs: number };
    committed?: CanonicalCalibrationSnapshot & { updatedAtMediaTimeMs: number };
    freezeReasons: OnlineCalibrationFreezeReason[];
};

export type OnlineSincroCalibrationStateParseResult =
    | { ok: true; state: OnlineSincroCalibrationState }
    | {
          ok: false;
          errors: Array<{
              code: "unknown_schema_version" | "invalid_state" | "out_of_range";
              path: string[];
              message: string;
          }>;
      };
```

- gate threshold は `torsoReliability > 0.85`、`headReliability > 0.80`、`borderRisk < 0.30`、`motionBlurRisk < 0.50`、`armActivity < 0.20`、`faceYawAbsRad < 12deg`、`boneLengthConsistency > 0.80` に固定する。
- gate が閉じた frame では `candidate` を破棄し、`stableDurationMs` は次回 gate open 時に `0` から再開する。closed frame 後に再 open しても、前回 candidate の安定時間を committed promotion に使わない。
- gate open 時、前回 sample から `mediaTimeMs` が増加していない場合は candidate を更新せず `freezeReasons: ["candidate_not_stable"]` を返す。
- drift clamp は更新停止ではなく、clamp 済み値で candidate / committed を更新したうえで `drift_clamped` を debug reason として残す。gate close の freeze reason と区別するため、`drift_clamped` だけを理由に candidate を破棄しない。
- `candidate` と `committed` の比較には `mediaTimeMs` を使う。`performance.now()` は replay 決定性を壊すため使わない。
- freeze reason は debug 表示用にすべて残すが、通常 UI 文言化は本タスクでは行わない。

## スコープ境界

- 本タスクでやること:
    - online calibration の gate / state / update / canonical snapshot 変換。
    - drift clamp と freeze reason。
    - unit test と設計文書同期。
- 本タスクでやらないこと:
    - initial calibration wizard。
    - motion-debug recording / viewer への接続。
    - localStorage / settings 保存。
    - AvatarMotionProfile の更新。
    - VRM rest rotation、bone length、humanoid mapping、joint limit の変更。
- 依存タスクとの境界:
    - initial calibration task が initial snapshot と status を提供する。
    - temporal / reliability task が low confidence や arm activity を評価する材料を提供する。

## 実装方針（既存コード整合: file:line）

- `CanonicalCalibrationSnapshot` は JSON 保存可能な calibration shape として定義済みである（`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:56`、`sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts:62`）。online state もこの shape を clone して扱う。
- torso estimator は input calibration / previous calibration を fallback に使う（`sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts:177`、`sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts:188`、`sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts:246`）。online calibration はこの input に渡せる snapshot を返す。
- `TemporalUpperBodyState` は canonical scalar と body-local tuple を保持し、VRM pose を含まない（`sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:68`、`sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:100`）。arm activity は temporal arm scalar / velocity から計算する方針にする。
- calibration UX 調査は online calibration の更新可否、禁止値、EMA tau、near-neutral gate、drift guard を示している（`documents/research/character_animation/answers/08-calibration-ux.md:122`、`documents/research/character_animation/answers/08-calibration-ux.md:128`、`documents/research/character_animation/answers/08-calibration-ux.md:138`、`documents/research/character_animation/answers/08-calibration-ux.md:152`、`documents/research/character_animation/answers/08-calibration-ux.md:179`、`documents/research/character_animation/answers/08-calibration-ux.md:208`）。
- roadmap Phase 7 は `candidate` と `committed` を分け、3-5 秒以上安定した候補だけ committed に反映することを求めている（`documents/research/character_animation/roadmap.md:444`、`documents/research/character_animation/roadmap.md:445`、`documents/research/character_animation/roadmap.md:446`）。

## テスト

- `cd sincromisor-frontend && npm run test -- onlineSincroCalibration`
- `cd sincromisor-frontend && npm run test -- initialSincroCalibration`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な calibration policy と debug reason が増えるため、`documents/design/frontend/character/motion.md` に online calibration の更新対象、禁止対象、gate、drift clamp、freeze reason を同期する。
