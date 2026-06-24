# character animation 3.0 camera quality score

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の Phase 3 は、実 camera settings と camera framing を debug snapshot に載せ、`resolution`、`cadence`、`torso in frame`、`hands in frame`、`border risk`、`hand small risk`、`motion blur risk` を説明可能な `CameraQualityScore` として扱うことを求めている。

依存タスクで video frame clock が入ると、フレーム間隔と dropped frame を video frame 基準で観測できる。次に必要なのは、MediaPipe の confidence だけではなく「カメラ入力が悪いのか」「体が画角外なのか」「手が小さすぎるのか」を motion-debug で切り分けるための品質スコアである。

このタスクでは CameraQualityScore v1 を導入し、live snapshot、recording frame、viewer の camera layer で確認できるようにする。ReliabilityMap への接続は Phase 4 の責務として残し、本タスクでは score とユーザーが直せる guide message までを扱う。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/cameraQualityScore.ts` を追加し、`createCameraQualityScore(input)` が finite number / enum / plain object だけで構成された `CameraQualityScore` を返す。
- [ ] `CameraQualityScore` は `schemaVersion: "sincro.camera-quality.v1"`、`overall`、`components`、`reasons`、`guideMessages`、`track`、`sample` を持つ。`overall.score` は `0..1`、`overall.status` は `"good" | "warn" | "bad"` に固定する。
- [ ] `components` は `resolution`、`cadence`、`torsoInFrame`、`handsInFrame`、`borderRisk`、`handSmallRisk`、`motionBlurRisk` を持つ。各 component は `score: 0..1`、`status: "good" | "warn" | "bad" | "unknown"`、`reasonCodes: CameraQualityReasonCode[]` を持つ。
- [ ] component score は status から一意に決め、`good = 1`、`warn = 0.55`、`bad = 0`、`unknown = 0` とする。`overall.score` は `unknown` を含む全 7 component の平均に固定し、`overall.status` は `overall.score >= 0.8` かつ `bad` component なしなら `good`、`overall.score >= 0.45` かつ `bad` component が 2 件以下なら `warn`、それ以外は `bad` とする。
- [ ] `track` には scrub 済みの `width`、`height`、`frameRate`、`facingMode`、`readyState` を保存する。raw `deviceId`、`groupId`、`label` は `CameraQualityScore` に入れない。
- [ ] `sample` には `mediaTimeMs`、`clockSource`、`droppedPresentedFrames`、`videoWidth`、`videoHeight`、`poseDetected`、`poseConfidence` を保存する。依存タスクの optional timestamp field はあれば保存し、なければ省略する。
- [ ] resolution score は `track.width * track.height >= 1280 * 720` を `good`、`>= 640 * 480` を `warn`、それ未満または width / height 欠損を `bad` とする。fixture source で track settings が無い場合は `videoWidth` / `videoHeight` を同じ閾値で使う。
- [ ] cadence score は依存タスクの `TrackerVideoFrameTiming` から直近 30 frame の media-time interval と dropped frame を使う。median fps `>= 12` かつ dropped frame rate `< 0.08` を `good`、fps `>= 8` かつ dropped frame rate `< 0.2` を `warn`、それ以外を `bad` とする。サンプル数が 5 未満の場合は `unknown` にする。
- [ ] torso / hands in frame は `SincroPoseMotionSnapshot` の shoulder / hip / wrist / elbow camera coordinates を使う。座標が `0..1` の内側かつ border margin `0.08` より内側なら `good`、内側だが margin 未満なら `warn`、欠損または外側なら `bad` にする。
- [ ] `borderRisk` は torso / hands の border 判定を集約する独立 component とする。torso / hands の対象点すべてが欠損する場合は `unknown`、対象点のいずれかが `0..1` 外なら `bad` + 該当 reason、対象点の最小 border distance が `< 0.04` なら `bad` + `torso_near_border` または `hand_near_border`、`< 0.08` なら `warn` + 該当 reason、それ以外は `good` とする。torso と hand の両方に reason が出る場合は両方を `reasonCodes` に入れる。
- [ ] hand small risk は wrist-elbow 2D 距離または shoulder width を video normalized space で評価し、両腕とも有効距離 `>= 0.08` を `good`、いずれか `0.04..0.08` を `warn`、両腕欠損または `< 0.04` を `bad` にする。3D world distance は v1 では使わない。
- [ ] motion blur risk は実画像解析ではなく v1 proxy とする。cadence `bad` または actual `frameRate < 8` の場合は `bad`、actual `frameRate < 10` または pose detected なのに `poseConfidence < 0.25` が直近 10 frame 中 6 frame 以上続く場合は `warn`、それ以外は `good` とする。pixel blur 検出は本タスクに含めない。
- [ ] guide message は reason code から deterministic に作り、最大 3 件だけ返す。優先順は `torso_out_of_frame`、`torso_near_border`、`hand_out_of_frame`、`hand_near_border`、`hand_too_small`、`motion_blur_risk`、`low_resolution`、`low_cadence`、`dropped_frames`、`track_not_live` とする。同じ文言に複数 reason が対応する場合は優先順が高い reason code と最も重い severity を採用する。文言は `"少し下がってください"`、`"体を画面中央に入れてください"`、`"手が画面から出ないようにしてください"`、`"部屋を明るくしてください"`、`"カメラ解像度を上げてください"` のいずれかに固定する。
- [ ] `motion-debug` live snapshot の `camera.quality` と viewer の camera layer に `CameraQualityScore` が表示される。source が `"none"` のときは score を作らず、camera layer は従来どおり `not_recorded` / `not_implemented` 相当になる。
- [ ] `MotionDebugRecorder.recordFrame()` に渡す frame input の `frame.metrics.cameraQuality` に `CameraQualityScore` を保存する。top-level `cameraQuality` は増やさない。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/cameraQualityScore.test.ts` を追加し、resolution、cadence unknown / good / bad、torso border、hands out-of-frame、hand small、motion blur proxy、guide message 上限を検証する。
- [ ] `motionDebugViewerModel` の test を更新し、live camera layer と replay frame の `frame.metrics.cameraQuality` 表示境界を検証する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に CameraQualityScore v1 の保存場所、raw device ID を持たないこと、guide message の固定文言、ReliabilityMap 未接続であることを同期する。

