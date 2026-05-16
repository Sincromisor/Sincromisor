# TASK-260517020748 Sincro Pose 強制継続設定の追加

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High

## 目的

GPU 性能が低い開発端末で pose inference が 10fps を下回る場合でも、`pose_inference_too_slow` による face-only fallback を避け、PoseLandmarker と retarget の状態をデバッグし続けられるようにする。

## 背景

`TrackerRuntime` は pose 推論が遅い状態を検出すると `pose_inference_too_slow` で face-only に降格する。通常利用では妥当な安全装置だが、低性能端末での姿勢同期デバッグでは snapshot が途中で止まり、Debug Console で原因を追いにくくなる。

## 実装内容

- 設定 snapshot に `forceSincroPoseTracking` を追加した。
- 起動前 dialog と開始後 settings panel の表示設定に「姿勢を強制継続」を追加した。
- `forceSincroPoseTracking` が有効な時は `pose_inference_too_slow` の性能 gate だけを無視するようにした。
- PoseLandmarker 初期化失敗や連続検出失敗の fallback は維持した。
- 設定変更時は sincro tracking を再起動し、強制継続の ON/OFF が即時反映されるようにした。

## 確認項目

```sh
cd sincromisor-frontend
npm run build
```

## 未実施

- 低性能 GPU 端末での実カメラ長時間確認は未実施。
