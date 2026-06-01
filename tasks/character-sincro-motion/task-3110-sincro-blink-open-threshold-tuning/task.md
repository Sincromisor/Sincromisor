# TASK-3110 sincro blink open threshold tuning

## 背景

`sincro` モードの blink 補正後も、MediaPipe の blink score が低めに残ることで、VRM のまぶたが中途半端に開いた状態になりやすい。

## 対応内容

- 完全開眼として扱う `blinkCalibration.openThreshold` を `0.12` から `0.22` へ調整した。
- MediaPipe の blink score は高いほど閉眼に近いため、開眼扱いの範囲を広げることで、より開いた表情へ戻りやすくした。

## 確認

- `cd sincromisor-frontend && npm run build`
