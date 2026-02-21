ここにはサードパーティ製のものが置かれます。
ライセンスは各ファイルのものに準じます。

## blaze\_face\_short\_range.tflite

* Copyright 2021 Valentin Bazarevsky, Google
* <https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf>
* [Apache License Version 2.0](blaze_face_short_range.tflite.LICENSE)

## silero-vad (optional)

学習ベースVADを有効化する場合は、以下を配置してください。

* ソース: [https://github.com/snakers4/silero-vad/tree/master/src/silero_vad/data](https://github.com/snakers4/silero-vad/tree/master/src/silero_vad/data)
* 配置先: `public/3rd_party/silero-vad/silero_vad.onnx`
* [MIT License](silero-vad/LICENSE)

`onnxruntime-web` は npm 依存としてバンドルされます。
`DebugConsole > Audio` の「学習VAD（Silero）を有効化」がONのときに、
アプリ内Worker (`src/ts/RTC/silero-vad.worker.ts`) から上記モデルを参照します。
