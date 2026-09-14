# レビュー: task-260915005055-share-live-motion-computation

## 判定

APPROVED

## 理由・申し送り

- 調査時のHEAD `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf` で、`MotionDebugRecordingController.recordPoseFrame()` は録画前後を問わず canonical、temporal、intent、後処理を進め、`stop()` と `MotionDebugApp.stopRecording()` がその状態を初期化している。録画状態からライブ計算を分離する必要と変更箇所は現在の実装に一致する。
- ライブ追跡接続が計算状態を所有し、録画制御は同一Poseフレーム の計算済み値を保存する方針は、重複して推定器を進める失敗を避ける最小の分割である。録画開始・停止、入力ソース停止・切替の寿命と、`mediaTimeMs`、重複排除、保存項目 の維持も受け入れ条件で検証できる。
- 本番とライブの比較では共有する canonical / temporal / intent に範囲を限定し、表示・保存値を除外している。保存契約と動画固定入力による開始・停止・読み戻しの確認も示されており、過剰な環境試験を要求していない。

## 自律補完

- AUTO_FIX: 録画停止後の状態維持は、同じ入力ソースで停止前後に連続 Pose を渡して 安定した状態の継続時間 と時刻警告を確認する既存の制御処理テストの拡張で確認する。保存フレーム数の増加は録画中だけを対象にする。
