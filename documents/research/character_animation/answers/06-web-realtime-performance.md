# Sincromisor `sincro` モード Webリアルタイム実装 / パフォーマンス調査レポート

対象: `sincromisor-frontend` / TypeScript + Vite + MediaPipe Tasks Web + Three.js + `@pixiv/three-vrm`
対象時点: **2026年6月14日**

## 0. 結論

`sincro` モードのリアルタイム性能設計では、単に推論を高速化するより、**映像フレーム時刻を基準にした FrameClock、UI thread を詰まらせない Worker 分離、端末負荷に応じた degradation policy、再現可能な debug snapshot** を優先すべきです。添付 `06-web-realtime-performance.md` でも、調査対象は高速化単体ではなく、推論タイミングの安定、frame timestamp の整合、UI thread の詰まり回避、会話中に許容できる体感遅延に置かれています。

推奨する標準構成は次です。

```text
Camera / HTMLVideoElement
  -> VideoFrameClock(requestVideoFrameCallback)
  -> PerceptionWorker
       - Pose: full-frame
       - Hand: pose-seeded ROI, lower fps
       - Face: face/head ROI or full-frame fallback
       - Gesture: hand result derived, event/lower fps
  -> compact observation snapshot
  -> Reliability / Canonical / Temporal / MotionIntent
  -> Retarget / IK / PoseComposer
  -> vrm.humanoid.setNormalizedPose(finalPose)
  -> vrm.update(delta)
  -> renderer.render(scene, camera)
```

ロードマップ資料の既存方針とも整合します。既存資料では `TrackerRuntime` が camera track / video element / frame clock / Worker fallback を所有し、`PerceptionOrchestrator` が Pose full-frame と Hand / Face ROI を扱い、後段で Reliability、Canonical、Temporal、MotionIntent、AvatarMotionProfile、Retarget / IK / Clip Mixer へ渡す構成が示されています。 また、three-vrm 側は MediaPipe の不確実性を解く場所ではなく、最終的な `VRMHumanoid` normalized local pose を安全に適用する層にする、という既存 three-vrm レポートの方針を維持します。

---

## 1. 現行リポジトリ確認

現行 `sincromisor-frontend` は、`package.json` 上で `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、`vite`、`typescript` を利用しており、今回の前提技術と一致しています。([GitHub][1]) `src/features/gaze/trackingRuntime` には `sincroTracker.worker.ts`、`sincroTrackerWorkerClient.ts`、`trackerRuntimeFrameLoop.ts`、`trackerRuntimeCadence.ts`、`trackerRuntimePosePerformanceGate.ts` などがあり、すでに Worker / fallback / cadence / performance gate の足場があります。([GitHub][2])

現行の `trackerRuntimeFrameLoop.ts` は `requestAnimationFrame()` で `predict()` をスケジュールしています。つまり、現在の推論起動は基本的に描画周期基準であり、カメラの実映像フレーム基準ではありません。([GitHub][3]) これに対して、添付 roadmap では Phase 2 として `requestAnimationFrame` 基準から動画フレーム基準の clock へ移行し、`mediaTime`、`presentationTime`、`presentedFrames` と `MediaStreamTrack.getSettings()` を debug snapshot に載せる方針が明記されています。

一方で Worker 実装は既に有効な土台です。`SincroTrackerWorkerClient` は Worker と `createImageBitmap` の存在をサポート条件にし、`ImageBitmap` と `timestampMs` を Worker に転送し、`transferTimeMs`、`workerRoundTripMs`、`droppedFrames` などの統計を持っています。([GitHub][4]) Worker 側では FaceTracker と PoseTracker を初期化し、受け取った `ImageBitmap` に対して face / pose detection を実行し、処理後に `message.frame.close()` して GPU-backed resource の蓄積を防いでいます。([GitHub][5]) ([GitHub][5])

したがって、新規に大きな別構成を作るより、既存の `trackingRuntime` を拡張して **FrameClock、CameraQuality、Multi-pass Perception、DebugSnapshot** を追加するのが妥当です。

---

## 2. FrameClock 設計案

### 2.1 `requestVideoFrameCallback()` を使う理由

`HTMLVideoElement.requestVideoFrameCallback()` は、動画フレームが compositor に送られるタイミングで callback を実行する API です。MDN では 2024 Baseline の新規利用可能機能として扱われ、2024年10月以降の最新ブラウザ群で利用可能とされています。([MDN Web Docs][6])

`requestAnimationFrame()` は display refresh / rendering のための clock であり、カメラ入力が 30fps、描画が 60Hz、ディスプレイが 120Hz のような場合、実映像フレームと一致しません。MediaPipe の `detectForVideo()` に渡す timestamp、Pose / Hand / Face / Gesture の同一フレーム対応、drop 判定を安定させるには、**推論起動は video frame 基準、描画は RAF 基準**に分離します。

```text
VideoFrameClock:
  camera/video frame arrival を検出
  mediaTimeMs を frame timestamp として採用
  inference request を発行

