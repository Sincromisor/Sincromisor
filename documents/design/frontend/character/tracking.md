# フロントエンドのキャラクター追跡

## 要約

- `CharacterGaze` は `chat` 向けの注視入力と AutoMute を担当する。
- `SincroFaceTracker` / `SincroPoseTracker` は `sincro` 向けの同期入力を担当し、MediaPipe 生結果を正規化スナップショットへ変換する。
- `SincroHandTracker` は Pose 手首由来 ROI で HandLandmarker を実行し、手のひら / 指の低次元スナップショットだけを出力する。
- Tracker 実行時はカメラトラック、映像要素、推論ループ、Worker 代替処理を所有し、UI 更新や VRM 適用は持たない。
- Tracker 実行時は処理時間の予算報告と機能低下状態を診断 Console / motion-debug に出し、Worker 往復、Worker 内推論、メインスレッド代替処理を切り分ける。
- Tracker 実行時は順序を固定した機能低下方針 v1 により、負荷上昇時の fps 低下、ROI 一時停止、顔のみ / 自然な待機姿勢退避を固定順序で進める。既存予算機能低下状態は互換のため維持し、詳細段階は `SincroTrackerWorkerStats.degradationPolicy` に閉じる。
- 段階 8 の Hand / Face ROI は Pose 起点の全画面の正規化座標契約として `roiTracking` に置き、MediaPipe 実行や ReliabilityMap 変換とは分ける。
- Hand / Face ROI は低頻度の任意合格として扱い、Pose 古くなった、ROI 許容時間超過、メインスレッド代替処理を統計と motion-debug 指標で観測できる。

## 対象範囲

- 対象:
    - FaceDetector / FaceLandmarker / PoseLandmarker の責務境界
    - 追跡処理実行時
    - 顔 / 姿勢 / 手動作スナップショット
    - Hand / Face ROI 座標契約
    - Worker / メインスレッド代替処理
- 非対象:
    - VRM 制御処理の最終適用
    - 音声 / RTC 接続

## 責務

- `src/features/gaze/characterGaze`
    - `chat` モードの顔位置検出、注視目標、AutoMute 連動を置く。
- `src/features/gaze/faceTracking`
    - FaceLandmarker 結果から顔動作スナップショットを作る追跡処理を置く。
- `src/features/gaze/poseTracking`
    - PoseLandmarker 結果から姿勢動作スナップショット / 姿勢目標を作る追跡処理と試作検証ページ実行時を置く。
- `src/features/gaze/handTracking`
    - HandLandmarker 結果から手動作スナップショットを作る追跡処理を置く。
    - Hand スナップショットは `SincroHandMotionSnapshot`、左右 `SincroHandSideSnapshot`、`SincroHandFeatureSnapshot` の通常のオブジェクトに固定する。
    - 保存対象は `fullFrameWrist`、手のひらの法線・方向、指の曲げ / 指の開き、親指の対向動作、開き具合、信頼度、左右判定要約、ROI 観測値、警告だけに限定する。MediaPipe ランドマークオブジェクト、切り抜きオブジェクト、未加工のランドマークは保存しない。
    - `openness` は索引 / 中指 / 薬指 / 小指の平均曲げから決め、`<= 0.35` を `open`、`0.35..0.72` を `half`、`>= 0.72` を `closed`、ランドマーク欠損または信頼度 `< 0.2` を `unknown` とする。
    - `palmNormal` / `palmDirection` は正規化済み 3 要素タプル、スカラー特徴量 / 信頼度 / 左右判定スコアは `0..1` に制限する。
- `src/character/canonical`
    - 追跡処理観測から独立した後段共有契約として `CanonicalUpperBodyState` を置く。
    - 追跡処理は MediaPipe 生結果を直接標準化した状態と同一視せず、後続推定処理が身体のローカル座標系の意味量へ変換する。
- `src/character/calibration`
    - 初期較正は追跡処理実行時の外側で `ReliabilityMap`、任意 `CameraQualityScore`、任意 `CanonicalUpperBodyState`、`validDurationMs` を読み、`InitialSincroCalibrationSession` を更新する純粋な境界とする。
    - 追跡処理実行時 / Worker / MediaPipe 正規化スナップショットは段階遷移、カメラ権限再試行、保存、UI 段階式の案内画面を所有しない。
- `src/character/reliability`
    - 追跡処理 / カメラ / 時系列由来の観測品質を後段へ渡す `ReliabilityMap` v1 契約を置く。
    - MediaPipe 信頼度は入力材料に留め、IK / フィルター / 代替処理が読む制御用重みは関節 / 部位 / ジェスチャー単位の `finalWeight` とコンポーネント `score` として保存する。
- `src/character/temporal`
    - 追跡処理が直接出す観測スナップショットではなく、`CanonicalUpperBodyState` と `ReliabilityMap` の後段で共有する `TemporalUpperBodyState` v1 契約を置く。
    - 一時欠損、予測、復帰中などの時系列状態を保存するが、MediaPipe 未加工の結果、Three.js オブジェクト、VRM ボーン姿勢、IK クォータニオンは持たない。
- `src/features/gaze/trackingRuntime`
    - MediaPipe ファイル群、処理担当クライアント、映像フレーム時計、代替処理統計、処理時間の予算報告、順序を固定した機能低下方針、性能検査を置く。
    - `trackerRuntime.ts` は `TrackerRuntime` の公開共通窓口と生存期間状態接続を担当し、コンストラクタ / 開始 / 停止 / 破棄の公開挙動を保持する。
    - `trackerRuntimePredictionPlan.ts` は Face / Pose / Hand / Face ROI の実行頻度判定を純粋な補助処理としてまとめる。
    - `trackerRuntimeMainThreadPipeline.ts` はメインスレッド推論順序、スナップショットコールバック配信、ROI 統計への接続を担当する。
    - `trackerRuntimeWorkerPipeline.ts` は Worker detect、ImageBitmap 転送、Worker 失敗時のメインスレッド代替処理起点を担当する。
    - `trackerRuntimeDegradationApplication.ts` は順序を固定した機能低下方針判断を実行時状態と実効実行頻度へ反映する。
    - `trackerRuntimeStats.ts` はメインスレッド統計と処理時間の予算 / 機能低下方針 / ROI 統計の合成を担当する。
    - `trackerRuntimeRoiSnapshot.ts` は Face ROI メタデータ複製、一時停止警告、Pose 古くなった時の ROI 省略済み理由を担当する。
- `src/features/gaze/trackingRuntime/roiTracking`
    - Pose 手首 / 肩由来の Hand / Face ROI 契約と切り抜き内の座標系の / 全画面座標変換を置く。
    - ROI は全画面の正規化画像座標の `centerX`、`centerY`、`width`、`height`、`clamped` だけを矩形に持つ。
    - `SincroRoiObservation` は `side`、`source`、`rect`、`confidence`、任意 `referencePoint`、`warnings` を持つ JSON 保存可能な通常のオブジェクトとする。
    - `referencePoint` と変換対象点は `readonly [number, number]` のタプルに固定し、`{ x, y }` オブジェクト、画素座標、MediaPipe ランドマークオブジェクト、ImageBitmap / canvas / Three.js オブジェクトは契約に入れない。
    - v1 は軸に平行な正方形 / 長方形のみを扱い、回転した切り抜きや `rotationRad` は保存しない。手首ロール、手のひら基底、Hand 左右判定は Hand 結果後段の特徴量として扱う。
    - ROI 警告は `SincroRoiWarningCode` として ReliabilityMap の警告列挙値とは別型にする。後続信頼性タスクは ROI 警告を理由 / 警告へ明示変換する。
- `CharacterGaze`
    - FaceDetector による顔位置検出。
    - `chat` モードの注視入力。
    - 入場・退場イベントと AutoMute 連動。
