# Sincromisor `sincro` モード Webリアルタイム実装 / パフォーマンス調査レポート

対象: `sincromisor-frontend` / TypeScript + Vite + MediaPipe Tasks Web + Three.js + `@pixiv/three-vrm`
対象時点: **2026年6月14日**

## 0. 結論

`sincro` モードのリアルタイム性能設計では、単に推論を高速化するより、**映像フレーム時刻を基準にした FrameClock、UIスレッドを詰まらせない Worker 分離、端末負荷に応じた機能低下方針、再現可能な診断用スナップショット** を優先すべきです。添付 `06-web-realtime-performance.md` でも、調査対象は高速化単体ではなく、推論タイミングの安定、フレーム時刻の整合、UIスレッドの詰まり回避、会話中に許容できる体感遅延に置かれています。

推奨する標準構成は次です。

```text
カメラ / HTMLVideoElement
  -> VideoFrameClock(requestVideoFrameCallback)
  -> PerceptionWorker
       - Pose: 全画面の
       - Hand: 姿勢を手がかりにした ROI, 低頻度
       - Face: 顔・頭部のROI または全画面の代替処理
       - Gesture: 手の結果から導出し、イベント時または低頻度で実行
  -> 簡潔な観測値スナップショット
  -> 信頼性 / 標準化した / 時系列 / MotionIntent
  -> 動作の変換 / IK / PoseComposer
  -> vrm.humanoid.setNormalizedPose(finalPose)
  -> vrm.update(delta)
  -> renderer.render(scene, camera)
```

ロードマップ資料の既存方針とも整合します。既存資料では `TrackerRuntime` がカメラトラック / 映像要素 / フレーム時計 / Worker 代替処理を所有し、`PerceptionOrchestrator` が Pose 全画面のと Hand / Face ROI を扱い、後段で信頼性、標準化した、時系列、MotionIntent、AvatarMotionProfile、動作の変換 / IK / クリップミキサーへ渡す構成が示されています。 また、three-vrm 側は MediaPipe の不確実性を解く場所ではなく、最終的な `VRMHumanoid` 正規化済みローカル姿勢を安全に適用する層にする、という既存 three-vrm レポートの方針を維持します。

---

## 1. 現行リポジトリ確認

現行 `sincromisor-frontend` は、`package.json` 上で `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、`vite`、`typescript` を利用しており、今回の前提技術と一致しています。([GitHub][1]) `src/features/gaze/trackingRuntime` には `sincroTracker.worker.ts`、`sincroTrackerWorkerClient.ts`、`trackerRuntimeFrameLoop.ts`、`trackerRuntimeCadence.ts`、`trackerRuntimePosePerformanceGate.ts` などがあり、すでに Worker / 代替処理 / 実行頻度 / 性能検査の足場があります。([GitHub][2])

現行の `trackerRuntimeFrameLoop.ts` は `requestAnimationFrame()` で `predict()` をスケジュールしています。つまり、現在の推論起動は基本的に描画周期基準であり、カメラの実映像フレーム基準ではありません。([GitHub][3]) これに対して、添付取り組み計画では段階 2 として `requestAnimationFrame` 基準から動画フレーム基準の時計へ移行し、`mediaTime`、`presentationTime`、`presentedFrames` と `MediaStreamTrack.getSettings()` を診断用スナップショットに載せる方針が明記されています。

一方で Worker 実装は既に有効な土台です。`SincroTrackerWorkerClient` は Worker と `createImageBitmap` の存在をサポート条件にし、`ImageBitmap` と `timestampMs` を Worker に転送し、`transferTimeMs`、`workerRoundTripMs`、`droppedFrames` などの統計を持っています。([GitHub][4]) Worker 側では FaceTracker と PoseTracker を初期化し、受け取った `ImageBitmap` に対して顔 / 姿勢検出を実行し、処理後に `message.frame.close()` して GPUリソースの蓄積を防いでいます。([GitHub][5]) ([GitHub][5])

したがって、新規に大きな別構成を作るより、既存の `trackingRuntime` を拡張して **FrameClock、CameraQuality、複数段階の認識処理、DebugSnapshot** を追加するのが妥当です。

---

## 2. FrameClock 設計案

### 2.1 `requestVideoFrameCallback()` を使う理由

`HTMLVideoElement.requestVideoFrameCallback()` は、動画フレームが画面合成処理に送られるタイミングでコールバックを実行する API です。MDN では 2024 Baseline の新規利用可能機能として扱われ、2024年10月以降の最新ブラウザ群で利用可能とされています。([MDN Web 文書][6])

`requestAnimationFrame()` は表示再取得 / 描画のための時計であり、カメラ入力が 30fps、描画が 60Hz、ディスプレイが 120Hz のような場合、実映像フレームと一致しません。MediaPipe の `detectForVideo()` に渡す時刻、Pose / Hand / Face / Gesture の同一フレーム対応、破棄判定を安定させるには、**推論起動は映像フレーム基準、描画は RAF 基準**に分離します。

```text
VideoFrameClock:
  カメラ・映像フレームの到着を検出
  mediaTimeMs をフレーム時刻として採用
  推論要求を発行