## 設計判断（着手前に確定済み）

- `CameraQualityScore` の pure scorer は `sincromisor-frontend/src/features/gaze/trackingRuntime/cameraQualityScore.ts` に置く。`pages/motionDebug` に閉じる案は、Phase 4 の ReliabilityMap が camera quality を読むとき再利用できないため採用しない。
- `CameraQualityScore` は trackingRuntime の型として export し、`motion-debug` は値を表示 / 保存するだけにする。`SincroPoseTracker` の snapshot 型へ直接埋め込む案は、Face-only / fixture / future Hand tracker でも camera quality を共有したいため採用しない。
- 最小 schema は次に固定する。

```ts
export type CameraQualityStatus = "good" | "warn" | "bad" | "unknown";
export type CameraQualityReasonCode =
    | "low_resolution"
    | "low_cadence"
    | "dropped_frames"
    | "torso_out_of_frame"
    | "torso_near_border"
    | "hand_out_of_frame"
    | "hand_near_border"
    | "hand_too_small"
    | "motion_blur_risk"
    | "track_not_live";

export type CameraQualityComponent = {
    score: number;
    status: CameraQualityStatus;
    reasonCodes: CameraQualityReasonCode[];
};

export type CameraQualityScore = {
    schemaVersion: "sincro.camera-quality.v1";
    overall: { score: number; status: Exclude<CameraQualityStatus, "unknown"> };
    components: Record<
        | "resolution"
        | "cadence"
        | "torsoInFrame"
        | "handsInFrame"
        | "borderRisk"
        | "handSmallRisk"
        | "motionBlurRisk",
        CameraQualityComponent
    >;
    reasons: CameraQualityReasonCode[];
    guideMessages: { code: CameraQualityReasonCode; text: string; severity: "warn" | "bad" }[];
    track: {
        width?: number;
        height?: number;
        frameRate?: number;
        facingMode?: string;
        readyState?: MediaStreamTrackState;
    };
    sample: {
        mediaTimeMs?: number;
        clockSource?: string;
        droppedPresentedFrames?: number;
        videoWidth: number;
        videoHeight: number;
        poseDetected: boolean;
        poseConfidence: number;
    };
};
```

- `overall.score` は全 7 component の score 平均にする。`unknown` は score `0` として扱い、unknown component を `good` 扱いしない。`overall.status` は受け入れ条件の閾値で一意に決める。
- guide message は reason code から固定文言へ変換し、LLM や自由文生成は使わない。debug / replay の期待値を deterministic にするため。
- motion blur は v1 では proxy 指標に留める。Canvas pixel sampling や optical flow を入れる案は重く、Phase 3 の baseline を越えるため採用しない。
- camera settings の scrub 方針は既存 motion log と同じく raw `deviceId` / `groupId` / `label` を保存しない。hash も本タスクでは追加しない。
- 外部境界は browser `MediaStreamTrack.getSettings()` と video / pose snapshot だけである。settings が空、track が ended、pose が未検出の場合も throw せず score / reason へ落とす。

