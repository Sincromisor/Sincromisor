ここにはサードパーティ製のものが置かれます。
ライセンスは各ファイルのものに準じます。

## blaze\_face\_short\_range.tflite

* Copyright 2021 Valentin Bazarevsky, Google
* <https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf>
* [Apache License Version 2.0](blaze_face_short_range.tflite.LICENSE)

## face\_landmarker.task (optional)

`sincro` モードの顔同期トラッキングを有効化する場合は、以下を配置してください。
未配置の場合、アプリ全体は停止せず `faceMotion.fallbackReason` と Debug Console に
FaceLandmarker 初期化失敗として表示されます。

* ソース: [https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
* 配置先: `public/3rd_party/face_landmarker.task`
* ライセンス: 配布元のモデルライセンスに従う

## pose\_landmarker\_\*.task (optional spike)

`TASK-3105` の Pose Landmarker 検証ページで利用します。
通常画面からは参照されないため、未配置でも本番ビルドや通常起動には影響しません。

* ソース: [https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
* 配置候補:
  * `public/3rd_party/pose_landmarker_lite.task`
  * `public/3rd_party/pose_landmarker_full.task`
  * `public/3rd_party/pose_landmarker_heavy.task`
* 検証ページ: `src/pose-landmarker-spike/index.html`
* ライセンス: 配布元のモデルライセンスに従う

## silero-vad (optional)

学習ベースVADを有効化する場合は、以下を配置してください。

* ソース: [https://github.com/snakers4/silero-vad/tree/master/src/silero_vad/data](https://github.com/snakers4/silero-vad/tree/master/src/silero_vad/data)
* 配置先: `public/3rd_party/silero-vad/silero_vad.onnx`
* [MIT License](silero-vad/LICENSE)

`onnxruntime-web` は npm 依存としてバンドルされます。
`DebugConsole > Audio` の「学習VAD（Silero）を有効化」がONのときに、
アプリ内Worker (`src/ts/RTC/silero-vad.worker.ts`) から上記モデルを参照します。
