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

- `src/features/gaze/characterGaze`
    - `chat` mode の顔位置検出、注視 target、AutoMute 連動を置く。
- `src/features/gaze/faceTracking`
    - FaceLandmarker 結果から face motion snapshot を作る tracker を置く。
- `src/features/gaze/poseTracking`
    - PoseLandmarker 結果から pose motion snapshot / pose target を作る tracker と spike page runtime を置く。
- `src/features/gaze/trackingRuntime`
    - MediaPipe fileset、worker client、camera frame loop、fallback stats、performance gate を置く。
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
    - PoseLandmarker の `worldLandmarks` は tracker 内で `SincroPoseTargetPointSnapshot.world` へ正規化し、MediaPipe 生座標を controller / VRM 層へ直接渡さない。
    - 3D target は肩基準（腕）または腰基準（下半身）の local target と、VRM rig scale へ変換する前の normalized target に分けて保持する。
    - performance gate により face-only fallback できる。
- Retargeters
    - neutral calibration、clamp、deadband、smoothing、confidence gate を扱う。
    - MediaPipe target の欠損や confidence 低下は retargeter の gate で扱い、人体的 joint constraint と head / chest no-go zone は `SincroArmIkSolver` の責務とする。
    - solver-side constraint は誤 target を完全に修正するものではなく、取り得ない姿勢や自己貫通を抑える最終 safety として runtime snapshot へ理由を返す。
- `pose-landmarker-spike`
    - MediaPipe PoseLandmarker の model / delegate / inference cost / landmark visibility を単体で確認する experimental page。
    - VRM retarget や IK 適用後の姿勢比較は扱わない。
- `motion-debug`
    - `TrackerRuntime` が出力する `SincroPoseMotionSnapshot` を VRM retarget へ流し、カメラ映像上の Sincro pose target と VRM の動きを比較する developer page。
    - Playwright 用 selector と `window.__SINCRO_MOTION_DEBUG__` は、手動調整の再現と screenshot / snapshot 取得のための内部 debug API とする。
    - `ignorePerformanceFallback` を有効にして、低性能端末での IK 調整時も pose snapshot を観測し続ける。

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
    - lowerBodyTargets（hip / knee / ankle の観測確認用 target）
    - consecutiveFailures
    - degradedToFaceOnly
    - fallbackReason
- `SincroPoseTargetPointSnapshot`
    - `tracked`: 通常 target として十分な confidence と有限座標を持つ状態。
    - `quality`: `strong` / `weak` / `lost`。`weak` は座標を IK に使えるが、強度を落とすべき状態。
    - `usableForIk`: IK solver が target として使える状態。wrist / elbow は低 confidence でも有限座標かつ画面近傍なら weak target になり得る。
    - `ikWeight`: weak target を使う時に IK 強度へ掛ける 0.0-1.0 の重み。
    - `world`: MediaPipe world coordinates 由来の 3D target。`hasWorldCoordinates` / `worldQuality` / `worldIkWeight` / `worldStaleReason` を 2D target とは別に持つ。
    - `world.normalizedX/Y/Z`: shoulder width または hip width 由来の人物スケールで割った local 3D target。VRM bone 長や左右反転の適用は retargeter / solver 側の責務とする。
    - `world.worldUsableForIk`: `world_3d_ik` solver の gate。shoulder / elbow / wrist のいずれかが false の腕は、retargeter 側で部位 fallback し、feature retarget へ戻す。
    - `world.worldIkWeight`: weak target を許容する腕末端ほど低 confidence でも 0 より大きくなり得る。solver は最小 weight を腕全体の IK blend に使う。
- motion evaluation log frame
    - `sincro.motion-debug-log.v1` の保存単位は NDJSON の frame record であり、tracker が出力する正規化 pose snapshot は `frame.poseSnapshot` に保存する。
    - MediaPipe raw result は必要な場合も `frame.mediapipe` に分け、`frame.poseSnapshot` には `SincroPoseMotionSnapshot` 相当の normalized data を置く。
    - camera 実設定を manifest に残す場合、raw `deviceId` / `groupId` は保存しない。後続 recorder は hash 済みの `deviceIdHash` / `groupIdHash` だけを書き込む。
- `SincroPoseRetargetedArm.constraint`
    - `reasons`: solver-side safety の発火理由。入力欠損とは分けて、joint limit / pole stabilization / collision avoidance を表示する。
    - `weightScale`: constraint / collision による IK weight 減衰率。最終 IK weight は target confidence 由来 weight とこの値を掛けたものになる。
    - `targetPushDistance`: head sphere / chest ellipsoid から hand target を押し戻した距離。forearm segment の no-go zone 検出だけでは 0 のままになり得る。

## Failure Modes

- MediaPipe model / wasm 配置漏れ:
    - tracking を無効化し、UI / Debug Console に理由を表示する。
- Worker 初期化失敗:
    - main-thread tracker へ fallback する。
- 推論遅延または連続検出失敗:
    - pose のみ face-only に降格できる。
    - `pose_inference_too_slow` は起動直後の MediaPipe warm-up サンプルを除外し、target pose inference fps から算出した推論予算で判定する。
    - `forceSincroPoseTracking` が有効な場合は、低性能端末でのデバッグを優先して `pose_inference_too_slow` による降格だけを無効化する。
- Firefox GPU delegate 相性:
    - CPU delegate を使う。

## Change Checklist

- tracker を変更したら camera track の二重取得と loop の二重起動がないか確認する。
- MediaPipe の category 名や matrix を controller へ漏らさない。
- Debug Console へ raw / normalized / retarget / applied のどこを表示するか決める。
- Gaze camera device 切替時に preview / AutoMute / tracker が正しく再初期化されるか確認する。
- IK 調整を行う場合は `motion-debug` で camera overlay、VRM、`poseRetargetRuntime` を同時に確認する。

## References

- `documents/design/frontend/character/overview.md`
- `documents/design/frontend/character/motion.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