RenderClock:
  requestAnimationFrame で 60fps 目標
  最新の stable motion state を読む
  VRM update + render
```

### 2.2 `mediaTime` / `presentationTime` / `presentedFrames` の使い方

`requestVideoFrameCallback()` の metadata には、`mediaTime`、`presentationTime`、`presentedFrames`、`processingDuration` などが含まれます。`mediaTime` は `HTMLMediaElement.currentTime` timeline 上の秒単位 timestamp、`presentationTime` は browser が frame を composition に提出した時刻、`presentedFrames` はこれまで composition に提出された frame 数で、callback 間の欠落検出に使えます。([MDN Web Docs][6])

Sincromisor では、用途を明確に分けます。

| metadata                       | 用途                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `metadata.mediaTime * 1000`    | MediaPipe `detectForVideo()` に渡す統一 timestamp。Pose / Hand / Face / Gesture の同一 video frame 紐付けに使う |
| `metadata.presentationTime`    | browser 側の表示提出時刻。end-to-end latency / render alignment / debug 表示に使う                              |
| `metadata.expectedDisplayTime` | callback が v-sync に間に合っているか、処理開始が遅れているかの判定に使う                                       |
| `metadata.presentedFrames`     | `delta > 1` なら callback missed / frame drop として記録                                                        |
| `metadata.processingDuration`  | decoder 側遅延の参考値。カメラ入力では常に有用とは限らないため optional として記録                              |

### 2.3 推奨 `FrameClock` 型

```ts
type VideoFrameTick = {
    frameSeq: number;
    mediaTimeMs: number;
    nowMs: DOMHighResTimeStamp;
    presentationTimeMs?: DOMHighResTimeStamp;
    expectedDisplayTimeMs?: DOMHighResTimeStamp;
    presentedFrames?: number;
    droppedPresentedFrames: number;
    videoWidth: number;
    videoHeight: number;
};

type FrameClockMode =
    | "requestVideoFrameCallback"
    | "raf-currentTime"
    | "timer-fallback";
