# Frontend Character Tracking

## Summary

- `CharacterGaze` は `chat` 向けの注視入力と AutoMute を担当する。
- `SincroFaceTracker` / `SincroPoseTracker` は `sincro` 向けの同期入力を担当し、MediaPipe 生結果を正規化 snapshot へ変換する。
- Tracker runtime は camera track、video element、推論 loop、Worker fallback を所有し、UI 更新や VRM 適用は持たない。

## Scope

- 対象:
    - FaceDetector / FaceLandmarker / PoseLandmarker の責務境界
    - tracker runtime
    - face / pose motion snapshot
    - Worker / main-thread fallback
- 非対象:
    - VRM controller の最終適用
    - Audio / RTC 接続

## Responsibilities

- `CharacterGaze`
    - FaceDetector による顔位置検出。
    - `chat` mode の注視入力。
    - arrive / leave event と AutoMute 連動。
- `TrackerRuntime`
    - camera track の取得・差し替え・解放。
    - video frame の推論 loop。
    - Worker 経路と main-thread fallback。
- `SincroFaceTracker`
    - FaceLandmarker から head pose、blendshape、confidence を抽出する。
    - `SincroFaceMotionSnapshot` を出力する。
- `SincroPoseTracker`
    - optional PoseLandmarker から肩、胴体、腕 target を抽出する。
    - 腕 target は通常 retarget 用の `tracked` と IK 用の `quality` / `usableForIk` / `ikWeight` を分けて出力する。
    - performance gate により face-only fallback できる。
- Retargeters
    - neutral calibration、clamp、deadband、smoothing、confidence gate を扱う。

## Data / State

- `SincroFaceMotionSnapshot`
    - detected
    - confidence
    - headPose
    - blendshapes
    - inferenceTimeMs
    - inferenceFps
    - fallbackReason
- `SincroPoseMotionSnapshot`
    - trackingEnabled
    - detected
    - shoulder / torso / arm target
    - consecutiveFailures
    - degradedToFaceOnly
    - fallbackReason
- `SincroPoseTargetPointSnapshot`
    - `tracked`: 通常 target として十分な confidence と有限座標を持つ状態。
    - `quality`: `strong` / `weak` / `lost`。`weak` は座標を IK に使えるが、強度を落とすべき状態。
    - `usableForIk`: IK solver が target として使える状態。wrist / elbow は低 confidence でも有限座標かつ画面近傍なら weak target になり得る。
    - `ikWeight`: weak target を使う時に IK 強度へ掛ける 0.0-1.0 の重み。

## Failure Modes

- MediaPipe model / wasm 配置漏れ:
    - tracking を無効化し、UI / Debug Console に理由を表示する。
- Worker 初期化失敗:
    - main-thread tracker へ fallback する。
- 推論遅延または連続検出失敗:
    - pose のみ face-only に降格できる。
    - `pose_inference_too_slow` は起動直後の MediaPipe warm-up サンプルを除外し、target pose inference fps から算出した推論予算で判定する。
- Firefox GPU delegate 相性:
    - CPU delegate を使う。

## Change Checklist

- tracker を変更したら camera track の二重取得と loop の二重起動がないか確認する。
- MediaPipe の category 名や matrix を controller へ漏らさない。
- Debug Console へ raw / normalized / retarget / applied のどこを表示するか決める。
- Gaze camera device 切替時に preview / AutoMute / tracker が正しく再初期化されるか確認する。

## References

- `documents/design/frontend/character/overview.md`
- `documents/design/frontend/character/motion.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