- `TrackerRuntime`
    - カメラトラックの取得・差し替え・解放。
    - 映像フレームメタデータ基準の推論ループ。
    - `requestVideoFrameCallback()` 対応環境では `mediaTime` / `presentationTime` / `expectedDisplayTime` / `presentedFrames` を `TrackerVideoFrameTiming` としてコールバック第 2 引数へ渡す。
    - `requestVideoFrameCallback()` 非対応環境では `requestAnimationFrame + video.currentTime`、RAF も使えないテスト / 非表示実行時境界では 5fps タイマー代替処理を使う。代替処理の rVFC 固有フィールドは欠損のままにする。
    - 本番 `sincro` の観測専用動作処理工程へは Face / Pose コールバックの `TrackerVideoFrameTiming.mediaTimeMs`
      を渡す。停止など時刻情報が無いコールバックでは制御処理 / 受け取り側側がコールバック受信時刻を明示的に渡し、
      推定処理内部の現在時刻参照には戻さない。
    - 本番 `sincro` の Pose コールバックは `SincroCameraQualityRuntime` で `CameraQualityScore` を生成し、
      同一フレームの観測専用 `ReliabilityMap` へ渡す。Face / Hand コールバックはスコアを生成せず、
      由来 `none` 相当の停止スナップショットでは最新スコアと上限付きの履歴を破棄して
      `camera_quality_missing` 代替処理に戻す。
    - Worker 経路とメインスレッド代替処理。
    - Worker が使える環境では Worker 経路を標準にし、Worker 利用不可 / 初期化失敗 / Worker detect 失敗ではメインスレッド代替処理へ切り替える。
    - メインスレッド代替処理では実効目標を顔 `<= 8fps`、姿勢 `<= 4fps`、Hand ROI `<= 2fps`、ジェスチャー `<= 2fps`、Face ROI `<= 3fps` に値の制限し、`SincroTrackerWorkerStats.budget.degradation.state = "main-thread-low-fps"` として保存する。
    - 順序を固定した機能低下方針 v1 は詳細段階を `"full" -> "gesture-reduced-fps" -> "optional-pass-reduced-fps" -> "roi-hand-paused" -> "pose-reduced-fps" -> "face-only" -> "comfortable-idle"` の順に 1 段ずつ進める。`budgetStatus === "over_budget"` または ROI 許容時間超過がプロファイルの `consecutiveOverBudgetFrames` に達したフレームを許容時間超過フレームとし、段階進行後は許容時間超過 / 回復カウンターを再初期化する。
    - Recovery は逆順に 1 段ずつ進め、`budgetStatus === "ok"` かつ ROI 許容時間超過カウンター `0` のフレームがプロファイルの `recoveryFrames` 続いた場合だけ戻る。`face-only` から `pose-reduced-fps` へ戻るには、Pose が検出済みで、Pose 推論時間がプロファイル由来姿勢予算以下であることも必要とする。
    - `gesture-reduced-fps` は本番ジェスチャー任意合格の `gestureFps` を `max(1, floor(profile.cadence.gestureFps / 2))` に下げる。`optional-pass-reduced-fps` は Hand / Face ROI 実行頻度を半減し、`pose-reduced-fps` は Pose 実行頻度を `max(2, floor(profile.cadence.poseFps / 2))` に下げる。Face 全画面実行頻度は維持する。
    - `roi-hand-paused` は方針由来の `hand-paused` として ROI 予算制御処理の実効一時停止状態に合成する。`hand_roi_paused` 理由コードは統計に出すが、方針一時停止だけで ROI 制御処理の `fallbackCount` / `skippedFrames` は増やさない。
    - `face-only` は既存 `degradePoseToFaceOnly()` 経路を使い、Pose / Hand / ジェスチャーを止めて全画面 Face 追跡を継続する。`comfortable-idle` はカメラ / Face 追跡を止めず、Pose / Hand / ジェスチャー / Face ROI を止めて Pose 代替処理、Hand 未検出スナップショット、ジェスチャー未検出スナップショットを出す。どちらの段階でも `latestPoseSnapshot` は解除し、ROI / ジェスチャー任意合格が古い Pose スナップショットを無期限に新鮮扱いしないようにする。自然な姿勢姿勢の実際の混合は追跡処理実行時ではなく時系列 / MotionSolver / VrmPoseComposer 側の責務に残す。
    - `ignorePerformanceFallback` は `face-only` と `comfortable-idle` への自動遷移だけを抑制する。`gesture-reduced-fps`、`optional-pass-reduced-fps`、`roi-hand-paused`、`pose-reduced-fps` の実行頻度低下と `degradationPolicy` 統計は抑制しない。
    - Hand 追跡は `poseOptions.enabled === true` かつ `poseOptions.hand?.enabled === true` の場合だけ有効にする。`onHandMotion` コールバックの有無だけでは起動しない。
    - Hand 実行頻度は既定 `4fps`、指定範囲 `1..8fps` とする。ジェスチャー実行頻度は性能プロファイルの `gestureFps` を既定とし、指定範囲 `1..8fps` に制限する。ジェスチャー任意合格は同一フレームで Hand が実行された場合だけ走り、Hand 追跡処理の左右割り当てを正本にして元のラベルを左右スナップショットへ正規化する。`poseOptions.faceRoi?.enabled === true` の場合だけ Face ROI を有効にし、Face ROI 実行頻度は既定 `6fps`、指定範囲 `1..12fps` とする。どちらも `SincroPoseMotionSnapshot.lastUpdatedAtMs` が `mediaTimeMs - lastUpdatedAtMs > 250` の場合は `pose_stale_for_roi` として省略し、フレーム件数だけで新鮮判定しない。全画面 Face 実行頻度は従来どおり `DEFAULT_TARGET_INFERENCE_FPS` を正本にする。
    - 本番 `sincro` の `startSincroFaceTracking()` は `enableSincroPoseTracking()` が true のときだけ `poseOptions.hand.enabled`、`poseOptions.gesture.enabled`、`poseOptions.faceRoi.enabled` を true で渡し、`onHandMotion` / `onGestureMotion` を観測専用の処理工程 / 診断 Console 要約へ接続する。Pose 追跡が無効の場合は Hand / ジェスチャー / Face ROI も起動しない。
    - 本番診断 Console は Hand 利用可否、由来、ROI 警告、開き具合、信頼度と、ジェスチャー利用可否、左右最上位ラベル、信頼度、由来、警告、inferenceFps の低頻度要約だけを表示する。MediaPipe 未加工のランドマーク、切り抜きオブジェクト、Hand 手首座標、ジェスチャー未加工のカテゴリ一覧、左右判定の未加工オブジェクトは常時スナップショットに入れない。
    - ROI 一時停止状態は `"active" -> "hand-paused" -> "face-paused" -> "all-paused"` の順に進む。`hand-paused` は Hand ROI だけを止め、`face-paused` は Hand / Face ROI を止めるが全画面 Face は継続する。`all-paused` でもカメラ / 全画面 Face は止めず、既存 Pose 顔のみ代替処理へ委譲する。
    - ROI 許容時間超過は `handInferenceTimeMs + faceRoiInferenceTimeMs > 1000 / max(1, targetPoseInferenceFps) * 0.55` で判定する。5 ROI 実行フレーム連続で一時停止状態を 1 段進め、予算内 30 ROI 実行フレーム連続で 1 段戻す。
    - Worker 統計は任意 `effectiveHandFps`、`effectiveGestureFps`、`effectiveFaceRoiFps`、`roi` を持つ。`roi` は一時停止状態、fallbackCount、skippedFrames、consecutiveOverBudgetFrames、ROI 理由コードを保持し、既存 `effectiveFaceFps` / `effectivePoseFps` の意味は変えない。
    - `SincroTrackerWorkerStats.budget` は `sincro.tracker-performance-budget.v1` の報告で、`target`、`observed`、`budgetStatus`、`degradation`、`reasonCodes` を持つ。`observed.clockSource` は `TrackerVideoFrameTiming.source` を使い、欠損値は `undefined` のままにする。
    - 追跡処理継続時間は `performance.now()` の単一時計で測る。Worker の `workerTimeMs` は `detect()` 項目（初回 `initialize()` より前）から結果組み立て直前までを含み、転送 / 往復は含めない。メインスレッドの `mainThreadDetectTimeMs` はフレームコールバック内の detect 開始から任意合格と統計合成直前までを含む。`gestureInferenceTimeMs` はジェスチャー合格実行時だけ保存し、未検出結果でも実測値を保持する。
    - `SincroTrackerWorkerStats.degradationPolicy` は任意 `sincro.tracker-degradation-policy.v1` スナップショットで、`stage`、`previousStage`、`reasonCodes`、`sinceMediaTimeMs`、`effectiveCadence`、`recovering` を持つ。既存 `TrackerRuntimeDegradationState` は `"full"`、`"main-thread-low-fps"`、`"pose-reduced-fps"`、`"face-only"`、`"fallback"` のまま維持し、方針詳細段階へ改名しない。
    - `budgetStatus` は Worker 往復と Pose 推論コストを対象に、目標フレーム / 姿勢予算の `0.9x` 超を `warn`、`1.25x` 超を `over_budget` とする。
    - ROI 理由コードは `hand_roi_skipped`、`face_roi_skipped`、`roi_fallback_full_frame`、`roi_inference_over_budget`、`pose_stale_for_roi`、`hand_roi_paused`、`face_roi_paused` を使う。予算報告の `target` / `observed` 構造は変えず、詳細は `SincroTrackerWorkerStats.roi` に閉じる。
- `SincroFaceTracker`
    - FaceLandmarker から頭部姿勢、ブレンドシェイプ、信頼度を抽出する。
    - `SincroFaceMotionSnapshot` を出力する。
    - `detect()` は従来どおり全画面 FaceLandmarker 推論を行う。
    - `detectWithRoi(videoFrame, poseSnapshot, timestampMs, options?)` は Pose 顔 ROI が有効なフレームだけ切り抜き推論を試し、ROI 欠損、ROI 顔未検出、整合性スコア `0` では同一フレームで全画面代替処理を 1 回だけ実行する。v1 の `options` は空オブジェクトの予約枠であり設定フィールドは持たない。
    - ROI 推論の切り抜き内の座標系のランドマークは整合性判定にだけ使い、スナップショットには `SincroRoiObservation`、`source`、`warnings` だけを残す。ImageBitmap / canvas / MediaPipe 未加工の結果は保存しない。