```

```ts
function onVideoFrame(
    now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata,
) {
    const mediaTimeMs = metadata.mediaTime * 1000;
    const dropped =
        lastPresentedFrames == null
            ? 0
            : Math.max(0, metadata.presentedFrames - lastPresentedFrames - 1);

    const tick: VideoFrameTick = {
        frameSeq: ++frameSeq,
        mediaTimeMs,
        nowMs: now,
        presentationTimeMs: metadata.presentationTime,
        expectedDisplayTimeMs: metadata.expectedDisplayTime,
        presentedFrames: metadata.presentedFrames,
        droppedPresentedFrames: dropped,
        videoWidth: metadata.width,
        videoHeight: metadata.height,
    };

    perceptionScheduler.enqueueLatest(tick);
    lastPresentedFrames = metadata.presentedFrames;
    video.requestVideoFrameCallback(onVideoFrame);
}
```

重要なのは、`requestVideoFrameCallback()` の callback 内で重い MediaPipe 推論を直接実行しないことです。MDN もこの API の用途を video processing / video analysis と説明していますが、callback 自体は main thread 上で呼ばれるため、重い同期推論は Worker に委譲する必要があります。([MDN Web Docs][6]) MediaPipe Pose / Hand / Face / Gesture の `detectForVideo()` / `recognizeForVideo()` は同期実行で UI thread をブロックするため、公式ドキュメントでも Web Worker による別 thread 実行が案内されています。([Google for Developers][7]) ([Google for Developers][8]) ([Google for Developers][9]) ([Google for Developers][10])

### 2.4 fallback

`requestVideoFrameCallback` が使えない、あるいは対象ブラウザで挙動が不安定な場合は、次の順で fallback します。

1. `requestVideoFrameCallback`
2. `requestAnimationFrame` + `video.currentTime` 変化検出
3. `setTimeout` / `setInterval` による低 fps debug fallback

fallback では `mediaTimeMs = video.currentTime * 1000` とし、同一 `currentTime` のフレームを重複処理しません。ただし、このモードでは `presentedFrames` による drop 検出ができないため、`rafDeltaMs`、`currentTime` 差分、実推論 fps から近似します。

---

## 3. CameraQuality 設計

### 3.1 `getUserMedia` constraints

標準設定は、現行 `motionDebugCameraStream.ts` と既存 report02 の方向性に合わせ、desktop では 1280x720 ideal を起点にします。現行 motion debug でも `width: { ideal: 1280 }`、`height: { ideal: 720 }`、`facingMode: "user"`、`audio: false` の constraints で `getUserMedia()` を呼んでいます。([GitHub][11]) report02 でも同様に 1280x720 / 30fps / facingMode user を推奨起点にしています。

```ts
const constraints: MediaStreamConstraints = {
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: { ideal: "user" },
    },
    audio: false,
};
```

`exact` や強い `min` / `max` は、満たせない場合に `getUserMedia()` / `applyConstraints()` が失敗しやすくなります。MDN でも `min`、`max`、`exact` は必須制約として扱われ、満たせない場合は Promise が reject されると説明されています。([MDN Web Docs][12]) そのため、通常起動では `ideal` 中心、ユーザーが明示的にデバイス・品質を選ぶ場合だけ `deviceId` や厳密 constraints を使います。

### 3.2 `getSettings()` で記録すべき値

カメラ設定は指定通りになるとは限らないため、`MediaStreamTrack.getSettings()` の実値を debug snapshot に保存します。添付 roadmap でも、実解像度・実 fps・facing mode を debug snapshot に載せる方針が Phase 2 の実装項目になっています。

最低限記録すべき値は次です。

```ts
type CameraSettingsSnapshot = {
    requested: MediaStreamConstraints;
    settings: {
        width?: number;
        height?: number;
        frameRate?: number;
        aspectRatio?: number;
        facingMode?: string;
        resizeMode?: string;
        deviceIdHash?: string;
        groupIdHash?: string;
    };
    videoElement: {
        videoWidth: number;
        videoHeight: number;
        readyState: number;
    };
    track: {
        enabled: boolean;
        muted: boolean;
        readyState: MediaStreamTrackState;
    };
};
```

`deviceId` / `groupId` は privacy を考慮し、debug export では hash 化または省略を標準にします。

### 3.3 CameraQualityScore

MediaPipe confidence だけでは、撮影条件の失敗を十分に説明できません。既存 report02 でも、カメラ入力、解像度、フレーム時刻、画角は capture layer の責務であり、典型不具合として motion blur、低解像度、フレーム時刻ずれが挙げられています。

推奨する品質スコアは次です。

```ts
type CameraQualityScore = {
    resolutionScore: number;
    cadenceScore: number;
    torsoInFrame: number;
    leftHandInFrame: number;
    rightHandInFrame: number;
    borderRisk: number;
    handSmallRisk: number;
    underExposureRisk: number;
    motionBlurRisk: number;
    overall: number;
    reasons: CameraQualityReason[];
};
```

判定目安は以下です。

| 項目            | 判定方法                                                       |
| --------------- | -------------------------------------------------------------- |
| 実解像度        | `getSettings().width/height` と `video.videoWidth/videoHeight` |
| 実 fps          | `mediaTime` 差分、`presentedFrames` 差分、推論実行間隔         |
| dropped frame   | `presentedFrames` 差分が 1 を超える                            |
| border risk     | shoulder / elbow / wrist / hand bbox が画面端 5〜10% に近い    |
| hand small risk | hand bbox が 80px 未満、または指 landmark spread が小さい      |
| torso in frame  | 両肩・顔・腰上が画面内に入っているか                           |
| under exposure  | 小さな downsample canvas / worker thumbnail の平均輝度         |
| motion blur     | landmark 速度、edge contrast 低下、confidence 低下の組み合わせ |

UX では内部指標をそのまま出さず、ユーザーが修正可能な行動に変換します。既存 report03 でも、「肩が入っていない」「手が画面端」「手が小さい」「顔だけ大きい」「露出不足」「motion blur」などを、ユーザー向けガイド文に分離する方針が示されています。

---

## 4. MediaPipe 推論 loop の推奨構成

### 4.1 基本方針

MediaPipe Tasks Web は、Pose / Hand / Face / Gesture を単純に全フレーム同 fps で並列実行するのではなく、**Pose を全体検出、Hand / Face / Gesture を optional pass** として扱います。report02 の推奨構成でも、Camera -> FrameClock / CameraQuality -> MediaPipe multi-pass detection -> Reliability -> Canonical -> Temporal -> Semantic -> AvatarRetargetProfile -> IK/FK -> Three.js / VRM という流れになっています。

推奨順序は次です。

```text
for each accepted video frame:
  1. Pose full-frame
  2. derive torso/head/hand ROI from pose + previous state
  3. Face pass
       - high tier: ROI or full frame, 15-30fps
       - fallback: Pose nose/ears/eyes based head estimate
  4. Hand pass
       - pose wrist seeded ROI, 10-30fps by device class
       - if hand small / lost, temporarily full-frame or enlarged ROI
  5. Gesture pass
       - lower fps or event-driven
       - uses stable hand result and hysteresis
  6. emit ObservationFrame(frameSeq, mediaTimeMs)