RenderClock:
  requestAnimationFrame で 60fps 目標
  最新の安定した動作状態を読む
  VRM 更新 + 描画
```

### 2.2 `mediaTime` / `presentationTime` / `presentedFrames` の使い方

`requestVideoFrameCallback()` のメタデータには、`mediaTime`、`presentationTime`、`presentedFrames`、`processingDuration` などが含まれます。`mediaTime` は `HTMLMediaElement.currentTime` 時系列表示上の秒単位時刻、`presentationTime` はブラウザがフレームを画面合成に提出した時刻、`presentedFrames` はこれまで画面合成に提出されたフレーム数で、コールバック間の欠落検出に使えます。([MDN Web 文書][6])

Sincromisor では、用途を明確に分けます。

| メタデータ                     | 用途                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `metadata.mediaTime * 1000`    | MediaPipe `detectForVideo()` に渡す統一時刻。Pose / Hand / Face / Gesture の同一映像フレーム紐付けに使う |
| `metadata.presentationTime`    | ブラウザ側の表示提出時刻。入力から出力までの遅延 / 描画整合 / デバッグ表示に使う                         |
| `metadata.expectedDisplayTime` | コールバックが垂直同期に間に合っているか、処理開始が遅れているかの判定に使う                             |
| `metadata.presentedFrames`     | `delta > 1` ならコールバック欠落 / フレーム破棄として記録                                                |
| `metadata.processingDuration`  | 復号器側遅延の参考値。カメラ入力では常に有用とは限らないため任意として記録                               |

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

重要なのは、`requestVideoFrameCallback()` のコールバック内で重い MediaPipe 推論を直接実行しないことです。MDN もこの API の用途を映像処理 / 映像解析と説明していますが、コールバック自体はメインスレッド上で呼ばれるため、重い同期推論は Worker に委譲する必要があります。([MDN Web 文書][6]) MediaPipe Pose / Hand / Face / Gesture の `detectForVideo()` / `recognizeForVideo()` は同期実行で UIスレッドをブロックするため、公式ドキュメントでも Web Worker による別スレッド実行が案内されています。([Google for Developers][7]) ([Google for Developers][8]) ([Google for Developers][9]) ([Google for Developers][10])

### 2.4 代替処理

`requestVideoFrameCallback` が使えない、あるいは対象ブラウザで挙動が不安定な場合は、次の順で代替処理します。

1. `requestVideoFrameCallback`
2. `requestAnimationFrame` + `video.currentTime` 変化検出
3. `setTimeout` / `setInterval` による低 fps デバッグ代替処理

代替処理では `mediaTimeMs = video.currentTime * 1000` とし、同一 `currentTime` のフレームを重複処理しません。ただし、このモードでは `presentedFrames` による破棄検出ができないため、`rafDeltaMs`、`currentTime` 差分、実推論 fps から近似します。

---

## 3. CameraQuality 設計

### 3.1 `getUserMedia` 制約

標準設定は、現行 `motionDebugCameraStream.ts` と既存 report02 の方向性に合わせ、デスクトップ端末では 1280x720を希望値として指定します。現行動作デバッグでも `width: { ideal: 1280 }`、`height: { ideal: 720 }`、`facingMode: "user"`、`audio: false` の制約で `getUserMedia()` を呼んでいます。([GitHub][11]) report02 でも同様に 1280x720 / 30fps / `facingMode: "user"`を推奨起点にしています。

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

`exact` や強い `min` / `max` は、満たせない場合に `getUserMedia()` / `applyConstraints()` が失敗しやすくなります。MDN でも `min`、`max`、`exact` は必須制約として扱われ、満たせない場合は Promise が除外されると説明されています。([MDN Web 文書][12]) そのため、通常起動では `ideal` 中心、ユーザーが明示的にデバイス・品質を選ぶ場合だけ `deviceId` や厳密制約を使います。

### 3.2 `getSettings()` で記録すべき値

カメラ設定は指定通りになるとは限らないため、`MediaStreamTrack.getSettings()` の実値を診断用スナップショットに保存します。添付取り組み計画でも、実解像度・実 fps・カメラの向きを診断用スナップショットに載せる方針が段階 2 の実装項目になっています。

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

`deviceId` / `groupId` はプライバシーを考慮し、デバッグ公開ではハッシュ化または省略を標準にします。

### 3.3 CameraQualityScore

MediaPipe 信頼度だけでは、撮影条件の失敗を十分に説明できません。既存 report02 でも、カメラ入力、解像度、フレーム時刻、画角は取得層の責務であり、典型不具合として動体ぶれ、低解像度、フレーム時刻ずれが挙げられています。

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

| 項目                   | 判定方法                                                       |
| ---------------------- | -------------------------------------------------------------- |
| 実解像度               | `getSettings().width/height` と `video.videoWidth/videoHeight` |
| 実 fps                 | `mediaTime` 差分、`presentedFrames` 差分、推論実行間隔         |
| 欠落フレーム           | `presentedFrames` 差分が 1 を超える                            |
| 画面端にあるリスク     | 肩 / 肘 / 手首 / 手外接矩形が画面端 5〜10% に近い              |
| 手が小さく写るリスク   | 手外接矩形が 80px 未満、または指特徴点開きが小さい             |
| 体幹が画面内に収まるか | 両肩・顔・腰上が画面内に入っているか                           |
| 露出不足               | 小さな縮小 canvas / 処理担当縮小画像の平均輝度                 |
| 動体ぶれ               | 特徴点速度、輪郭の明瞭さ低下、信頼度低下の組み合わせ           |

UX では内部指標をそのまま出さず、ユーザーが修正可能な行動に変換します。既存 report03 でも、「肩が入っていない」「手が画面端」「手が小さい」「顔だけ大きい」「露出不足」「動体ぶれ」などを、ユーザー向けガイド文に分離する方針が示されています。

---

## 4. MediaPipe 推論ループの推奨構成

### 4.1 基本方針

MediaPipe Tasks Web は、Pose / Hand / Face / Gesture を単純に全フレーム同 fps で並列実行するのではなく、**Pose を全体検出、Hand / Face / Gesture を追加の推論処理** として扱います。report02 の推奨構成でも、カメラ -> FrameClock / CameraQuality -> MediaPipe 複数段階の推論検出 -> 信頼性 -> 標準化した -> 時系列 -> 意味に基づく動作 -> AvatarRetargetProfile -> IK/FK -> Three.js / VRM という流れになっています。

推奨順序は次です。

```text
受理した映像フレームごとに実行:
  1. Pose 全画面の
  2. 姿勢と前フレームの状態から体幹・頭部・手のROIを求める
  3. Face 推論処理
       - 高性能端末: ROIまたは全画面、15-30fps
       - 代替処理: Poseの鼻・目・耳に基づく頭部推定
  4. Hand 推論処理
       - 姿勢の手首を手がかりにしたROI、端末区分に応じて10-30fps
       - 手が小さい・未検出の場合、一時的に全画面または拡大ROIを使う
  5. Gesture 推論処理
       - 低頻度またはイベントに応じた
       - 安定した手の結果とヒステリシスを使う
  6. ObservationFrame(frameSeq, mediaTimeMs)を出力