- `SincroPoseTracker`
    - 任意 PoseLandmarker から肩、胴体、腕目標を抽出する。
    - 腕目標は通常動作の変換用の `tracked` と IK 用の `quality` / `usableForIk` / `ikWeight` を分けて出力する。
    - PoseLandmarker の `worldLandmarks` は追跡処理内で `SincroPoseTargetPointSnapshot.world` へ正規化し、MediaPipe 生座標を制御処理 / VRM 層へ直接渡さない。
    - 3D 目標は肩基準（腕）または腰基準（下半身）のローカル目標と、VRM リグ倍率へ変換する前の正規化済み目標に分けて保持する。
    - 性能検査により顔のみ代替処理できる。
- `SincroHandTracker`
    - HandLandmarker を `/3rd_party/hand_landmarker.task` から初期化する。
    - Pose が実行されたフレームの `SincroPoseMotionSnapshot` から左 / 右手 ROI を作り、有効な左右だけ切り抜き推論する。両左右の ROI が無効の場合だけ、同一フレームで全画面代替処理を 1 回実行する。
    - ROI 切り抜き内の座標系のランドマークは `mapCropPointToFullFrame()` で全画面の正規化座標へ戻してから特徴量化し、スナップショットには切り抜きオブジェクトや未加工のランドマークを残さない。
    - 左右割り当ては Hand 左右判定単独で決めず、復元後手首と Pose 手首の距離を主条件にする。距離 `> 0.18` は `side_inconsistent` として捨てる。
    - 全画面代替処理では同じ手結果を両左右に割り当てず、重複は `duplicate_assignment` 警告として未検出左右に残す。同距離同順位は前フレーム割り当て、次に手首信頼度で片側だけ採用する。
    - Hand 手首は手のひら / 指信頼性材料であり、`SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` を上書きしない。本番腕 IK 目標の主入力は `TemporalUpperBodyState` 由来の身体のローカル座標系 / スカラーで表す腕状態であり、Hand 手首は腕目標の主入力にしない。
    - HandLandmarker の未ロード、初期化失敗、推論例外は未検出手スナップショットに落とし、Face / Pose 経路は継続する。
- `SincroGestureTracker`
    - GestureRecognizer を `/3rd_party/gesture_recognizer.task` から初期化する。
    - ジェスチャー任意合格は Pose 有効かつ Hand 追跡有効の場合だけ有効にし、同一フレームで Hand スナップショットが検出済みのときだけ `recognizeForVideo()` を実行する。Hand スナップショット自体にはジェスチャー表示名を混ぜない。
    - スナップショットは `SincroGestureMotionSnapshot`、左右 `SincroGestureSideSnapshot` の通常のオブジェクトに固定し、MediaPipe 未加工の結果、未加工のカテゴリ一覧、ランドマーク、切り抜きオブジェクト、ImageBitmap / VideoFrame / クラスのインスタンスを保存しない。
    - 1 手に複数カテゴリが返った場合は有限スコア最大を最上位ラベルにし、同スコア同順位は `categoryName` 昇順で決める。信頼度は `0..1` に値の制限し、カテゴリ欠損または非有限だけの場合は左右を `source: "lost"` にする。
    - ジェスチャー左右判定と Hand 左右の割り当てが食い違う場合は Hand 左右の割り当てを正本にし、左右スナップショットに `handedness_mismatch` 警告を残す。ジェスチャー左右判定だけで左 / 右は入れ替えない。
    - GestureRecognizer の未ロード、初期化失敗、推論例外、Pose 無効 / Hand 無効 / `roi-hand-paused` / 顔のみ / 自然な待機姿勢は未検出ジェスチャースナップショットと警告に落とし、Face / Pose / Hand 経路は継続する。
- 動作の変換処理
    - 中立較正、値の制限、不感帯、平滑化、信頼度検査を扱う。
    - MediaPipe 目標の欠損や信頼度低下は動作の変換処理の検査で扱い、人体的関節制約と頭部 / chest 侵入禁止領域は `SincroArmIkSolver` の責務とする。
    - ソルバー側の制約は誤目標を完全に修正するものではなく、取り得ない姿勢や自己貫通を抑える最終安全性として実行時スナップショットへ理由を返す。
- `pose-landmarker-spike`
    - MediaPipe PoseLandmarker のモデル / 実行方式 / 推論コスト / ランドマーク可視性を単体で確認する実験用ページ。
    - VRM 動作の変換や IK 適用後の姿勢比較は扱わない。