```

Hand Landmarker と Gesture Recognizer は Video mode で tracking 状態を持ち、tracking が成功していれば検出器を skip し、失敗時に再検出へ戻る設計です。Hand Landmarker の `minHandPresenceConfidence` / `minTrackingConfidence`、Gesture Recognizer の hand presence / tracking confidence は、この状態機械に直接関係します。([Google for Developers][8]) ([Google for Developers][10])

### 4.2 timestamp 整合

すべての pass は同一 `VideoFrameTick.mediaTimeMs` を受け取ります。

```ts
type ObservationFrame = {
    frameSeq: number;
    mediaTimeMs: number;
    source: {
        clockMode: FrameClockMode;
        presentedFrames?: number;
    };
    pose?: PoseObservation;
    face?: FaceObservation;
    hands?: HandObservation[];
    gesture?: GestureObservation[];
    timings: PerceptionTimings;
};
```

Face / Hand / Gesture の fps を落とす場合でも、古い結果を使ったことが分かるように `sourceMediaTimeMs` と `ageMs = currentMediaTimeMs - sourceMediaTimeMs` を各 observation に持たせます。これにより、描画側や temporal estimator は「同一フレームの結果」なのか「直近の古い結果」なのかを明示的に扱えます。

---

## 5. Worker / main thread 構成

### 5.1 Worker 化の判断

MediaPipe の Pose / Hand / Face / Gesture は同期実行で UI thread をブロックするため、実運用では Worker 化を標準にします。Google の Pose / Hand / Face / Gesture 各 Web ドキュメントはいずれも、動画フレーム推論の同期 API が UI thread をブロックし、Web Worker で別 thread 実行できることを説明しています。([Google for Developers][7]) ([Google for Developers][8]) ([Google for Developers][9]) ([Google for Developers][10])

判断基準は次です。

| 条件                                           | 推奨                                            |
| ---------------------------------------------- | ----------------------------------------------- |
| main thread の long task / UI 入力遅延が見える | Worker 必須                                     |
| `detectForVideo()` 合計が 8〜10ms を超える     | Worker 推奨                                     |
| Face + Pose + Hand を同時利用                  | Worker 標準                                     |
| debug overlay / UI / audio / WebRTC と同時実行 | Worker 標準                                     |
| Safari / 古い端末で Worker 初期化に失敗        | main-thread fallback + fps 低下                 |
| Worker round-trip / transfer が重すぎる        | Pose のみ Worker、Hand/Gesture 停止または低 fps |

### 5.2 推奨構成図

```text
Main thread
  - HTMLVideoElement
  - requestVideoFrameCallback
  - createImageBitmap(video)
  - Worker enqueue latest frame
  - React / UI
  - Three.js / VRM rendering
  - WebRTC / audio UI
  - debug overlay drawing

PerceptionWorker
  - MediaPipe FilesetResolver / wasm
  - PoseLandmarker
  - FaceLandmarker
  - HandLandmarker
  - GestureRecognizer
  - ROI crop / resize via OffscreenCanvas when available
  - reliability prefeatures
  - compact snapshot serialization