## スコープ境界

- 本タスクでやること:
    - CameraQualityScore v1 の型と scorer。
    - motion-debug snapshot / viewer / recording への表示と保存。
    - scrub 済み track settings の取り込み。
    - ユーザーが直せる固定 guide message の生成。
    - tracking / motion 設計文書の同期。
- 本タスクでやらないこと:
    - ReliabilityMap へ quality weight を接続すること。
    - TemporalStateEstimator や IK weight を camera quality で変えること。
    - 画像の brightness / blur を pixel 解析すること。
    - camera permission UI や device selector の追加。
    - raw `deviceId`、`groupId`、`label`、映像 frame の保存。
- 依存タスクとの境界:
    - `task-260624222255-character-animation-3-video-frame-clock` が `TrackerVideoFrameTiming` と dropped frame を提供する。本タスクはそれを読み、clock 実装そのものは変更しない。

## 実装方針（既存コード整合: file:line）

- motion-debug の camera request は `MOTION_DEBUG_CAMERA_CONSTRAINTS` で 1280x720 ideal / facingMode user を要求している（`sincromisor-frontend/src/pages/motionDebug/motionDebugCameraStream.ts:3`、`sincromisor-frontend/src/pages/motionDebug/motionDebugCameraStream.ts:8`）。quality score は requested ではなく `getSettings()` と video actual size を使う。
- `MotionDebugCameraState` は現在 `source`、`width`、`height`、`readyState` だけを持つ（`sincromisor-frontend/src/pages/motionDebug/types.ts:32`）。本タスクでは optional `quality?: CameraQualityScore` を追加し、既存 field 名は変えない。
- `MotionDebugSnapshot` は camera / recording / pose / canonical / tracker / render を返す（`sincromisor-frontend/src/pages/motionDebug/types.ts:95`）。quality は top-level を増やさず `camera` 配下に置く。
- `MotionDebugApp.handlePoseMotion()` は pose snapshot 更新、Debug Console 更新、recording、overlay render を同じ callback で行う（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:513`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:517`）。quality score は最新 pose と最新 frame timing からここで更新し、record frame へ渡す。
- `MotionDebugRecordingController.createManifest()` は active stream の video track を読む入口を持つ（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:154`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:156`）。本タスクでは frame-level quality を追加するが、manifest の raw camera setting scrub 方針は変えない。
- viewer model の camera layer は replay manifest があれば `manifest.camera`、live なら `liveSnapshot.camera` を表示する（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:157`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:164`）。本タスクでは `frame.metrics.cameraQuality` がある replay frame では frame quality を優先する。
- viewer renderer は selected layer を JSON.stringify して表示する（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerRenderer.ts:38`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerRenderer.ts:44`）。専用 UI は追加せず、camera layer JSON と live summary 行で確認できれば完了とする。
- motion log schema の frame は optional `metrics` を持つ（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:95`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:109`）。保存先は `frame.metrics.cameraQuality` を採用し、top-level `cameraQuality` は増やさない。
- `documents/design/frontend/character/tracking.md` は motion debug が source 判定と camera setting scrub を page 側で行うと説明している（`documents/design/frontend/character/tracking.md:65`、`documents/design/frontend/character/tracking.md:109`）。CameraQualityScore の scrub と保存場所を同期する。
- `documents/design/frontend/character/motion.md` は v1 frame の最低保存 field と metrics 入力境界を説明している（`documents/design/frontend/character/motion.md:135`、`documents/design/frontend/character/motion.md:138`）。`frame.metrics.cameraQuality` を同期する。

## テスト

- `cd sincromisor-frontend && npm run test -- cameraQualityScore`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- 手動または Playwright で `motion-debug` を開き、camera layer に `schemaVersion: "sincro.camera-quality.v1"` と guide message が表示されることを確認する。camera 権限が使えない場合は fixture / unit test で代替し、未実行理由を `impl.md` に残す。
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer 向け motion-debug snapshot / viewer / log の保存内容とユーザー向け guide 文言が増えるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に CameraQualityScore v1、保存先、scrub 方針、ReliabilityMap への未接続を同期する。