- `motion-debug`
    - `TrackerRuntime` が出力する `SincroPoseMotionSnapshot` を VRM 動作の変換へ流し、カメラ映像上の Sincro 姿勢目標と VRM の動きを比較する開発者ページ。
    - Playwright 用選択部品と `window.__SINCRO_MOTION_DEBUG__` は、手動調整の再現とスクリーンショット / スナップショット取得のための内部デバッグ API とする。
    - `ignorePerformanceFallback` を有効にして、低性能端末での IK 調整時も姿勢スナップショットを観測し続ける。
    - `ignorePerformanceFallback` 有効時も順序を固定した機能低下方針の頻度低下 / ROI 一時停止段階と `degradationPolicy` 統計は記録する。顔のみ / 自然な待機姿勢退避だけを抑制し、motion-debug の IK 調整で Pose 観測を継続できるようにする。
    - 構造化動作ログ記録は姿勢コールバック / 姿勢代替処理コールバック起点で標準化した上半身状態を生成してから `MotionDebugRecorder.recordFrame()` に渡し、TrackerRuntime や追跡処理処理担当には標準化した生成、DOM / ダウンロード / UI の責務を持たせない。
    - 構造化動作ログ記録は同じ姿勢コールバック / 姿勢代替処理コールバック起点で `ReliabilityMap` を生成し、`frame.reliability` へ保存する。信頼性が未計算のフレームでも格納先は省略せず、同じ `mediaTimeMs` の既定信頼性の対応表を保存する。
    - 構造化動作ログ記録は標準化した / 信頼性解決後に motion-debug ページ側の `TemporalStateEstimator.update()` を呼び、`frame.temporal` へ `TemporalUpperBodyState` を保存する。カメラ停止、映像固定データ読み込み、記録読み込み、再生停止、由来再初期化では時系列推定処理を再初期化する。
    - 構造化動作ログ記録は時系列解決後に同じ `mediaTimeMs` で motion-debug ページ側の `MotionIntentEstimator.update()` を呼び、`frame.intent` へ `MotionIntentState` を保存する。記録中でないライブスナップショットでも最新意図を保持し、再初期化時刻情報は時系列推定処理と揃える。
    - 本番 `sincro` の観測専用の処理工程でも `TemporalStateEstimator` と `MotionIntentEstimator` の
      再初期化時刻情報は揃える。モード切替、カメラ再取得、追跡停止、実行時エラーでは処理工程を再初期化し、
      過去フレームのフィルター / ヒステリシス / 待機期間を次のカメラ由来へ持ち越さない。
    - 構造化動作ログ記録は追跡処理コールバックと同じ `mediaTimeMs` で、motion-debug ページ側のデバッグ実行時スナップショットから `frame.solver.phase6`、`frame.solver.phase7`、`frame.solver.phase9`、`frame.finalPose` を保存する。追跡処理実行時 / Worker は段階 6 ソルバースナップショット、段階 7 プロファイル / 較正スナップショット、段階 9 意味に基づく動作 / 指診断用スナップショット、VrmPoseComposer 結果、基準指標を所有しない。
    - 構造化動作ログ記録は MediaPipe 未加工の結果直列化処理が通常の JSON 化できた格納先だけを任意 `frame.mediapipe` に保存する。保存対象は `pose`、`hand`、`face`、`gesture` と `timing.mediaTimeMs/videoWidth/videoHeight` で、MPMask、ImageBitmap、VideoFrame、切り抜き canvas、MediaPipe タスクインスタンス、ランドマークオブジェクトプロトタイプは保存しない。直列化処理未対応の格納先は省略し、空オブジェクトを記録済み未加工の結果として扱わない。
    - 構成情報 `build.packageVersions` は `sincromisor-frontend` と `@mediapipe/tasks-vision` の取得可能なバージョンを保持し、取得不能な値は `"unknown"` とする。`build.configHash` は性能プロファイルと動作の変換設定から作る決定的ハッシュで、固定値や空オブジェクトにはしない。
    - 構造化動作ログ再生は `MotionReplayPlayer` が非圧縮のNDJSON を解析し、`pose-snapshot` モードでは `frame.poseSnapshot` を後段の振る舞い / 動作の変換経路へ再投入する。`frame.canonical` がある場合は保存済み標準化したを閲覧画面 / スナップショットの正本にし、無い場合だけライブ代替処理の標準化したを使う。無効標準化したは再生失敗にせず、標準化した層の解析エラー要約として表示する。
    - 信頼性層はライブスナップショット、保存済み `frame.reliability`、旧ログの `frame.poseSnapshot` 再計算の順に解決する。保存済み信頼性は `parseReliabilityMap()` で検証し、無効な場合も再生失敗にせず `parseStatus: "invalid"`、解析エラー、未加工値を `available` 層値として表示する。`frame.reliability` と `frame.poseSnapshot` の両方が無い旧ログだけ `not_recorded` とする。
    - 時系列層は保存済み `frame.temporal`、ライブスナップショットの順に解決する。再生フレームに保存済み時系列がある場合は `parseTemporalUpperBodyState()` で検証し、無効な場合も再生失敗にせず `parseStatus: "invalid"`、解析エラー、未加工値を `available` 層値として表示する。再生フレームに `frame.temporal` が無い旧ログはライブ再計算で隠さず `not_recorded` とする。
    - 意図層は再生フレームの保存済み `frame.intent` だけを正本にする。旧ログで `frame.intent` が無い場合は `not_recorded`、スキーマ無効は `invalid` とし、ライブ再計算で欠損を隠さない。`pose-snapshot` 再生では保存済み意図があっても推定処理状態を上書きせず、スナップショット側には処理工程再実行の最新意図を任意で出す。
    - ソルバー層は保存済み `frame.solver.phase6`、`frame.solver.phase7`、`frame.solver.phase9` を `{ phase6, phase7, phase9 }` の内訳の状態として表示する。3 件すべて欠損した旧ログだけ外側 `solver` を `not_recorded` とし、いずれかが有効または無効なら外側は `available` にする。旧ログの旧形式 `frame.solver.poseRetarget` は残すが、段階 6 / 段階 7 / 段階 9 ソルバー層の代替として再計算しない。旧ログで `frame.solver.phase6.arms.<side>.source` が無い場合は `primarySource: "pose-snapshot-fallback"` 相当として表示し、`schemaVersion` は `sincro.phase6-solver.v1` のまま受理する。旧ログで `frame.solver.phase9` が無い場合は `phase9.status = "not_recorded"`、スキーマ無効は `phase9.status = "invalid"` とする。
    - 段階 7 内訳の層は `sincro.phase7-profile-calibration.v1` として、完成版 `AvatarMotionProfile`、初回 / 実行中の較正、有効標準化した較正を開発者が確認できる JSON で表示する。通常 UI の案内文言は保存せず、追跡処理実行時 / Worker も較正状態を所有しない。
    - finalPose 層は保存済み `frame.finalPose` を解析して `available`、欠損時は `not_recorded`、スキーマ違反時は `invalid` として表示する。
    - 再生中は `TrackerRuntime.startFaceTracking()` を呼ばず、ライブカメラ / 映像固定データ実行時とカメラトラックを停止してから進める。映像資材を読み直して MediaPipe 実行時を再実行する映像再推論再生は対象外である。
    - `mediapipe-raw-result` モードは `frame.mediapipe` を未加工再生スキーマで解析し、呼び出し元が渡す `applyRawResult` が Pose / Hand / Face / ジェスチャーの既存正規化処理境界へ渡す。`frame.mediapipe` 欠損は `missing_mediapipe_raw_result` とし、`pose-snapshot` へ暗黙代替処理しない。スキーマ違反は `parse_error` とし、失敗格納先をエラーメッセージ / 詳細に残す。`applyRawResult` 未指定時だけ `unsupported_mode` を返す。
    - ライブスナップショットのカメラ状態は任意 `camera.frameTiming` に最新 `TrackerVideoFrameTiming` を載せ、既存最上位 `status`、`camera.source`、`camera.width`、`camera.height`、`pose`、`tracker`、`canonical` のフィールド名は維持する。
    - ライブスナップショットのカメラ状態は由来が `camera` / `fixture` の場合だけ任意 `camera.quality` に `sincro.camera-quality.v1` の `CameraQualityScore` を載せる。由来が `none` の場合はスコアを生成せず、閲覧画面のカメラ層は未記録扱いにする。
    - `CameraQualityScore` は解像度、実行頻度、体幹 / 手が画面内に収まるか、画面端にあるリスク、手が小さく写るリスク、動きによるぼけリスクの 7 コンポーネントを持つ純粋なスコアである。案内文言は理由コードから固定文言へ変換し、自由文生成は行わない。
    - `CameraQualityScore.track` は機密情報を除去済みの `width`、`height`、`frameRate`、`facingMode`、`readyState` だけを保存し、未加工 `deviceId`、`groupId`、`label` は保存しない。
    - v1 の `motionBlurRisk` は実行頻度、実際の `frameRate`、低姿勢信頼度継続だけを見る代替指標であり、画素ぶれ / 明るさ解析は行わない。
    - CameraQualityScore は motion-debug のデバッグ / 記録表示に加え、本番観測専用 `ReliabilityMap` の
      `camera.cameraQualityStatus` と関節 / 部位の `cameraQuality` コンポーネントへ接続する。TemporalStateEstimator、
      IK 重み、VRM 適用へは直接接続しない。
    - 本番 `sincro` の Pose コールバックは最新 `CameraQualityScore` とフレームの `receivedAtPerformanceMs` を
      `camera-quality-changed` イベントで操作パネルへ渡す。通常 UI は案内文言の先頭一件だけを表示し、
      スコア、コンポーネント、理由コードは表示しない。`good` または案内文言なしは即時非表示とする。
    - カメラ案内の状態更新処理はイベントの `observedAtMs` だけを時計とする。初回 `bad` は即時表示、初回
      `warn` は同一文言が 500 ms 継続してから表示し、表示中の差し替えは 1,000 ms 保持と候補文言の
      500 ms 継続をともに満たした時だけ行う。時刻逆行時は候補だけを破棄して現在表示を維持する。
      モード切替、カメラ再取得 / 停止、追跡停止、実行時エラーは `camera-quality-reset` により即時非表示にする。
    - ライブカメラ / 映像固定データの由来判定、構成情報生成、ダウンロードリンク生成は `src/pages/motionDebug/` 側の責務とする。
      本番カメラ設定機密情報の除去は `src/app/controller/sincroCameraQualityRuntime.ts` と
      `createCameraQualityScore()` の境界で行い、未加工カメラ識別子を本番状態 / 診断 Console /
      固定データに保存しない。

## データ・状態

- `TrackerRuntimePerformanceProfile`
    - `src/features/gaze/trackingRuntime/trackerRuntimePerformanceProfile.ts` を正本とする実行時プロファイル契約。
    - スキーマバージョンは `sincro.tracker-performance-profile.v1` に固定し、`id`、任意 `requestedId`、`camera`、`cadence`、`debugLog`、`degradationBudget`、`warnings` だけを持つ JSON 保存可能な通常のオブジェクトとする。
    - プロファイル ID は `high-end-desktop`、`standard-laptop`、`mobile-safari`、`debug` の 4 種に固定する。未知 ID は throw せず `standard-laptop` に代替処理し、`warnings: ["unknown_profile_id_defaulted"]` と `requestedId` に呼び出し元指定値を残す。
    - 解決処理入力は `{ performanceProfileId?: string; performanceProfile?: unknown; defaultProfileId?: TrackerRuntimePerformanceProfileId }` とし、通常実行時の既定は `standard-laptop`、motion-debug 呼び出し時だけ呼び出し元が `defaultProfileId: "debug"` を渡す。
    - `performanceProfile` と `performanceProfileId` が同時指定された場合、実体は `performanceProfile` を優先し、`performanceProfileId` は `requestedId` とデバッグ表示用の要求値としてだけ扱う。
    - 独自プロファイルは有限数値、固定列挙値、通常のオブジェクトだけを受け付ける。`NaN` / `Infinity`、DOM オブジェクト、実行時クラスのインスタンス、関数は無効独自プロファイルとして `standard-laptop` 代替処理に落とす。
    - カメラの制約はプロファイルの `camera` から `idealWidth`、`idealHeight`、`idealFrameRate`、`maxFrameRate`、`facingMode: "user"` を読む。ブラウザ `getUserMedia()` へ渡す際は `ideal` / `max` だけを使い、`exact` や強い `min` は使わない。
    - 実行頻度は Face / Pose / Hand / Face ROI / ジェスチャーの目標 fps 既定である。`TrackerRuntime.startFaceTracking()` は明示 `targetInferenceFps`、`poseOptions.targetInferenceFps`、`poseOptions.hand.targetInferenceFps`、`poseOptions.gesture.targetInferenceFps`、`poseOptions.faceRoi.targetInferenceFps` がある場合は明示値を優先し、未指定フィールドだけプロファイル実行頻度を使う。
    - プロファイル固定値:

        | ID                 | カメラ           | 実行頻度 Face/Pose/Hand/Face ROI/Gesture | 数値のリングバッファ |
        | ------------------ | ---------------- | ---------------------------------------- | -------------------- |
        | `high-end-desktop` | `1280x720 30fps` | `15/12/8/10/6`                           | `600`                |
        | `standard-laptop`  | `960x540 24fps`  | `12/8/4/6/3`                             | `600`                |
        | `mobile-safari`    | `640x480 15fps`  | `8/4/2/3/1`                              | `600`                |
        | `debug`            | `1280x720 30fps` | `15/12/4/6/2`                            | `1800`               |

    - `debugLog.captureFullDumpByDefault` は全プロファイルで `false`、`overlayCaptureFps` は `1` 以下に固定する。常時記録は数値のリングバッファに限定し、PNG / 重ね表示 / 全情報の出力は明示操作または後続デバッグツールの責務とする。
    - `degradationBudget` は段階 3 / 段階 8 の既定値として `workerRoundTripWarnRatio: 0.9`、`workerRoundTripOverBudgetRatio: 1.25`、`roiBudgetRatio: 0.55`、`consecutiveOverBudgetFrames: 5`、`recoveryFrames: 30` を持つ。段階 10 後続の順序を固定した機能低下方針はこのプロファイルと予算を入力にするが、本プロファイル契約自体は自動プロファイル降格や fps 低下の状態機械を持たない。