```

現行 `SincroTrackerWorkerClient` は `ImageBitmap` を Worker に transfer し、未処理の request が残っている場合は新規 frame を close して `droppedFrames` を増やす設計です。これは queue を無制限に積まない「latest-wins」方針として妥当です。([GitHub][4])

### 5.3 OffscreenCanvas / ImageBitmap の扱い

`OffscreenCanvas` は DOM と Canvas API を分離し、Worker context で canvas rendering を実行できる transferable object です。MDN でも、Worker 内で重い作業を別 thread 化できると説明されています。([MDN Web Docs][13])

ただし、`createImageBitmap(video)`、ROI crop、ImageBitmap transfer は無料ではありません。Sincromisor では、次のようにコストを測定します。

```ts
type TransferTiming = {
    createImageBitmapMs: number;
    postMessageMs: number;
    workerReceiveDelayMs: number;
    workerRoundTripMs: number;
};
```

方針は次です。

| データ        | 転送方針                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------- |
| camera frame  | `ImageBitmap` を transferable として送る。queue は最大1                                         |
| ROI crop      | Worker 内 `OffscreenCanvas` が使えるなら Worker で crop。使えなければ full frame + ROI metadata |
| landmarks     | `Float32Array` または number array。画像は返さない                                              |
| debug overlay | main thread で描画。Worker は座標・スコアだけ返す                                               |
| screenshot    | 通常フレームでは保存しない。明示 capture または低頻度 sampling                                  |

---

## 6. Performance budget

### 6.1 基本 budget

カメラ 30fps は 1フレーム 33.3ms、描画 60fps は 1フレーム 16.7ms です。重要なのは、推論が Worker で 20〜30ms かかっても、main thread の render frame を塞がないことです。MediaPipe 推論を main thread で同期実行すると UI thread を直接止めるため、30fps 入力・60fps 描画・音声対話・WebRTC を同時に動かす構成では破綻しやすくなります。([Google for Developers][7])

初期 budget は次を採用します。

| 領域                            |  標準目標 | p95 上限目安 |
| ------------------------------- | --------: | -----------: |
| main thread render loop         |   8〜12ms |  16.7ms 未満 |
| VRM pose apply + `vrm.update()` |    1〜3ms |          5ms |
| Three.js render                 |    4〜8ms |         12ms |
| UI / debug overlay              |    1〜3ms |          5ms |
| Worker frame transfer           |    1〜4ms |          8ms |
| Worker total perception         |  15〜28ms |         50ms |
| end-to-end motion age           | 50〜120ms |        150ms |

既存 report03 では、実用的な追加遅延目標として、手先 50〜90ms、頭 50〜100ms、胴体・肩 80〜150ms が示されています。 Sincromisor は会話キャラクター用途なので、手指の完全同期より、頭・胴体・肩の jitter と UI 応答性を優先します。

### 6.2 端末クラス別推奨設定

| 端末クラス                      |                  Camera |             Render |      Pose |               Face |           Hand |          Gesture | 備考                                       |
| ------------------------------- | ----------------------: | -----------------: | --------: | -----------------: | -------------: | ---------------: | ------------------------------------------ |
| A: 高性能 desktop Chrome / Edge |             1280x720@30 |              60fps |     30fps |          15〜30fps |  15〜30fps ROI | 5〜10fps / event | Worker 標準。debug metrics 常時可          |
| B: 一般 laptop                  |    960x540〜1280x720@30 |         60fps 目標 | 24〜30fps |          10〜15fps |  10〜15fps ROI |          3〜5fps | single Worker。parallel worker は避ける    |
| C: tablet / mobile high-end     | 640x480〜960x540@24〜30 | 30〜60fps adaptive | 15〜24fps |    8〜12fps or off |       8〜12fps |         基本 off | 熱・電力・background throttling を強く考慮 |
| D: low-end / fallback           |          640x480@15〜24 |              30fps | 10〜15fps | Pose head fallback | 5〜8fps or off |              off | semantic idle / fallback pose 中心         |

30fps 入力、60fps 描画、30fps 推論は、高性能 desktop では現実的ですが、Pose + Hand + Face + Gesture をすべて 30fps で常時動かす設計は標準にしない方が安全です。特に Gesture は Hand の安定結果を補助入力として扱い、常時 30fps ではなく、低 fps または状態変化時に実行します。

### 6.3 debug log の追加負荷

debug は品質改善に必須ですが、PNG capture、full landmark dump、console logging、React state 更新を毎フレーム行うと、main thread と GC を圧迫します。現行 `motionDebugFrameCapture.ts` は canvas に video と overlay を描画し、PNG data URL を生成する構成です。これは明示 capture には有用ですが、リアルタイム hot path で毎フレーム実行すべきではありません。([GitHub][14])

推奨は次です。

| debug 項目        |                        通常時 |           詳細計測時 |
| ----------------- | ----------------------------: | -------------------: |
| numeric metrics   |        毎フレーム ring buffer |           毎フレーム |
| landmark snapshot |             5〜15fps sampling |                30fps |
| PNG / frame image | 手動 capture または 0.2〜1fps |           短時間のみ |
| console log       |      warn / state change のみ | bounded debug logger |
| replay log        |       compact JSONL / msgpack |      短時間 raw dump |

---

## 7. Degradation policy

負荷が高い場合は、突然 tracking を止めず、**意味のある自然な fallback pose に滑らかに退避**します。既存 report03 でも、低 confidence 時はすぐ止めるのではなく、なめらかに控えめな pose へ退避し、動きの大きさを信頼度に比例させる方針が示されています。

推奨 degradation order は次です。

| Level | 条件例                         | 処理                                                                      |
| ----: | ------------------------------ | ------------------------------------------------------------------------- |
|     0 | 正常                           | Pose / Face / Hand / Gesture を端末 budget 内で実行                       |
|     1 | Worker p95 > budget、drop 増加 | Gesture 停止、debug screenshot 停止                                       |
|     2 | Hand が重い / dropout 多い     | Hand fps を半減、片手のみ、ROI 拡大、指は semantic fallback               |
|     3 | Face が重い                    | Face fps を低下、Face matrix は保持、Pose head fallback                   |
|     4 | Pose が重い                    | camera を 960x540 / 640x480 へ下げる、Pose fps 15〜24                     |
|     5 | Worker 不安定                  | main-thread fallback + Pose only + render 30fps                           |
|     6 | tracking 継続困難              | idle / breathing / conversation pose に退避し、CameraQuality guide を出す |

判定は単一指標ではなく、次の合成で行います。

```ts
type DegradationSignal = {
    workerRoundTripP95Ms: number;
    inferenceP95Ms: number;
    droppedFrameRate: number;
    mainThreadLongTaskRate: number;
    renderFps: number;
    motionAgeMs: number;
    cameraQualityOverall: number;
};
```

復帰には hysteresis を入れます。例えば Level 3 に落とした場合、5〜10秒程度安定してから Level 2 へ戻し、さらに安定してから Level 1 / 0 へ戻します。これにより、fps と機能が短周期に揺れることを防ぎます。

---

## 8. ブラウザ・端末差分

### 8.1 Chrome / Edge

Chrome / Edge desktop を primary target にします。`requestVideoFrameCallback()` は 2024 Baseline で最新ブラウザ群では利用可能とされ、MediaPipe Tasks Web、Worker、`ImageBitmap`、OffscreenCanvas の検証もしやすい環境です。([MDN Web Docs][6]) ([MDN Web Docs][13])

### 8.2 Safari / iOS

Safari / iOS では、最新環境では `requestVideoFrameCallback()` 自体は期待できますが、mobile Safari ではメモリ、熱、background throttling、カメラ権限、WebGL context loss の影響が大きくなります。標準設定を 1280x720@30 の full pipeline に固定せず、640x480〜960x540、Pose 15〜24fps、Hand / Face optional を標準 fallback として扱うべきです。`requestVideoFrameCallback()` が使えても、MediaPipe の同期推論は Worker / fps gate / feature degradation とセットで設計します。([Google for Developers][7])

### 8.3 Firefox

Firefox も最新環境では `requestVideoFrameCallback()` の対象ですが、MediaPipe Tasks Web + Worker + OffscreenCanvas + WebGL の組み合わせは実機確認が必要です。fallback path として `raf-currentTime` clock、main-thread performance gate、Pose only mode を残します。`requestVideoFrameCallback()` は比較的新しい Baseline 2024 機能なので、古い環境では fallback が必要です。([MDN Web Docs][6])

### 8.4 WebGL / WebGPU / WebNN

現時点の標準構成は **WebGLRenderer + MediaPipe Tasks Web + Worker** です。three-vrm 側の既存レポートでも、モーション実装の安定性を優先するなら WebGLRenderer + three-vrm + VRM-1.0 normalized humanoid pose が堅実とされています。

WebGPU は将来候補ですが、MDN では 2026年5月時点でも “Limited availability” で、広く使われている一部ブラウザで動作しないため Baseline ではないとされています。([MDN Web Docs][15]) WebNN も 2026年時点で W3C Candidate Recommendation Draft の作業中仕様であり、文書自体が work in progress とされています。([W3C][16]) したがって、WebGPU / WebNN は標準置換ではなく、将来の acceleration backend 候補として capability detection の後ろに置きます。

---

## 9. debug snapshot に記録すべき metadata

最小 schema は次です。

```ts
type MotionRealtimeDebugFrame = {
    version: 1;
    sessionId: string;

    clock: {
        mode:
            | "requestVideoFrameCallback"
            | "raf-currentTime"
            | "timer-fallback";
        frameSeq: number;
        mediaTimeMs: number;
        nowMs: number;
        presentationTimeMs?: number;
        expectedDisplayTimeMs?: number;
        presentedFrames?: number;
        droppedPresentedFrames: number;
        renderFrameSeq: number;
    };

    camera: {
        requestedConstraints: MediaStreamConstraints;
        settings: MediaTrackSettings;
        videoWidth: number;
        videoHeight: number;
        trackReadyState: MediaStreamTrackState;
        trackMuted: boolean;
    };

    performance: {
        rafDeltaMs: number;
        renderMs: number;
        vrmUpdateMs: number;
        uiMs: number;
        createImageBitmapMs?: number;
        workerRoundTripMs?: number;
        workerQueueDroppedFrames: number;
        poseMs?: number;
        faceMs?: number;
        handMs?: number;
        gestureMs?: number;
        postprocessMs?: number;
    };

    perception: {
        poseTimestampMs?: number;
        faceTimestampMs?: number;
        handTimestampMs?: number;
        gestureTimestampMs?: number;
        poseAgeMs?: number;
        faceAgeMs?: number;
        handAgeMs?: number;
        gestureAgeMs?: number;
        options: {
            poseEnabled: boolean;
            faceEnabled: boolean;
            handEnabled: boolean;
            gestureEnabled: boolean;
            segmentationEnabled: boolean;
        };
    };

    cameraQuality: CameraQualityScore;

    degradation: {
        level: number;
        reasons: string[];
        activePolicy: string;
    };

    output: {
        reliabilitySummary: Record<string, number>;
        canonicalStateSummary: unknown;
        finalPoseConfidence: Record<string, number>;
        clampedBones: string[];
    };

    environment: {
        userAgent: string;
        hardwareConcurrency?: number;
        deviceMemory?: number;
        visibilityState: DocumentVisibilityState;
        rendererInfo?: {
            webglRenderer?: string;
            webglVendor?: string;
        };
    };
};
```

記録対象は、既存 roadmap の Phase 1 方針とも一致します。roadmap では、`motion-debug` で MediaPipe snapshot、retarget frame、final pose、video metadata を保存し、同じ debug log を replay mode で再入力できること、neutral jitter / elbow flip / recovery jump / angular velocity spike / reach clamp occupancy を計測することが Phase 1 の完了条件になっています。

---

## 10. 実装計画

### Phase A: FrameClock 差し替え

`trackerRuntimeFrameLoop.ts` の `requestAnimationFrame()` 起動を直接置換するのではなく、`FrameClock` interface を追加します。

```ts
interface FrameClock {
    readonly mode: FrameClockMode;
    start(
        video: HTMLVideoElement,
        onTick: (tick: VideoFrameTick) => void,
    ): void;
    stop(): void;
}
```

`requestVideoFrameCallback` 実装を primary、`raf-currentTime` を fallback とし、既存 `trackerRuntimeCadence.ts` の `targetInferenceFps` gate は維持します。現行 cadence は `nowMs - lastInferenceAtMs >= 1000 / targetInferenceFps` で推論実行可否を判定しているため、この gate を `mediaTimeMs` / `nowMs` の両方を見られる形に拡張します。([GitHub][17])

### Phase B: Worker protocol 拡張

現行 Worker message は `ImageBitmap` と `timestampMs` を受け取る設計です。([GitHub][18]) ここに `VideoFrameTick` 由来の metadata を追加します。

```ts
type DetectMessage = {
    type: "detect";
    requestId: number;
    frame: ImageBitmap;
    tick: VideoFrameTick;
    options: PerceptionPassOptions;
};
```

返却は raw MediaPipe result ではなく、`ObservationFrame` と timings に限定します。

### Phase C: CameraQualityController

`MediaStreamTrack.getSettings()`、RVFC metadata、landmark bbox、簡易 luminance / blur estimation を合成し、`CameraQualityScore` を作ります。UX へは warning を最大 1〜2個だけ出します。

### Phase D: Multi-pass Perception

最初は現行 worker の Face + Pose を維持し、次に Hand、最後に Gesture を追加します。Hand は full-frame 常時ではなく、Pose wrist / previous hand state から ROI を作る構成にします。Gesture は Hand の安定状態を前提に、低 fps / hysteresis で運用します。

### Phase E: Performance dashboard / replay

`motion-debug` では、live camera 表示、tracking overlay、VRM、metrics、degradation state を同時表示します。既存 `pages/motionDebug` には camera stream、controls、frame capture、video source、overlay renderer の足場があります。([GitHub][19]) ここに `MotionRealtimeDebugFrame` の ring buffer と export / replay を追加します。

---

## 11. 最終推奨

Sincromisor の `sincro` モードでは、標準構成を次に固定するのが最も堅実です。

```text
入力:
  getUserMedia ideal 1280x720@30
  実値は getSettings + RVFC metadata で記録

