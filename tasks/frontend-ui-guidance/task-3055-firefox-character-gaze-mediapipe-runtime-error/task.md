# TASK-3055 Firefox CharacterGaze MediaPipe Runtime Error

## 背景

Firefox環境でCharacterGazeのMediaPipe FaceDetector実行中に、`RuntimeError: index out of bounds` が発生する。

## 対応内容

- FirefoxではFaceDetectorのdelegateをCPUへ切り替え、GPU delegate由来のwasm/WebGL相性問題を避ける。
- `videoWidth` / `videoHeight` が安定する前に `detectForVideo()` へ渡さない。
- FaceDetector実行時例外を捕捉し、検出ループ停止、DebugConsole表示、エラー通知へ反映する。

## 確認項目

- `cd sincromisor-frontend && npm run build`
- FirefoxでGazeをONにして、顔検出ループが継続すること