- `SincroFaceMotionSnapshot`
    - 検出済み
    - 信頼度
    - headPose
    - ブレンドシェイプ
    - roi（任意 `SincroRoiObservation`。ROI 切り抜きや MediaPipe 未加工の結果は含めない）
    - 由来（`"roi"`、`"full-frame"`、`"full-frame-fallback"`、`"lost"`）
    - 警告
    - inferenceTimeMs
    - inferenceFps
    - fallbackReason
    - FaceLandmarker の全画面既存経路では `source: "full-frame"`、`warnings: []` を返す。ROI 代替処理で全画面が検出した場合は `source: "full-frame-fallback"`、代替処理でも未検出の場合は `source: "lost"`、`fallbackReason: "face_not_detected"` を返す。
    - Worker / TrackerRuntime は最新 Pose スナップショットが新鮮な場合だけ Pose スナップショットから Face ROI を作る。Pose が古くなった、Face ROI が実行頻度省略 / 一時停止、または姿勢性能検査により顔のみ代替処理中のフレームでは全画面 Face 追跡を継続し、Face 実行頻度を Pose 実行頻度に引きずらない。Face ROI 一時停止中のスナップショットは `face_roi_paused` 警告を持ち、motion-debug / 信頼性が古くなったと一時停止を区別できる。
- `SincroPoseMotionSnapshot`
    - trackingEnabled
    - 検出済み
    - 肩 / 体幹 / 腕目標
    - lowerBodyTargets（腰 / knee / ankle の観測確認用目標）
    - consecutiveFailures
    - degradedToFaceOnly
    - fallbackReason
    - MediaPipe / カメラ由来の観測スナップショットであり、後段共有の `CanonicalUpperBodyState` ではない。
    - `leftArm` / `rightArm` の目標は追跡入力映像の観測値を正規化したもので、身体のローカル座標系で表す到達距離 / 仰角 / 開き具合などの意味量は標準化した推定処理の責務とする。
- `SincroHandMotionSnapshot`
    - `trackingEnabled`
    - `detected`
    - `leftHand` / `rightHand`
    - `inferenceTimeMs`
    - `inferenceFps`
    - `lastUpdatedAtMs`
    - `fallbackReason`
    - 左右手スナップショットは `detected`、`assignedSide`、`source`、`confidence`、任意 `handednessLabel`、`handednessScore`、任意 `roi`、任意 `fullFrameWrist`、`features`、`warnings` を持つ。
    - 既定未検出手は `detected: false`、`source: "lost"`、`confidence: 0`、`handednessScore: 0`、`fullFrameWrist: undefined`、`palmNormal: [0, 0, 1]`、`palmDirection: [0, -1, 0]`、スカラー特徴量 `0`、`openness: "unknown"`、`warnings: ["landmarks_missing"]` とする。
    - `source` は `"roi"`、`"full-frame-fallback"`、`"previous"`、`"lost"` の固定列挙値とする。`previous` は後続時系列 / 信頼性接続用の予約値であり、段階 8 追跡処理は未加工のランドマーク再生を保存しない。
- `CanonicalUpperBodyState`
    - `sincro.canonical-upper-body.v1` のスキーマバージョンを持つ、身体のローカル座標系の上半身の意味量契約。
    - `SincroPoseMotionSnapshot` を置き換えず、追跡観測、時系列、意図、IK、指標が共有する中間表現として別格納先に保存する。
    - 保存形式は有限数値、文字列列挙値、3 要素タプル、通常のオブジェクトに限定し、MediaPipe ランドマークオブジェクト、Three.js オブジェクト、VRMボーン名をキーにした姿勢は入れない。
    - 左右は解剖学的な `left` / `right` に固定し、カメラプレビューの鏡像表示や画面座標の左右反転とは分けて扱う。
    - `head` は FaceLandmarker の `headPose.matrix` を主入力にしてヨー / ピッチ / ロールラジアンだけを保存する。行列欠損時は既存スナップショットの Euler 値へ低信頼度で代替処理し、行列無効かつ Euler も非有限の場合は `head` を省略する。Pose 鼻 / 耳 / 目代替処理は現行スナップショット契約に存在しないため、この契約ではまだ扱わない。
    - `parseCanonicalUpperBodyState()` はログ / 再生境界の検証 API であり、未知スキーマバージョン、値域外スカラー、非有限数値、実行時オブジェクト風余分なキーを拒否する。
- `ReliabilityMap`
    - `sincro.reliability-map.v1` のスキーマバージョンを持つ、追跡観測品質の保存契約。
    - `timestamp`、`camera`、`joints`、`parts`、`gesture`、`warnings` を持ち、`frame.reliability` 任意格納先に保存する。v1 は有限数値、小文字列挙値、通常のオブジェクトに限定し、Three.js オブジェクト、MediaPipe ランドマークオブジェクト、クラスのインスタンスは入れない。
    - `JointReliability` / `PartReliability` の `finalWeight` と各コンポーネント `score` は `0..1` で、低重み観測も解析成功として保持する。しきい値未満の観測を破棄するかどうかは後続推定処理 / 制御処理が判断する。
    - `parseReliabilityMap()` は未知 `schemaVersion` を先に `unknown_schema_version` として返し、値域外スカラーは `out_of_range`、構造違反や未知の列挙値 / 余分なキーは `invalid_state` として返す。
- `TemporalUpperBodyState`
    - `sincro.temporal-upper-body.v1` のスキーマバージョンを持つ、標準化した上半身の時間方向状態契約。
    - `TemporalPartState` は `"tracked"`、`"suspect"`、`"predicted"`、`"lost"`、`"recovering"` の小文字列挙値に固定し、`ReliabilityMap` の同名列挙値とは別型として扱う。信頼性は観測品質、時系列は時系列推定状態を表す。
    - `frame.temporal` 任意格納先に保存する通常のオブジェクトであり、`arms.left` / `arms.right` は標準化した腕スカラーと任意身体のローカル座標系の手首 / 肘タプル、速度、任意復帰中混合を持つ。頭部は任意で、未観測時は省略できる。
    - `parseTemporalUpperBodyState()` は未知 `schemaVersion` を `unknown_schema_version`、値域外スカラー / 混合継続時間 / 混合進行状況を `out_of_range`、非有限数値 / 未知の列挙値 / 余分なキー / クラスのインスタンスを `invalid_state` として返す。
    - 時系列は標準化した / 信頼性の後段に位置し、追跡処理実行時、Worker、MediaPipe 正規化スナップショットの責務ではない。VRM 姿勢合成、IK ソルバークォータニオン、最終適用済み姿勢は MotionSolver / VrmPoseComposer と最終姿勢系格納先の責務に残す。
- `SincroRoiObservation`
    - `side` は `"left"`、`"right"`、`"face"` に固定する。左右は解剖学的な左右とし、カメラプレビューの鏡像表示とは分ける。
    - `source` は `"pose-wrist"`、`"pose-face"`、`"full-frame-fallback"`、`"previous"`、`"none"` の固定列挙値とする。Pose 手首 / 顔領域が欠損した場合は例外にせず `source: "none"`、`confidence: 0`、`roi_missing` 警告を持つ観測値を返す。
    - 矩形は全画面の正規化画像座標の中心形式を正本にする。左上 `x/y/width/height` 形式は採用せず、切り抜き内の座標系の正規化済み点から全画面正規化済み点へ戻す式を左右対称に保つ。
    - 矩形値の制限は左 / 上端 / 右 / 下端を `0..1` に範囲制限してから中心 / 大きさを再計算する。中心だけを寄せて大きさを維持する方式は使わない。
    - `validateRoiRect()` は有限確認、端範囲制限、最小大きさ確認、信頼度値の制限の順に処理する。端範囲制限では `roi_clamped`、範囲制限後の幅 / 高さが `0.08` 未満なら `roi_too_small` と `confidence: 0` を残す。
    - `mapCropPointToFullFrame()` と `mapFullFramePointToCrop()` は ROI 矩形と正規化済みタプルだけを読む純粋な関数とし、往復は `1e-6` 以下に保つ。
    - ROI 整合性は期待する点と観測済み全画面点の正規化距離から算出し、`<= 0.04` はスコア `1`、`0.04..0.18` は線形低下、`> 0.18` はスコア `0` と `roi_inconsistent` 警告にする。