```

Hand Landmarker と Gesture Recognizer は映像モードで追跡状態を持ち、追跡が成功していれば検出器を省略し、失敗時に再検出へ戻る設計です。Hand Landmarker の `minHandPresenceConfidence` / `minTrackingConfidence`、Gesture Recognizer の手存在確率 / 追跡信頼度は、この状態機械に直接関係します。([Google for Developers][8]) ([Google for Developers][10])

### 4.2 時刻整合

すべての推論処理は同一 `VideoFrameTick.mediaTimeMs` を受け取ります。

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

Face / Hand / Gesture の fps を落とす場合でも、古い結果を使ったことが分かるように `sourceMediaTimeMs` と `ageMs = currentMediaTimeMs - sourceMediaTimeMs` を各観測値に持たせます。これにより、描画側や時系列推定処理は「同一フレームの結果」なのか「直近の古い結果」なのかを明示的に扱えます。

---

## 5. Worker / メインスレッド構成

### 5.1 Worker 化の判断

MediaPipe の Pose / Hand / Face / Gesture は同期実行で UIスレッドをブロックするため、実運用では Worker 化を標準にします。Google の Pose / Hand / Face / Gesture 各 Web ドキュメントはいずれも、動画フレーム推論の同期 API が UIスレッドをブロックし、Web Worker で別スレッド実行できることを説明しています。([Google for Developers][7]) ([Google for Developers][8]) ([Google for Developers][9]) ([Google for Developers][10])

判断基準は次です。

| 条件                                             | 推奨                                            |
| ------------------------------------------------ | ----------------------------------------------- |
| メインスレッドの長時間処理 / UI 入力遅延が見える | Worker 必須                                     |
| `detectForVideo()` 合計が 8〜10ms を超える       | Worker 推奨                                     |
| Face + Pose + Hand を同時利用                    | Worker 標準                                     |
| デバッグ重ね表示 / UI / 音声 / WebRTC と同時実行 | Worker 標準                                     |
| Safari / 古い端末で Worker 初期化に失敗          | メインスレッド代替処理 + fps 低下               |
| Worker 往復 / 転送が重すぎる                     | Pose のみ Worker、Hand/Gesture 停止または低 fps |

### 5.2 推奨構成図

```text
メインスレッド
  - HTMLVideoElement
  - requestVideoFrameCallback
  - createImageBitmap(video)
  - 最新フレームをWorkerのキューへ追加
  - React / UI
  - Three.js / VRM 描画
  - WebRTC / 音声 UI
  - デバッグ用の重ね表示を描画

