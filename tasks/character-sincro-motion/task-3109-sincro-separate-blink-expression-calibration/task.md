# TASK-3109 sincro separate blink expression calibration

## 背景

`sincro` モードのまばたきが両目同時に畳み込まれており、VRM 1.0 の片目 blink expression を活用できていない。また、MediaPipe FaceLandmarker の blink score は開眼時・閉眼時ともに 0/1 へ届きにくく、VRM expression の見た目が半端になりやすい。

## 対応内容

- VRM 1.0 の `blinkLeft` / `blinkRight` preset があるモデルでは左右別々に expression を設定し、未対応モデルのみ `blink` へフォールバックする。
- MediaPipe の `eyeBlinkLeft` / `eyeBlinkRight` をしきい値と easing で補正し、開眼を 0、閉眼を 1 へ到達しやすくした。
- 将来 Web UI から調整しやすいよう、blink 補正値を `SincroFaceRetargetConfig.blinkCalibration` に分離した。
- lightweight verification case に左右 blink と補正後の閉眼判定を追加した。

## 確認

- `cd sincromisor-frontend && npm run build`