- `PoseReliabilityEstimator`
    - `src/character/reliability/poseReliabilityEstimator.ts` の `createPoseReliabilityMap()` は段階 8 時点の純粋な推定処理であり、`pose: SincroPoseMotionSnapshot`、任意 `hand: SincroHandMotionSnapshot`、任意 `face: SincroFaceMotionSnapshot`、任意 `cameraQuality: CameraQualityScore`、任意 `previous: { pose: SincroPoseMotionSnapshot; mediaTimeMs: number; reliability?: ReliabilityMap }`、呼び出し元が渡す `mediaTimeMs`、`video: { width: number; height: number }` だけを入力にする。
    - 推定処理内で `performance.now()` は呼ばず、時系列コンポーネントは `mediaTimeMs - previous.mediaTimeMs` と手首 / 肘 / 肩の正規化済み画像座標差分だけで計算する。`previous.reliability` は入力構造に含めるが、段階 4a の boneLength / bodyScale / 時系列の主計算は前回姿勢を正本にする。
    - 関節コンポーネントは `modelPresence`、`modelVisibility`、`tracking`、`border`、`boneLength`、`bodyScale`、`temporal`、`side`、`roi`、`cameraQuality` を常に埋める。`boneLength` は左右腕の上腕 / 前腕のワールド座標での長さ比率と前回の腕全体の長さに対する比率、`bodyScale` は `upperBody.shoulderWidth`、`cameraQuality` は `CameraQualityScore.overall.score` を使う。
    - `finalWeight` はコンポーネントスコアの幾何平均で、0 スコアは `0.001` として扱う。状態境界は `>= 0.65` が `tracked`、`0.05..0.65` が `suspect`、`< 0.05` が `lost` であり、`predicted` / `recovering` は TemporalStateEstimator の責務として段階 4a では返さない。
    - `face` が指定された場合、`joints.head` と `parts.head` は Face スナップショットを正本にして `source: "face"` を返す。`face.roi.confidence` を ROI コンポーネントスコアとし、Face 中心整合性は再計算しない。Face スナップショットの `source` は旧スナップショット互換で任意として扱い、`"lost"` の場合だけ追跡未検出とする。
    - `hand` が指定された場合、`joints.leftHand/rightHand` と `parts.leftHand/rightHand` は Hand スナップショットを正本にして `source: "hand"` を返す。Hand ROI コンポーネントは `calculateRoiConsistency({ expected: hand.roi.referencePoint, observed: hand.fullFrameWrist })` を正本にし、`referencePoint` または `fullFrameWrist` が無い旧スナップショットでは `not_available_in_pose_snapshot` に落とす。
    - `parts.leftFinger/rightFinger` は Hand `features.openness !== "unknown"` の場合だけ `source: "hand"` とし、指の曲げの有限性と手信頼性を読む。段階 9 の指の曲げ姿勢レイヤーはこの低水準の Hand スナップショットと MotionIntent を読み、VRM 指ボーン回転用の意味に基づく動作のレイヤーを motion-debug / 補助処理側で生成する。
    - `gesture` 格納先は任意 `GestureIntentObservation` がある場合だけ `source: "gesture"` とし、最上位ラベル信頼度、Hand 左右の割り当て、Hand ROI、カメラ品質、時系列の最小値から `finalWeight` を作る。`stableDurationMs` は同じ正規化済み左右 + 表示名が信頼度 `>= 0.70` で連続した時間だけ加算し、表示名 / 左右変更、信頼度低下、メディア時刻逆行、前回の欠損で `0` に戻す。時系列スコアは `clamp(stableDurationMs / 160, 0, 1)` とし、有効な 0〜159ms は `source: "gesture"` / `unstable_observation`、160ms 以上は理由なしとする。ジェスチャー欠損だけを中立 / `no_observation` にする。
    - ROI 理由はスナップショット入力自体が無い実行境界では既存仮の値を維持し、スナップショットはあるが `roi` フィールドだけ無い旧スナップショット / 旧再生ログでは `not_available_in_pose_snapshot`、新規 ROI メタデータの失敗警告では `roi_missing` / `roi_inconsistent` に写像する。同じ欠損に `roi_missing` と `not_available_in_pose_snapshot` を同時付与しない。
- 初期較正入力境界
    - 段階 ID は `precheck`、`neutral`、`a_pose`、`hand_open`、`face_yaw_optional` の固定列挙値とする。標準完了判定は `precheck` / `neutral` / `a_pose` / `hand_open` を使い、`face_yaw_optional` はデバッグ / 改善案内用の任意段階として扱う。
    - `precheck` は `CameraQualityScore.overall.status` と `components.torsoInFrame`、`neutral` は体幹 / 頭部信頼性と標準化した体幹ヨー、`a_pose` は肘 / 手首信頼性と画面端にあるリスク、`hand_open` は手信頼性と手が小さく写るリスク、`face_yaw_optional` は頭部信頼性と標準化した体幹ヨーだけを読む。該当カメラ情報の項目が無い場合はそのカメラ確認だけ省略済みとし、信頼性 / 標準状態の欠損はしきい値未満の入力として扱う。
    - 状態は `not_started`、`ready`、`ready_without_hands`、`retry_recommended`、`failed` の固定列挙値とする。手だけが機能低下中 / 再試行 / 失敗 / 省略済みの場合は、腕・頭・体幹を開始できる `ready_without_hands` に落とし、`hand_open` 単独の不調をセッション全体の `failed` にしない。
    - 再試行理由は `shoulders_out_of_frame`、`face_not_front`、`elbow_or_wrist_hidden`、`hand_not_visible`、`too_dark`、`motion_blur`、`low_reliability`、`camera_unavailable` の固定列挙値とする。通常 UI はこの理由を固定日本語文言へ最大 2 件に変換して表示し、スコア、未加工コンポーネント名、デバッグオブジェクトは出さない。
    - デバッグ UI / motion-debug は段階状態、再試行理由、スコア、validDurationMs、測定値、診断用フィールドを開発者が確認できる JSON として表示できる。MediaPipe 未加工のランドマーク、カメラ機器 ID / 表示名、ブラウザ権限オブジェクトは初期較正セッションに保存しない。
- `SincroPoseTargetPointSnapshot`
    - `tracked`: 通常目標として十分な信頼度と有限座標を持つ状態。
    - `quality`: `strong` / `weak` / `lost`。`weak` は座標を IK に使えるが、強度を落とすべき状態。
    - `usableForIk`: IK ソルバーが目標として使える状態。手首 / 肘は低信頼度でも有限座標かつ画面近傍なら弱い目標になり得る。
    - `ikWeight`: 弱い目標を使う時に IK 強度へ掛ける 0.0-1.0 の重み。
    - `world`: MediaPipe ワールド座標座標由来の 3D 目標。`hasWorldCoordinates` / `worldQuality` / `worldIkWeight` / `worldStaleReason` を 2D 目標とは別に持つ。
    - `world.normalizedX/Y/Z`: 肩幅または腰幅由来の人物スケールで割ったローカル 3D 目標。VRM ボーン長や左右反転の適用は動作の変換処理 / ソルバー側の責務とする。
    - `world.worldUsableForIk`: `world_3d_ik` ソルバーの検査。肩 / 肘 / 手首のいずれかが false の腕は、動作の変換処理側で部位代替処理し、特徴量動作の変換へ戻す。
    - `world.worldIkWeight`: 弱い目標を許容する腕末端ほど低信頼度でも 0 より大きくなり得る。ソルバーは最小重みを腕全体の IK 混合に使う。