PerceptionWorker
  - MediaPipe FilesetResolver / wasm
  - PoseLandmarker
  - FaceLandmarker
  - HandLandmarker
  - GestureRecognizer
  - 利用可能ならOffscreenCanvasで対象領域を切り出し・サイズ変更
  - 信頼性評価用の事前特徴量
  - 簡潔なスナップショット直列化
```

現行 `SincroTrackerWorkerClient` は `ImageBitmap` を Worker に転送し、未処理の要求が残っている場合は新規フレームを終了して `droppedFrames` を増やす設計です。これはキューを無制限に積まない「最新優先」方針として妥当です。([GitHub][4])

### 5.3 OffscreenCanvas / ImageBitmap の扱い

`OffscreenCanvas` は DOM と Canvas API を分離し、Worker コンテキストで canvas 描画を実行できる転送可能なオブジェクトです。MDN でも、Worker 内で重い作業を別スレッド化できると説明されています。([MDN Web 文書][13])

ただし、`createImageBitmap(video)`、対象領域の切り出し、ImageBitmap 転送は無料ではありません。Sincromisor では、次のようにコストを測定します。

```ts
type TransferTiming = {
    createImageBitmapMs: number;
    postMessageMs: number;
    workerReceiveDelayMs: number;
    workerRoundTripMs: number;
};
```

方針は次です。

| データ             | 転送方針                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| カメラフレーム     | `ImageBitmap` を転送可能なデータとして送る。キューは最大1                                       |
| 対象領域の切り出し | Worker 内 `OffscreenCanvas` が使えるなら Worker で切り出し。使えなければ全画面 + ROI メタデータ |
| 特徴点             | `Float32Array` または数値配列。画像は返さない                                                   |
| デバッグ重ね表示   | メインスレッドで描画。Worker は座標・スコアだけ返す                                             |
| スクリーンショット | 通常フレームでは保存しない。明示取得または低頻度間引き記録                                      |

---

## 6. 処理時間の配分

### 6.1 基本許容時間

カメラ 30fps は 1フレーム 33.3ms、描画 60fps は 1フレーム 16.7ms です。重要なのは、推論が Worker で 20〜30ms かかっても、メインスレッドの描画フレームを塞がないことです。MediaPipe 推論をメインスレッドで同期実行すると UIスレッドを直接止めるため、30fps 入力・60fps 描画・音声対話・WebRTC を同時に動かす構成では破綻しやすくなります。([Google for Developers][7])

初期許容時間は次を採用します。

| 領域                           |  標準目標 | p95 上限目安 |
| ------------------------------ | --------: | -----------: |
| メインスレッド描画ループ       |   8〜12ms |  16.7ms 未満 |
| VRM 姿勢適用 + `vrm.update()`  |    1〜3ms |          5ms |
| Three.js 描画                  |    4〜8ms |         12ms |
| UI / デバッグ重ね表示          |    1〜3ms |          5ms |
| Worker フレーム転送            |    1〜4ms |          8ms |
| Worker 合計認識処理            |  15〜28ms |         50ms |
| 入力から出力までの動作経過時間 | 50〜120ms |        150ms |

既存 report03 では、実用的な追加遅延目標として、手先 50〜90ms、頭 50〜100ms、胴体・肩 80〜150ms が示されています。 Sincromisor は会話キャラクター用途なので、手指の完全同期より、頭・胴体・肩の細かな揺れと UI 応答性を優先します。

### 6.2 端末クラス別推奨設定

| 端末クラス                              |                  カメラ |               描画 |      Pose |                Face |               Hand |             Gesture | 備考                                                 |
| --------------------------------------- | ----------------------: | -----------------: | --------: | ------------------: | -----------------: | ------------------: | ---------------------------------------------------- |
| A: 高性能デスクトップ端末 Chrome / Edge |             1280x720@30 |              60fps |     30fps |           15〜30fps |      15〜30fps ROI | 5〜10fps / イベント | Worker 標準。デバッグ評価指標常時可                  |
| B: 一般ノートパソコン                   |    960x540〜1280x720@30 |         60fps 目標 | 24〜30fps |           10〜15fps |      10〜15fps ROI |             3〜5fps | 単一の Worker。並列処理担当は避ける                  |
| C: タブレット / 携帯端末高性能          | 640x480〜960x540@24〜30 | 30〜60fps 適応的な | 15〜24fps | 8〜12fps または無効 |           8〜12fps |            基本無効 | 熱・電力・バックグラウンドでの実行頻度制限を強く考慮 |
| D: 低性能 / 代替処理                    |          640x480@15〜24 |              30fps | 10〜15fps |   Pose 頭部代替処理 | 5〜8fps または無効 |                無効 | 意味に基づく動作待機動作 / 代替処理姿勢中心          |

30fps 入力、60fps 描画、30fps 推論は、高性能デスクトップ端末では現実的ですが、Pose + Hand + Face + Gesture をすべて 30fps で常時動かす設計は標準にしない方が安全です。特に Gesture は Hand の安定結果を補助入力として扱い、常時 30fps ではなく、低 fps または状態変化時に実行します。

### 6.3 デバッグログの追加負荷

デバッグは品質改善に必須ですが、PNG 取得、全面特徴点出力、console ログ出力、React 状態更新を毎フレーム行うと、メインスレッドと GC を圧迫します。現行 `motionDebugFrameCapture.ts` は canvas に映像と重ね表示を描画し、PNG データ URL を生成する構成です。これは明示取得には有用ですが、リアルタイム高頻度の実行経路で毎フレーム実行すべきではありません。([GitHub][14])

推奨は次です。

| デバッグ項目           |                   通常時 |               詳細計測時 |
| ---------------------- | -----------------------: | -----------------------: |
| 数値指標               | 毎フレームリングバッファ |               毎フレーム |
| 特徴点スナップショット |      5〜15fps 間引き記録 |                    30fps |
| PNG / フレーム画像     | 手動取得または 0.2〜1fps |               短時間のみ |
| console ログ           |      警告 / 状態変化のみ | 上限付きのデバッグロガー |
| 再生ログ               |   簡潔な JSONL / msgpack |         短時間未加工出力 |

---

## 7. 機能を段階的に制限する方針

負荷が高い場合は、突然追跡を止めず、**意味のある自然な代替処理姿勢に滑らかに退避**します。既存 report03 でも、低信頼度時はすぐ止めるのではなく、なめらかに控えめな姿勢へ退避し、動きの大きさを信頼度に比例させる方針が示されています。

推奨機能低下順序は次です。

| Level | 条件例                          | 処理                                                              |
| ----: | ------------------------------- | ----------------------------------------------------------------- |
|     0 | 正常                            | Pose / Face / Hand / Gesture を端末許容時間内で実行               |
|     1 | Worker p95 > 許容時間、破棄増加 | Gesture 停止、デバッグスクリーンショット停止                      |
|     2 | Hand が重い / 一時欠損多い      | Hand fps を半減、片手のみ、ROI 拡大、指は意味に基づく動作代替処理 |
|     3 | Face が重い                     | Face fps を低下、Face 行列は保持、Pose 頭部代替処理               |
|     4 | Pose が重い                     | カメラを 960x540 / 640x480 へ下げる、Pose fps 15〜24              |
|     5 | Worker 不安定                   | メインスレッド代替処理 + Pose のみ + 描画 30fps                   |
|     6 | 追跡継続困難                    | 待機動作 / 呼吸 / 会話姿勢に退避し、CameraQuality 案内を出す      |

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

復帰にはヒステリシスを入れます。例えば Level 3 に落とした場合、5〜10秒程度安定してから Level 2 へ戻し、さらに安定してから Level 1 / 0 へ戻します。これにより、fps と機能が短周期に揺れることを防ぎます。

---

## 8. ブラウザ・端末差分

### 8.1 Chrome / Edge

Chrome / Edge デスクトップ端末を主な対象にします。`requestVideoFrameCallback()` は 2024 Baseline で最新ブラウザ群では利用可能とされ、MediaPipe Tasks Web、Worker、`ImageBitmap`、OffscreenCanvas の検証もしやすい環境です。([MDN Web 文書][6]) ([MDN Web 文書][13])

### 8.2 Safari / iOS

Safari / iOS では、最新環境では `requestVideoFrameCallback()` 自体は期待できますが、携帯端末 Safari ではメモリ、熱、バックグラウンドでの実行頻度制限、カメラ権限、WebGL コンテキスト消失の影響が大きくなります。標準設定を 1280x720@30 の全面処理工程に固定せず、640x480〜960x540、Pose 15〜24fps、Hand / Face 任意を標準代替処理として扱うべきです。`requestVideoFrameCallback()` が使えても、MediaPipe の同期推論は Worker / fps 検査 / 特徴量機能低下とセットで設計します。([Google for Developers][7])

### 8.3 Firefox

Firefox も最新環境では `requestVideoFrameCallback()` の対象ですが、MediaPipe Tasks Web + Worker + OffscreenCanvas + WebGL の組み合わせは実機確認が必要です。代替処理パスとして `raf-currentTime` 時計、メインスレッド性能検査、Pose のみモードを残します。`requestVideoFrameCallback()` は比較的新しい Baseline 2024 機能なので、古い環境では代替処理が必要です。([MDN Web 文書][6])

### 8.4 WebGL / WebGPU / WebNN

現時点の標準構成は **WebGLRenderer + MediaPipe Tasks Web + Worker** です。three-vrm 側の既存レポートでも、モーション実装の安定性を優先するなら WebGLRenderer + three-vrm + VRM-1.0 正規化済み人型骨格姿勢が堅実とされています。

WebGPU は将来候補ですが、MDN では 2026年5月時点でも 「利用できる環境が限られる」 で、広く使われている一部ブラウザで動作しないため Baseline ではないとされています。([MDN Web 文書][15]) WebNN も 2026年時点で W3Cの勧告候補草案の作業中仕様であり、文書自体が作業中とされています。([W3C][16]) したがって、WebGPU / WebNN は標準置換ではなく、将来の高速化バックエンド候補として対応能力検出の後ろに置きます。

---

## 9. 診断用スナップショットに記録すべきメタデータ

最小スキーマは次です。

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

記録対象は、既存取り組み計画の段階 1 方針とも一致します。取り組み計画では、`motion-debug` で MediaPipe スナップショット、動作の変換フレーム、最終姿勢、映像メタデータを保存し、同じデバッグログを再生モードで再入力できること、中立姿勢での細かな揺れ / 肘反転 / 復帰時の急変 / 角速度の急増 / 到達距離制限の発生率を計測することが段階 1 の完了条件になっています。

---

## 10. 実装計画

### 段階 A: FrameClock 差し替え

`trackerRuntimeFrameLoop.ts` の `requestAnimationFrame()` 起動を直接置換するのではなく、`FrameClock` インターフェースを追加します。

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

`requestVideoFrameCallback` 実装を主経路、`raf-currentTime` を代替処理とし、既存 `trackerRuntimeCadence.ts` の `targetInferenceFps` 検査は維持します。現行実行頻度は `nowMs - lastInferenceAtMs >= 1000 / targetInferenceFps` で推論実行可否を判定しているため、この検査を `mediaTimeMs` / `nowMs` の両方を見られる形に拡張します。([GitHub][17])

### 段階 B: Worker 通信規約拡張

現行 Worker メッセージは `ImageBitmap` と `timestampMs` を受け取る設計です。([GitHub][18]) ここに `VideoFrameTick` 由来のメタデータを追加します。

```ts
type DetectMessage = {
    type: "detect";
    requestId: number;
    frame: ImageBitmap;
    tick: VideoFrameTick;
    options: PerceptionPassOptions;
};
```

返却は未加工 MediaPipe 結果ではなく、`ObservationFrame` と処理時間に限定します。

### 段階 C: CameraQualityController

`MediaStreamTrack.getSettings()`、RVFC メタデータ、特徴点外接矩形、簡易輝度 / ぶれ推定を合成し、`CameraQualityScore` を作ります。UX へは警告を最大 1〜2個だけ出します。

### 段階 D: 複数段階の認識処理

最初は現行処理担当の Face + Pose を維持し、次に Hand、最後に Gesture を追加します。Hand は全画面の常時ではなく、Pose 手首 / 前フレームの値手状態から ROI を作る構成にします。Gesture は Hand の安定状態を前提に、低 fps / ヒステリシスで運用します。

### 段階 E: 性能一覧画面 / 再生

`motion-debug` では、実時間のカメラ表示、追跡重ね表示、VRM、評価指標、機能低下状態を同時表示します。既存 `pages/motionDebug` にはカメラストリーム、操作部品、フレーム取得、映像入力元、重ね表示描画処理の足場があります。([GitHub][19]) ここに `MotionRealtimeDebugFrame` のリングバッファと公開 / 再生を追加します。

---

## 11. 最終推奨

Sincromisor の `sincro` モードでは、標準構成を次に固定するのが最も堅実です。

```text
入力:
  getUserMedia ideal 1280x720@30
  実値は getSettings + RVFC メタデータで記録

