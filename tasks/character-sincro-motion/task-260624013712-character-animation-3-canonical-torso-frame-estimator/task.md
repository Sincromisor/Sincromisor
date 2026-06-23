# character animation 3.0 canonical torso frame estimator

## 背景 / 目的

`CanonicalUpperBodyState` は体幹基準の意味量 contract であり、腕や頭の値はすべて同じ body-local frame で解釈される必要がある。`documents/research/character_animation/roadmap.md` の Phase 2 は、torso frame を `shoulderCenter`、`hipCenter`、Face matrix、前フレーム、calibrated neutral から推定し、`bodyFront` の符号反転を前フレームと Face yaw で抑制することを求めている。

このタスクでは、依存タスクで固定した `CanonicalTorsoFrame` を生成する pure estimator を追加する。腕 feature 抽出や debug log への保存は後続へ分け、まず body-local 座標系を再利用可能な単位として固める。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts` を追加し、`estimateCanonicalTorsoFrame(input)`、`CanonicalTorsoFrameInput`、`CanonicalTorsoFrameResult` を exportする。
- [ ] `estimateCanonicalTorsoFrame()` は `SincroPoseMotionSnapshot` の左右 shoulder world target を優先して `shoulderCenter` と `bodyRight` を作り、左右 hip world target が有効な場合だけ `hipCenter` と `bodyUp` を hip 由来で作る。
- [ ] hip world target が欠損している場合、`hipCenter` は `previous.torso.hipCenter` がある場合だけ引き継ぎ、それ以外では省略する。`bodyUp` は `previous.torso.bodyUp`、なければ neutral `[0, 1, 0]` を使う。`calibration.torsoScale` は `torsoScale` の fallback にだけ使い、hip 座標を合成しない。`pose.upperBody.hipCenterTracked` は warning / confidence 判定だけに使う。
- [ ] `bodyFront` は `normalize(cross(bodyRight, bodyUp))` を候補とし、前フレームの `bodyFront` と dot product が負の場合は前フレームの `bodyFront` を維持して `front_flip_rejected` warning を付ける。前フレームがない場合は本タスクの「設計判断」にある Face yaw hint 式で候補の符号を決める。
- [ ] Face yaw 補助は `SincroFaceMotionSnapshot.headPose.yawDeg` を radian へ変換して `yawRad` に保存する。Face snapshot が未入力、未検出、confidence < 0.08 の場合は yaw 補助を使わず、`yawRad` は previous または `calibration.neutralYawRad` に fallback する。
- [ ] estimator の戻り値は `CanonicalTorsoFrame` と `CanonicalCalibrationSnapshot` を含み、calibration 未指定時は依存タスクの default calibration snapshot を使う。肩幅が有効に取れた場合は result 内の `calibration.shoulderWidth` を同じ値へ更新する。
- [ ] `bodyRight`、`bodyUp`、`bodyFront` は finite かつ長さ 1 に正規化される。入力が全欠損の場合は deterministic neutral frame `bodyRight=[1,0,0]`、`bodyUp=[0,1,0]`、`bodyFront=[0,0,1]`、`confidence=0` を返す。
- [ ] `sincromisor-frontend/src/character/canonical/__tests__/canonicalTorsoFrameEstimator.test.ts` を追加し、有効 world shoulder / hip、hip 欠損 fallback、front flip reject、Face yaw fallback、全欠損 neutral の各ケースを検証する。
- [ ] `documents/design/frontend/character/motion.md` に torso frame 推定の入力優先順位、front flip reject、calibration fallback を同期する。

## 設計判断（着手前に確定済み）

- estimator は `src/character/canonical/` に置き、`features/gaze/poseTracking` へ戻さない。pose tracking は観測 snapshot 作成までを担当し、body-local canonical frame は後段共有 contract の一部として扱うため。
- 入力型は次に固定する。`face` は optional とし、Phase 2 時点では Face transformation matrix ではなく既存 `SincroFaceMotionSnapshot.headPose.yawDeg` を補助に使う。Face matrix を主入力にする拡張は、既存 face snapshot に matrix の安定保存経路を追加する別タスクで扱う。

```ts
type CanonicalTorsoFrameInput = {
    pose: SincroPoseMotionSnapshot;
    face?: Pick<SincroFaceMotionSnapshot, "detected" | "confidence" | "headPose">;
    previous?: Pick<CanonicalUpperBodyState, "torso" | "calibration">;
    calibration?: CanonicalCalibrationSnapshot;
    mediaTimeMs: number;
};