- 動作評価ログフレーム
    - `sincro.motion-debug-log.v1` の保存単位は NDJSON のフレーム記録であり、追跡処理が出力する正規化姿勢スナップショットは `frame.poseSnapshot` に保存する。
    - `frame.canonical` は motion-debug ページ側で `SincroPoseMotionSnapshot` と最新顔スナップショットから生成した `CanonicalUpperBodyState` を保存する任意格納先である。Face 行列欠損 / 無効の警告は標準化した `head.warnings` と最上位 `warnings` に保存される。`parseMotionDebugLogLines()` は未知任意格納先として保持し、再生 / 閲覧画面境界で `parseCanonicalUpperBodyState()` により有効 / 無効を判定する。
    - `frame.reliability` は motion-debug ページ側で生成する `ReliabilityMap` の任意格納先である。`parseMotionDebugLogLines()` は未知任意格納先として保持し、再生 / 閲覧画面境界で `parseReliabilityMap()` により有効 / 無効を判定する。
    - `frame.hand` は motion-debug ページ側で保存する任意 Hand スナップショット格納先である。保存対象は `SincroHandMotionSnapshot` の JSON 可能な低次元フィールドに限定し、未加工のランドマーク、切り抜きオブジェクト、MediaPipe 結果は入れない。
    - `frame.temporal` は motion-debug ページ側で `CanonicalUpperBodyState` と `ReliabilityMap` から生成した `TemporalUpperBodyState` を保存する任意格納先である。`arms.left` / `arms.right` の `state`、`confidence`、`source`、`stateAgeMs`、`observedAgeMs`、`warnings`、`recoveringBlend`、`velocity`、`bodyLocalWrist` は再生閲覧画面の JSON 値で確認できる。
    - `frame.intent` は motion-debug ページ側で `TemporalUpperBodyState`、`ReliabilityMap`、任意 Hand スナップショットから生成した `MotionIntentState` を保存する任意格納先である。再生 / 指標は保存済み値を正本にし、旧ログ欠損をライブ再計算で補完しない。
    - `frame.solver.phase6` は motion-debug ページ側で保存する段階 6 ソルバースナップショットであり、`profile.schemaVersion`、有限数値だけの測定値、左右腕の `source`、IK 状態 / 制約理由コードを確認するための開発者が確認できる格納先である。`source.primarySource` は `"temporal"` または `"pose-snapshot-fallback"`、代替処理理由は `temporal_input_missing`、`avatar_profile_missing`、`temporal_arm_lost`、`invalid_temporal_arm`、`ik_solver_missing` のいずれかに固定する。MediaPipe 未加工の結果や追跡処理処理担当統計はこの格納先に入れない。
    - `frame.solver.phase7` は motion-debug ページ側で保存する段階 7 プロファイル / 較正スナップショットであり、`schemaVersion = "sincro.phase7-profile-calibration.v1"`、任意 `profile`、任意 `initialCalibration`、任意 `onlineCalibration`、任意 `activeCanonicalCalibration`、`warnings` を持つ。通常 UI の案内文言や実行時オブジェクトは保存しない。
    - `frame.solver.phase9` は motion-debug ページ側で保存する段階 9 意味に基づく動作 / 指診断用スナップショットであり、`schemaVersion = "sincro.phase9-semantic-motion.v1"`、`timestamp`、`intent`、`semantic`、任意 `finger.left/right`、`layers`、`warnings` だけを持つ通常のオブジェクトとする。段階 6 / 段階 7 / finalPose のスキーマへ意味に基づく動作 / 指フィールドは混ぜない。
    - `frame.finalPose` は motion-debug ページ側で保存する `VrmPoseComposerResult` スナップショットであり、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を確認するための開発者が確認できる格納先である。実際の VRM ボーン書き込み順序や追跡処理推論ループは変更しない。
    - 旧ログで `frame.reliability` が欠損している場合、再生閲覧画面は `frame.poseSnapshot`、`frame.timestamp.mediaTimeMs`、`frame.video.width` / `height` から `createPoseReliabilityMap()` を再計算する。この代替処理は旧ログ互換の姿勢のみの仮の値であり、保存されていない Hand / Face / ジェスチャー観測を再生時に捏造しない。保存済み信頼性がある場合、信頼性層は `gesture.source`、`finalWeight`、`confidence`、`stableDurationMs`、警告を含む `ReliabilityMap.gesture` を表示できる。ジェスチャー未加工のカテゴリ一覧や左右判定の未加工オブジェクトは `frame.mediapipe.gesture` の未加工再生格納先にだけ留め、信頼性層へ重複保存しない。再計算にも使える `poseSnapshot` が無い場合だけ信頼性層は `not_recorded` になる。旧ログで `frame.intent` / `frame.solver.phase7` / `frame.solver.phase9` が欠損している場合は該当内訳の層だけ `not_recorded` にし、ログ読み込み自体は失敗させない。
    - MediaPipe 未加工の結果は必要な場合も `frame.mediapipe` に分け、`frame.poseSnapshot` には `SincroPoseMotionSnapshot` 相当の正規化済みデータを置く。
    - 再生 API の `loadRecording()` は非圧縮のNDJSON `string` または `File` だけを受け付ける。`startReplay({ mode })`、`stepReplay(frameIndex)`、`stopReplay()`、`getReplayState()` は開発者専用のウィンドウ API として公開する。
    - `frame.timestamp.mediaTimeMs` は追跡処理コールバックの `TrackerVideoFrameTiming.mediaTimeMs` を正本にする。代替処理時だけ `video.currentTime * 1000` を使う。
    - コールバック受信時の `performance.now()` は `frame.metrics.receivedAtPerformanceMs` として保存する。追跡処理統計は `frame.metrics.tracker` に入れ、`timestamp.receivedAtPerformanceMs` や最上位 `tracker` は使わない。
    - `frame.metrics.tracker` は任意 `gestureInferenceTimeMs` と合計時間用の既存フィールド（Worker は `workerTimeMs`、メインスレッドは `mainThreadDetectTimeMs`）を保存する。`sincro.motion-debug-log.v1` は維持し、旧ログの欠損は有効とする。不正な負値・非有限値は継続時間解析処理がフィールド単位で除外して警告を返し、同じフレームの他フィールドやログ全体は捨てない。
    - 追跡処理処理時間の予算は `frame.metrics.tracker.budget` に保存する。`reasonCodes` は欠落したフレーム、Worker 待機中 detect、Worker 失敗 / 利用不可、姿勢繰り返し失敗、姿勢推論が遅すぎる、メインスレッド代替処理、ROI 省略 / 一時停止 / 代替処理 / 許容時間超過を列挙値として保持し、既存 `fallbackReason` の文字列は互換のため変更しない。ROI の累積統計は `frame.metrics.tracker.roi` で確認する。
    - 順序を固定した機能低下方針スナップショットは `frame.metrics.tracker.degradationPolicy` に保存する。motion-debug 閲覧画面の指標層は `degradationPolicy.stage`、`recovering`、`reasonCodes`、`effectiveCadence` と有効実行時性能プロファイルを開発者が確認できる JSON として表示する。カメラ解像度再交渉はこの方針スナップショットの予約情報に留め、ジェスチャー任意合格は本番実行時の `effectiveGestureFps` として実適用する。
    - 機能低下指標の保存側境界は `frame.metrics.tracker.budget.budgetStatus`、`frame.metrics.tracker.droppedFrames`、`frame.metrics.tracker.degradationPolicy.stage` / `recovering`、`frame.metrics.tracker.roi.pauseState`、`frame.timestamp.droppedPresentedFrames` に限定する。`budget.observed.droppedFrames` は予算報告の観測値として残すが、動作指標の正本入力にはしない。
    - 同一 `presentedFrames` と同一 `SincroPoseMotionSnapshot.lastUpdatedAtMs` の連続入力は重複フレームとして記録処理が捨てる。`presentedFrames` が無い代替処理 / 旧形式入力では、同一 `mediaTimeMs` と同一 `lastUpdatedAtMs` を重複とする。
    - カメラ実設定を構成情報に残す場合、未加工 `deviceId` / `groupId` は保存しない。ハッシュを保存する場合も公開単位だけで比較可能にし、公開をまたいで安定する識別子を残さない。
    - フレームごとのカメラ品質は `frame.metrics.cameraQuality` に保存する。最上位 `cameraQuality` はスキーマ外とし、構成情報のカメラ設定と同じく未加工機器識別子は持たない。
    - 公開された NDJSON は `parseMotionDebugLogLines()` が構成情報とフレーム記録を検証できるスキーマに固定する。
- 動作指標入力境界
    - `trackingLossDurationMs` は `frame.poseSnapshot.detected`、`degradedToFaceOnly`、`frame.timestamp.mediaTimeMs` を入力境界とし、未検出 / 機能低下中の連続区間を時刻差分で合計する。
    - `sideSwapCount` は `frame.poseSnapshot.leftArm.targets.wrist.cameraX` / `rightArm.targets.wrist.cameraX` と両手首の `confidence > 0.5` を入力境界とし、低信頼度のフレームでは左右反転を数えない。
    - `addedLatencyMs` は `frame.metrics.tracker.workerRoundTripMs` の p95 を入力境界とする。`frame.timestamp.mediaTimeMs` と `frame.metrics.receivedAtPerformanceMs` は時刻原点が異なるため、遅延指標では差分を取らない。
    - `recoveryJumpAngleDeg` は未検出 / 機能低下中から復帰済みへ戻ったフレームの `mediaTimeMs` を起点に、500ms ウィンドウの `frame.applied.angularVelocityDegPerSec` を優先し、欠落時だけ `frame.solver.poseRetarget` の腕クォータニオン連続差分へ代替処理する。
    - `left-arm-occlusion-recovery` / `right-arm-occlusion-recovery` は対象腕だけに追跡済み 10 フレーム以上、未検出 5 フレーム以上、復帰中 2 フレーム以上、再追跡済み 10 フレーム以上を発生させ、非対象腕を全フレーム追跡済みに保つ決定的 QA 通信規約とする。両固定データは回復急変 18deg 以下（8deg 超は既知 WARN）、ソルバー肘反転拒否 2 以下、最終姿勢角速度制限 3 以下、所有するボーン競合 0 を検査とする。
    - 段階 5 時系列指標は `temporalPredictedArmFrameCount`、`temporalRecoveringArmFrameCount`、`temporalLostArmDurationMs`、`temporalMaxRecoveryJumpDegEquivalent`、`temporalNeutralWristJitter` の 5 キーを持つ。段階 6 指標は `solverElbowFlipRejectCount`、`solverReachClampOccupancy`、`solverExcessReachRatioP95`、`solverPoleUncertainFrameCount`、`finalPoseAngularVelocityClampCount`、`finalPoseOwnedBoneConflictCount` を追加する。到達距離 p95 は橋渡し値の制限前の要求とソルバー最終目標の差を左右それぞれの全フレームから最近順位法で求め、旧ログまたは部分記録は利用しない。時系列の主入力への本番切替時は P0 再生固定データで中立揺らぎ、肘反転件数、回復急変、到達距離制限発生率を姿勢スナップショットによる代替処理基準と比較し、回帰が無いことをタスク成果物 / `impl.md` に保存する。段階 9 指標は `gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount` を追加する。段階 10 指標は `trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount` を追加し、すべて `unit: "count"`、`direction: "lower_is_better"` とする。すべて `MotionMetricResult.value: number | null` の単一数値指標とし、無効 / 欠損入力は `not_available` にする。
    - `trackerDroppedFrameCount` は `frame.metrics.tracker.droppedFrames` を累積値としてフレーム間差分へ正規化し、`frame.timestamp.droppedPresentedFrames` と同一フレームで大きい値だけを採用する。`degradationStageFrameCount` は新 `degradationPolicy.stage` を優先しつつ旧 `budget.degradation.state` も代替処理として読む。`degradationRecoveryFrameCount` と `roiPausedFrameCount` は旧ログから推測せず、それぞれ `degradationPolicy` / `roi` 欠損時に `not_available` とする。