clock:
  requestVideoFrameCallback primary
  raf-currentTime fallback

推論:
  Worker primary
  queue length 1
  Pose full-frame
  Hand / Face / Gesture は optional multi-pass
  timestamp は mediaTimeMs に統一

描画:
  requestAnimationFrame
  latest stable canonical state を読む
  final VRMPose を setNormalizedPose
  vrm.update(delta) は 1 frame 1回

性能:
  desktop high-end だけ full 30fps pipeline
  標準は Pose 24〜30fps、Face/Hand 10〜15fps、Gesture 低fps
  mobile は Pose + limited Hand / Face fallback

fallback:
  Gesture 停止
  Hand fps 低下
  Face fallback
  camera 解像度低下
  Pose only
  semantic idle / comfortable pose

debug:
  numeric metrics は常時
  image capture は低頻度または明示操作
  replay 可能な metadata-rich log を保存
```

この構成により、30fps 入力・60fps 描画・音声対話・WebRTC・debug UI が同時に動く場合でも、main thread の詰まりを抑えながら、フレーム時刻の整合と端末別 fallback を明確にできます。最大の実装ポイントは、**「推論を描画 loop に従属させない」「MediaPipe の同期推論を main thread に置かない」「低品質時は止めるのではなく自然に弱める」**の3点です。

[1]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/package.json "Sincromisor/sincromisor-frontend/package.json at main · Sincromisor/Sincromisor · GitHub"
[2]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/features/gaze/trackingRuntime "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime at main · Sincromisor/Sincromisor · GitHub"
[3]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFrameLoop.ts "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFrameLoop.ts at main · Sincromisor/Sincromisor · GitHub"
[4]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerClient.ts "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerClient.ts at main · Sincromisor/Sincromisor · GitHub"
[5]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts at main · Sincromisor/Sincromisor · GitHub"
[6]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback "HTMLVideoElement: requestVideoFrameCallback() method - Web APIs | MDN"
[7]: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[8]: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google for Developers"
[9]: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js "Face landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[10]: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js "Gesture recognition guide for Web  |  Google AI Edge  |  Google for Developers"
[11]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/pages/motionDebug/motionDebugCameraStream.ts "Sincromisor/sincromisor-frontend/src/pages/motionDebug/motionDebugCameraStream.ts at main · Sincromisor/Sincromisor · GitHub"
[12]: https://developer.mozilla.org/ja/docs/Web/API/Media_Capture_and_Streams_API/Constraints "能力と制約と設定 - Web API | MDN"
[13]: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas "OffscreenCanvas - Web APIs | MDN"
[14]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/pages/motionDebug/motionDebugFrameCapture.ts "Sincromisor/sincromisor-frontend/src/pages/motionDebug/motionDebugFrameCapture.ts at main · Sincromisor/Sincromisor · GitHub"
[15]: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API "WebGPU API - Web APIs | MDN"
[16]: https://www.w3.org/TR/webnn/ "Web Neural Network API"
[17]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeCadence.ts "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeCadence.ts at main · Sincromisor/Sincromisor · GitHub"
[18]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts "Sincromisor/sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts at main · Sincromisor/Sincromisor · GitHub"
[19]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/pages/motionDebug "Sincromisor/sincromisor-frontend/src/pages/motionDebug at main · Sincromisor/Sincromisor · GitHub"