時計:
  requestVideoFrameCallback 主経路
  raf-currentTime 代替処理

推論:
  Worker 主経路
  キュー長さ 1
  Pose 全画面の
  Hand / Face / Gesture は任意の複数段階推論
  時刻は mediaTimeMs に統一

描画:
  requestAnimationFrame
  最新安定した標準状態を読む
  最終 VRMPose を setNormalizedPose
  vrm.update(delta) は 1 フレーム 1回

性能:
  高性能デスクトップ端末だけ全面 30fps 処理工程
  標準は Pose 24〜30fps、Face/Hand 10〜15fps、Gesture 低fps
  携帯端末は Pose + 制限したHand / Face 代替処理

代替処理:
  Gesture 停止
  Hand fps 低下
  Face 代替処理
  カメラ解像度低下
  Pose のみ
  意味に基づく動作待機動作 / 無理のない自然姿勢

デバッグ:
  数値指標は常時
  画像記録は低頻度または明示操作
  再生可能な十分なメタデータを持つログを保存
```

この構成により、30fps 入力・60fps 描画・音声対話・WebRTC・デバッグ UI が同時に動く場合でも、メインスレッドの詰まりを抑えながら、フレーム時刻の整合と端末別代替処理を明確にできます。最大の実装ポイントは、**「推論を描画ループに従属させない」「MediaPipe の同期推論をメインスレッドに置かない」「低品質時は止めるのではなく自然に弱める」**の3点です。

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