- `SincroPoseRetargetedArm.constraint`
    - `reasons`: ソルバー側の安全性の発火理由。入力欠損とは分けて、関節制限 / 曲がる方向安定化 / 衝突回避を表示する。
    - `weightScale`: 制約 / 衝突による IK 重み減衰率。最終 IK 重みは目標信頼度由来重みとこの値を掛けたものになる。
    - `targetPushDistance`: 頭部球 / chest 楕円体から手目標を押し戻した距離。前腕区間の侵入禁止領域検出だけでは 0 のままになり得る。

## 本番適用の判定に使う入力

`motion.md` の本番適用検査は、追跡処理由来の Hand / Face ROI、機能低下、カメラ品質を入力条件として読む。追跡層は VRM 適用可否を直接決めず、成果物と指標状態で検査を止める材料を出す。

| 入力                       | 判定条件への影響                                                                                                                                                                                                                      | 必須成果物                                                                                                                     | 必須指標の状態                                                                                                                                                                                                                       | 必須の手動確認                                                                                                                         | 切り戻し条件                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand ROI                   | 腕フラグ以降の検査では、Hand ROI が `pose_stale_for_roi`、`hand_roi_paused`、`roi_missing`、`roi_inconsistent` を区別して保存されていることを開始条件にする。Hand 手首は手のひら / 指信頼性材料であり、腕 IK 目標の主入力にはしない。 | `frame.hand`、`SincroRoiObservation`、`frame.metrics.tracker.roi`、診断 Console Hand 要約。                                    | `roiPausedFrameCount` が合格または既知理由付き警告、Hand 信頼性が `not_available_in_pose_snapshot` と `roi_missing` を同じ欠損へ重複付与しないこと。                                                                                 | 片手 ROI 未検出、両手 ROI 無効全画面代替処理、手一時停止、回復後の左右の割り当てを確認する。                                           | Hand ROI 欠損で本番コールバックが例外になる、Hand 手首が Pose 手首 IK 目標を上書きする、または古くなった ROI が新鮮として使われる場合は Hand ROI 接続を観測専用に戻す。                           |
| Face ROI                   | 観測専用 / 試行検査では、Face ROI メタデータが頭部信頼性の説明材料として保存され、Face 動作の変換の既存入力値を置き換えないことを開始条件にする。                                                                                     | `SincroFaceMotionSnapshot.roi`、`source`、`warnings`、`frame.metrics.tracker.roi`、Face ROI 一時停止警告。                     | `trackingLossDurationMs` と頭部信頼性が Face ROI 一時停止 / 代替処理を説明でき、Face 中心整合性を ReliabilityMap 側で再計算していないこと。                                                                                          | Pose 古くなった中、Face ROI 顔未検出、全画面代替処理、顔のみ代替処理中も Face 実行頻度が Pose 実行頻度に引きずられないことを確認する。 | Face ROI 失敗で全画面 Face が止まる、Face 動作の変換が ROI 信頼度だけで無効化される、または切り抜き内の座標系のランドマークがスナップショットに漏れる場合は Face ROI を無効に戻す。               |
| 順序を固定した機能低下方針 | 試行以降の検査では、`degradationPolicy.stage` と ROI 一時停止状態が保存され、頻度低下 / ROI 一時停止 / 顔のみ / 自然な待機姿勢が指標に反映されていることを開始条件にする。                                                            | `frame.metrics.tracker.budget`、`frame.metrics.tracker.degradationPolicy`、`frame.metrics.tracker.roi`、有効性能プロファイル。 | `trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount` が合格または原因説明付き警告で、旧ログ欠損は推測せず `not_available` にすること。 | Worker 代替処理、main-thread-low-fps、ROI 許容時間超過、顔のみ、自然な待機姿勢、回復を motion-debug 指標層で確認する。                 | 機能低下段階が `"full"` 以外のまま戻らない、`ignorePerformanceFallback` が頻度低下 / ROI 一時停止統計まで抑制する、または自然な待機姿勢が古い Pose ROI を新鮮扱いする場合は本番適用検査を閉じる。 |
| カメラ品質                 | 観測専用と初期較正検査では、カメラ品質が信頼性 / 較正の入力説明として保存され、未加工機器識別子を保持しないことを開始条件にする。                                                                                                     | `frame.metrics.cameraQuality`、構成情報カメラ設定、`CameraQualityScore` 案内理由、初期較正段階状態。                           | カメラ情報の項目欠損は該当確認だけ省略済みとし、`CameraQualityScore.overall.status` が再試行 / 失敗の固定データは動作指標合格だけで次段へ進めないこと。                                                                              | 低解像度、手が画面外、動きによるぼけ、画面端にあるリスク、カメラ停止 / 再接続で案内理由と再試行状態を確認する。                        | 未加工 `deviceId` / `groupId` / `label` が保存される、カメラ品質再試行が無視されて較正が合格扱いになる、または由来 `none` でスコアを捏造する場合は検査を閉じる。                                  |

## 失敗時の挙動

- MediaPipe モデル / wasm 配置漏れ:
    - 追跡を無効化し、UI / 診断 Console に理由を表示する。
- Worker 初期化失敗:
    - メインスレッド追跡処理へ代替処理し、実効目標を顔 `<= 8fps`、姿勢 `<= 4fps`、Hand ROI `<= 2fps`、Face ROI `<= 3fps` に制限する。
    - `degradation.state` は `"main-thread-low-fps"`、理由コードは `main_thread_fallback` とし、Worker 利用不可 / 失敗は `reasonCodes` で切り分ける。
- ROI 許容時間超過:
    - Hand ROI、Face ROI の順で任意合格を落とし、全画面 Face とカメラループは継続する。
    - 一時停止中の Hand は `fallbackReason: "hand_roi_paused"` の未検出スナップショットを出し、Face は全画面スナップショットに `face_roi_paused` 警告を残す。
- HandLandmarker 初期化失敗:
    - Face / Pose 追跡は継続し、Hand は `model_not_loaded` 警告を持つ未検出スナップショットと診断 Console 要約に落とす。
    - 本番観測専用の処理工程は Hand 欠損を例外にせず、次の Pose コールバックで姿勢のみの / 顔のみの既存下流更新を続ける。
- 推論遅延または連続検出失敗:
    - 姿勢のみ顔のみに降格できる。
    - 既存 `fallbackReason` は `pose_inference_too_slow` を維持し、予算の `reasonCodes` では `pose_inference_warn` / `pose_inference_over_budget` に写像する。
    - `pose_inference_too_slow` は起動直後の MediaPipe 初期安定化サンプルを除外し、目標姿勢推論 fps から算出した推論予算で判定する。
    - `forceSincroPoseTracking` が有効な場合は、低性能端末でのデバッグを優先して `pose_inference_too_slow` による顔のみ降格だけを無効化する。この場合も予算の `degradation.state` と理由コードは残す。
- Firefox GPU 実行方式相性:
    - CPU 実行方式を使う。

## 変更時の確認

- 追跡処理を変更したらカメラトラックの二重取得とループの二重起動がないか確認する。
- MediaPipe のカテゴリ名や行列を制御処理へ漏らさない。
- 診断 Console へ未加工・正規化済み / 動作の変換 / 適用済みのどこを表示するか決める。
- Gaze カメラ機器切替時にプレビュー / AutoMute / 追跡処理が正しく再初期化されるか確認する。
- IK 調整を行う場合は `motion-debug` でカメラ重ね表示、VRM、`poseRetargetRuntime` を同時に確認する。

## 参照

- `documents/design/frontend/character/overview.md`
- `documents/design/frontend/character/motion.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
