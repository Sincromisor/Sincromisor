# レビュー: task-260915005054-centralize-calibration-lifecycle

## 判定

APPROVED

## 理由・申し送り

- 調査HEAD `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf` では、開始前ダイアログとOBSは `SincroAppController.start()` を直接呼び、パネルだけが較正を開始する。`InitialSincroCalibrationController` の `sessionId` による古い記録の拒否、`InitialSincroCalibrationPoseBridge` のPose観測時刻による段階計測、VRM状態文言での中断も task.md の記述と一致する。
- 補完後のtask.mdは、同期例外、カメラ取得失敗、追跡初期化・実行中の非同期失敗を中断対象に定め、`SincroCharacterGazeController` からアプリへ返す結果通知をアプリ・追跡開始世代に結び付けている。現行のカメラ取得例外、`startFaceTracking()` の初期化、`onError`、映像トラック終了をこの通知へ接続でき、古い結果が新しいsessionを中断しない条件も定まった。
- 音声取得・RTCだけの失敗は追跡継続中の較正を中断しないと明記され、既存の音声と追跡の独立した開始経路と整合する。指定済みの結合確認は、開始入口、同期例外、カメラ拒否、追跡初期化失敗、古い開始結果、重複開始、旧解除と非中断条件を最小範囲で検証できる。通信契約の変更はなく、文書同期先も妥当である。

## 自律補完

- `AUTO_FIX`: 開始失敗を同期例外、カメラ取得、追跡初期化・実行に限定し、音声取得・RTCだけの失敗を除外した。既存の開始経路でカメラ追跡と音声・RTCが独立しており、較正はPose観測に依存するため。