type CanonicalTorsoFrameResult = {
    torso: CanonicalTorsoFrame;
    calibration: CanonicalCalibrationSnapshot;
};
```

- world point は `SincroPoseTargetPointSnapshot.world.hasWorldCoordinates === true` かつ `normalizedX/Y/Z` が finite の場合だけ使う。`rawX/Y/Z` は MediaPipe world の未正規化値なので canonical frame の主入力には使わない。
- `bodyRight` は anatomical right 方向に固定し、`rightShoulder - leftShoulder` で作る。preview mirror の左右はここに入れない。
- `bodyUp` は hip center が有効なら `normalize(shoulderCenter - hipCenter)`、無効なら previous の `bodyUp`、それもなければ neutral `[0,1,0]` とする。hip center が無効で previous hip center もない場合、`hipCenter` field は出力しない。`calibration.torsoScale` から `shoulderCenter - bodyUp * torsoScale` のような synthetic hip center は作らない。
- `torsoScale` は hip center が有効なら `distance(shoulderCenter, hipCenter)`、無効なら `previous.calibration.torsoScale`、`calibration.torsoScale`、`1` の順で決める。`pose.upperBody.hipCenterTracked === false` は `missing_world_coordinates` warning と confidence clamp の理由にだけ使う。
- `bodyFront` は `cross(bodyRight, bodyUp)` の候補を使う。ただし前フレームと反対向きになった候補は単眼推定の反転とみなし、前フレームの `bodyFront` を維持する。候補を採用してから平滑化する処理は Phase 5 の TemporalStateEstimator に残す。
- 前フレームがない場合の Face yaw hint は次に固定する。Face が `detected === true`、`confidence >= 0.08`、`Math.abs(yawRad) <= Math.PI / 2` のとき `faceForwardHint = normalize([Math.sin(yawRad), 0, Math.cos(yawRad)])` を使う。それ以外は `faceForwardHint = [0, 0, 1]` を使う。`dot(candidateBodyFront, faceForwardHint) < 0` なら `bodyFront = -candidateBodyFront` とし、`front_flip_rejected` warning を付ける。dot が 0 以上なら候補を採用する。
- confidence は `min(leftShoulder.worldConfidence, rightShoulder.worldConfidence, hipConfidenceOrFallback)` を基本とし、fallback を使った場合は最大 `0.45` に clamp する。全欠損 neutral は `confidence=0`。

## スコープ境界

- 本タスクでやること:
    - torso frame 推定の pure function。
    - 前フレーム / Face yaw / calibration fallback。
    - torso frame の unit test。
    - motion design 文書への torso frame 方針同期。
- 本タスクでやらないこと:
    - 腕の `reach` / `openness` / `forwardness` 抽出。
    - `motion-debug` live snapshot や log frame への canonical 保存。
    - Temporal smoothing、Kalman / One Euro filter。
    - Hand / Face ROI や MediaPipe raw serializer の追加。

## 実装方針（既存コード整合: file:line）

- `SincroPoseMotionSnapshot` は `upperBody` と左右 arm target を持ち、左右 shoulder は `leftArm.targets.shoulder` / `rightArm.targets.shoulder` から参照できる（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:60`、`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:79`）。
- lower body target には左右 hip が含まれる（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:51`）。Phase 2 では歩行や下半身制御はしないが、torso frame の hip center 補助としてだけ使う。
- world target は `coordinateSystem: "mediapipe_world"`、`anchor`、`hasWorldCoordinates`、`worldConfidence`、`normalizedX/Y/Z` を持つ（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:5`）。estimator は `normalizedX/Y/Z` だけを body-local frame 計算に使う。
- world target は `createSincroPoseTargetPoint()` で shoulder width または hip width 由来スケールに正規化されている（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTargetPoint.ts:161`）。estimator は MediaPipe raw world 値のスケールを再解釈しない。
- Face snapshot は head pose yaw / pitch / roll を degree で持つ（`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceMotionSnapshot.ts:1`）。本タスクでは yaw 補助だけに使い、head canonical 値の生成は行わない。

## テスト

- `cd sincromisor-frontend && npm run test -- canonicalTorsoFrameEstimator`
- `cd sincromisor-frontend && npm run build`
- synthetic pose snapshot で次を検証する:
    - 左右 shoulder / hip world target が有効なとき `bodyRight`、`bodyUp`、`bodyFront` が正規化される。
    - hip 欠損時に previous torso を使い、warning が付く。
    - 前フレームと反対向きの `bodyFront` 候補を reject し、`front_flip_rejected` が付く。
    - Face 未検出時は `yawRad` が calibration neutral へ fallback する。
    - 全欠損時に neutral frame と `confidence=0` を返し、NaN を出さない。
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、character motion pipeline の内部 contract と debug / replay の解釈に影響するため、`documents/design/frontend/character/motion.md` に torso frame 推定の入力優先順位、front flip reject、calibration fallback を同期する。
