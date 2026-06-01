# TASK-3102 Face Tracking Runtime と SincroFaceTracker 基盤

- 作成日: 2026-05-11
- ステータス: Done
- 優先度: Critical
- 親タスク: `TASK-3100`
- 依存: `TASK-3101`

## 目的

MediaPipe 顔認識の起動、停止、カメラ接続、エラー処理、モード分岐を整理し、`sincro` 用の `SincroFaceTracker` を追加する。既存 `CharacterGaze` の注視用途を壊さず、FaceLandmarker 由来の顔同期入力を `CharacterBehaviorState` へ流せる土台を作る。

## 背景

- 既存 `CharacterGaze` は `FaceDetector` の6点キーポイントを前提にしている。
- FaceLandmarker は head pose、face blendshape、細かな landmarks を返せるため `sincro` の顔同期に向いている。
- MediaPipe の video 推論は同期的に走るため、runtime 境界を整理しないまま tracker を増やすと、推論 loop と DOM 依存が散らばる。

## スコープ

- 共有 camera / video / tracker loop を所有する `TrackerRuntime` または同等の runtime 境界を定義する
- `SincroFaceTracker` または同等の新規 tracker を追加する
- FaceLandmarker の wasm/model asset path と初期化処理を定義する
- `outputFaceBlendshapes` と `outputFacialTransformationMatrixes` を有効にする
- `CharacterBehaviorState` に同期用 `faceMotion` snapshot を追加する
- `SincroCharacterGazeController` または後継 controller から `chat` / `sincro` に応じて tracker を起動できるようにする
- 既存 `CharacterGaze`、AutoMute、FaceLandmarker が同じ camera track / video element / 推論 loop をどう共有するかを明確にする
- FaceLandmarker の推論時間、推論 fps、main thread 負荷、fallback 条件を計測または Debug 出力できるようにする
- カメラ停止、設定変更、MediaPipe runtime error 時の後始末を共通化する

## 非対象

- VRM ボーン・表情への本格 retarget
- Pose Landmarker 統合
- Settings UI の詳細追加
- Worker 化の本実装

## 実装方針

1. `CharacterGaze` を直接肥大化させず、同期用 tracker を別クラスとして追加する。
2. `TrackerRuntime` は camera track の取得・差し替え・解放、video element 接続、推論 loop の開始/停止を一元管理する。
3. `chat` では既存 FaceDetector / AutoMute を優先し、`sincro` では FaceLandmarker を優先する。同時起動が必要な場合も camera track は共有し、二重 `getUserMedia` を避ける。
4. FaceLandmarker の戻り値はそのまま保存せず、アプリ内部型の `SincroFaceMotionSnapshot` へ正規化する。
5. snapshot には検出有無、confidence 相当、head pose、blendshape map、推論時間、推論 fps、lastUpdatedAtMs を含める。
6. 初期実装はメインスレッドでよいが、Worker 化しやすいよう DOM 要素や UI 更新を tracker core へ持ち込まない。
7. FaceLandmarker が一定時間重い場合は、推論 fps を下げる、sincro face を一時停止する、または chat gaze / neutral motion へ降格できる構造にする。
8. face model asset は `public/3rd_party` 配下に置き、README とライセンス情報を更新する。

## 実装対象候補

- `sincromisor-frontend/src/features/gaze/characterGaze/characterGaze.ts`
- `sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts`
- `sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceMotionSnapshot.ts`
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts`
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts`
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeEngineInitializer.ts`
- `sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts`
- `sincromisor-frontend/src/character/behavior/characterBehaviorState.ts`
- `sincromisor-frontend/public/3rd_party/README.md`
- `sincromisor-frontend/public/3rd_party/*face_landmarker*`

## 完了条件

- `sincro` モードで FaceLandmarker が起動し、顔同期 snapshot が更新される。
- `chat` モードでは既存 FaceDetector ベースの注視と AutoMute が壊れない。
- FaceLandmarker model 未配置、権限拒否、runtime error で UI 全体が停止しない。
- `CharacterBehaviorState` から同期用 face motion が読み取れる。
- FaceLandmarker の推論時間、推論 fps、fallback 状態を確認できる。
- Gaze と SincroFaceTracker が camera track / video element / loop を二重所有しない。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- カメラ ON で `faceMotion.detected` が更新される。
- 顔を左右上下へ動かした時、head pose または代替値が変化する。
- まばたき、口の開閉に対応する blendshape 値が変化する。
- Gaze OFF/ON、カメラ切替、`chat` / `sincro` 切替後も二重 loop が残らない。
- FaceLandmarker の推論が重い状態を再現し、fps 制限または fallback の挙動を確認する。

## 進捗メモ

- 2026-05-11:
    - `src/features/gaze/` 配下に `TrackerRuntime`、`SincroFaceTracker`、`SincroFaceMotionSnapshot` を追加。
    - `CharacterBehaviorState` に `faceMotion` snapshot と更新 API を追加。
    - `SincroCharacterGazeController` で `chat` は既存 `CharacterGaze`、`sincro` は `TrackerRuntime` + `SincroFaceTracker` を起動する分岐を追加。
    - `FaceLandmarker` は `outputFaceBlendshapes` / `outputFacialTransformationMatrixes` を有効化し、head pose / blendshape / 推論時間 / 推論 fps / fallback reason を snapshot 化。
    - `public/3rd_party/README.md` に `face_landmarker.task` の配置先と未配置時 fallback を追記。
    - `cd sincromisor-frontend && npm run build` 成功。
    - 未確認: 実カメラ + `face_landmarker.task` 配置状態での head pose / blink / mouth blendshape 実測。

### 2026-05-20 現状確認

- リファクタリング後の配置に合わせ、実装対象候補を `src/features/gaze/**`、`src/app/controller/**`、`src/character/behavior/**` へ更新した。
- `src/ts/**` 配下の旧候補は現行 tree に存在しないため参照しない。

### 2026-05-25 整理

- 実装、設計反映、build 確認は完了済みのため Done とする。
- 実カメラ + `face_landmarker.task` 配置状態での head pose / blink / mouth blendshape 実測は、基盤実装タスクではなく最終実機検証として `TASK-3116` に集約する。
