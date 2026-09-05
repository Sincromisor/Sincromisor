# 調査レポート：Sincromisor `sincro` モード向け評価基盤 / デバッグ / QA 設計

対象: `sincromisor-frontend` キャラクターアニメーション実装
主題: `07-evaluation-debug-qa.md` に基づく、記録・再生・評価指標・固定テスト・QA 基盤の設計

## 0. 結論

`07-evaluation-debug-qa.md` の要求は、単なるデバッグ画面の拡張ではなく、**ライブカメラ依存の主観調整から脱却し、同一入力ログを同一処理工程に再投入して、改善・悪化を比較できる “動作の評価基盤” を作ること**です。添付資料でも、目的は `sincro` モードの上半身キャラクターモーションについて、記録、再生、評価指標、固定テストモーション、QA 観点を設計することと明記されています。

最初に実装すべきものは、IK、フィルタ、ROI、ジェスチャー改善ではなく、次の4点です。

1. `MotionDebugRecorder`: MediaPipe 未加工の結果、映像メタデータ、カメラ設定、処理工程設定、アバターの調整情報、最終姿勢を時系列保存する。
2. `MotionReplayPlayer`: ライブカメラなしで同じログを再生し、同じ処理工程を再実行できるようにする。
3. `MotionMetrics`: 中立姿勢での細かな揺れ、肘反転、復帰時の急変、角速度の急増、到達距離制限の発生率などを自動計算する。
4. `MotionQA`: 固定テストモーションと主観評価フォームを紐付け、数値では拾えない「かわいい / 自然 / 破綻しない」を評価する。

既存ロードマップでも段階 1 は「記録・再生・評価基盤」であり、`motion-debug` で MediaPipe スナップショット、動作の変換フレーム、最終姿勢、映像メタデータを保存し、同じデバッグログを再生モードに再入力し、主要評価指標を確認できることが完了条件になっています。

---

## 1. 現状コードの確認

公開リポジトリ上では、`sincromisor-frontend/src/pages/motionDebug` に `motionDebugApp.ts`、`motionDebugCameraStream.ts`、`motionDebugFrameCapture.ts`、`motionDebugVideoSource.ts`、`poseOverlayRenderer.ts`、`types.ts` などがあり、既に `motion-debug` ページは評価基盤の足場として使えます。([GitHub][1])

`package.json` では、`@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、`vite`、`vitest`、`zod` などが利用されています。つまり、MediaPipe 結果の型付き保存、VRM 姿勢の直列化済みログ、Vitest による評価指標回帰テスト、Zod によるログスキーマ検証を組み合わせる構成が自然です。([GitHub][2])

現在の `motionDebug` のスナップショット型は、カメラ、姿勢、追跡処理、poseRetarget、poseRetargetRuntime、描画などの現在状態を返す構造を持っています。一方で、現状の `captureFrame` は映像と重ね表示 canvas を PNG データ URL として保存する用途が中心で、フレームごとの構造化動作ログとは別物です。([GitHub][3]) ([GitHub][4])

`motionDebugApp.ts` には `loadVideoFixture` があり、固定データ映像を読み込む経路が既に存在します。また、`TrackerRuntime` と VRM シーン、姿勢コールバック、顔コールバックを接続する構造もあります。したがって、最初から別アプリを作るのではなく、既存 `motion-debug` を拡張し、`MotionDebugRecorder`、`MotionReplayPlayer`、`MotionMetrics` を追加する方針が妥当です。([GitHub][5])

一方、現在のカメラストリーム取得は `getUserMedia` で解像度の希望値を1280x720、`facingMode`を`user`に指定していますが、実際の `MediaStreamTrack.getSettings()` を評価ログに保存する設計にはまだ見えません。Web カメラでは要求値と実設定が一致するとは限らないため、カメラ設定は必須ログ項目です。([GitHub][6])

---

## 2. 評価基盤の基本方針

既存ロードマップの基本方針は、MediaPipe 特徴点をそのまま VRM ボーンに流さず、MediaPipe観測値 → ReliabilityMap → 身体のローカル座標系での標準状態 → 時系列状態 → 動作意図 → アバタープロファイル → IK・FK・加算アニメーション → VRMの正規化済みローカル回転へ段階的に変換することです。

評価基盤も同じ分解に合わせます。つまり、単に最終 VRM 姿勢だけを保存するのではなく、**どの層で悪化したかを切り分けられるログスキーマ** にします。

```text
カメラ / 映像フレーム
  -> MediaPipe 未加工の結果
  -> ReliabilityMap
  -> CanonicalUpperBodyState
  -> TemporalState
  -> MotionIntent
  -> AvatarMotionProfile 対応付け
  -> IK / 制約 / 動作の変換スナップショット
  -> 最終 VRMPose
  -> 適用済み正規化済み・未加工姿勢
  -> フレーム評価指標
```

MediaPipe の Web Landmarker は映像モードで時刻付きの `detectForVideo()` 系処理を行いますが、公式ドキュメントではこれらの呼び出しが同期実行で UIスレッドをブロックするため、必要に応じて Web Worker に分離できると説明されています。これは性能だけでなく、推論タイミングの揺れを抑える意味でも評価ログに影響します。([Google for Developers][7]) ([Google for Developers][8])

---

## 3. 動作診断ログの形式

### 3.1 推奨ログ形式

最初の実装では、**NDJSON + gzip/Brotli** を推奨します。1行目に概要情報、以降にフレーム記録を並べる形式です。理由は、巨大ログでも逐次処理保存・部分読み込み・差分比較がしやすく、ブラウザ内でも扱いやすいためです。

```ts
type SincroMotionDebugLogManifest = {
    schemaVersion: "sincro.motion-debug-log.v1";
    createdAtIso: string;

    source: {
        kind: "live-camera" | "video-fixture" | "synthetic";
        fixtureId?: string;
        videoHash?: string;
    };

    environment: {
        userAgent: string;
        devicePixelRatio: number;
        viewport: { width: number; height: number };
        timeOriginMs?: number;
    };

    build: {
        appVersion?: string;
        gitCommit?: string;
        packageVersions: {
            three?: string;
            threeVrm?: string;
            mediapipeTasksVision?: string;
        };
        configHash: string;
    };

    camera: {
        requestedConstraints?: MediaTrackConstraints;
        actualSettings?: MediaTrackSettings;
        facingMode?: string;
        frameWidth?: number;
        frameHeight?: number;
    };

    pipeline: {
        trackerConfig: unknown;
        reliabilityConfig: unknown;
        canonicalConfig: unknown;
        temporalConfig: unknown;
        retargetConfig: unknown;
        featureFlags: Record<string, boolean>;
    };

    avatar: {
        avatarProfileId: string;
        vrmMetaHash?: string;
        boneCapabilities: Record<string, boolean>;
        restMetrics: AvatarRestMetrics;
        motionProfile: AvatarMotionProfile;
    };

    metricSummary?: MotionMetricSummary;
};

type SincroMotionDebugFrame = {
    frameIndex: number;

    timestamp: {
        mediaTimeMs: number;
        presentationTimeMs?: number;
        expectedDisplayTimeMs?: number;
        receivedAtPerformanceMs?: number;
        presentedFrames?: number;
        deltaMediaMs?: number;
    };

    video: {
        width: number;
        height: number;
        readyState?: number;
        sourceFrameId?: number;
    };

    mediapipe?: {
        pose?: SerializedPoseLandmarkerResult;
        hands?: SerializedHandLandmarkerResult[];
        face?: SerializedFaceLandmarkerResult;
        gesture?: SerializedGestureRecognizerResult[];
    };

    reliability?: ReliabilityMap;
    canonical?: CanonicalUpperBodyState;
    temporal?: TemporalStateSnapshot;
    intent?: MotionIntent;

    solver?: {
        ik?: IkDebugSnapshot;
        targets?: RetargetTargetSnapshot;
        constraints?: ConstraintDebugSnapshot;
        clampedBones?: string[];
    };

    finalPose?: SerializedVrmPose;

    applied?: {
        normalizedPose?: SerializedVrmPose;
        rawPose?: SerializedVrmPose;
        angularVelocityDegPerSec?: Record<string, number>;
    };

    metrics?: MotionFrameMetrics;
};
```

### 3.2 必ず保存すべきデータ

| 層                                       |         必須度 | 保存理由                                                                             |
| ---------------------------------------- | -------------: | ------------------------------------------------------------------------------------ |
| スキーマ / ビルド / パッケージバージョン |           必須 | 旧ログとの互換性、再現性、設定差分比較                                               |
| カメラの制約 / 実際の設定                |           必須 | 解像度・fps・facingMode が品質に直結する                                             |
| 映像時刻                                 |           必須 | 再生同じ入力から同じ結果を得る性質、遅延、破棄フレーム検出                           |
| MediaPipe 未加工の結果                   |           必須 | ソルバー / 信頼性 / 標準化した改修を同一入力で比較するため                           |
| ReliabilityMap                           |           推奨 | 悪い観測値をどの時点で弱めたかを検証するため                                         |
| CanonicalUpperBodyState                  |           推奨 | 身体のローカル座標系の意味量の差分を見て、MediaPipe 依存とソルバー依存を分離するため |
| TemporalState                            |           推奨 | Lost / Recovering / Predicted の状態遷移を検証するため                               |
| MotionIntent                             |           推奨 | 手振り / pointing / nearFace / 未検出などの意味づけの安定性を見るため                |
| IK / 制約スナップショット                |           必須 | 肘反転、到達距離制限、制限発生率を説明するため                                       |
| 最終 VRMPose                             |           必須 | アルゴリズム出力差分を比較するため                                                   |
| 適用済み正規化済み姿勢                   |           必須 | three-vrm 適用後の最終状態を評価指標に使うため                                       |
| 未加工姿勢                               | デバッグ時のみ | 正規化済み→未加工転送の検証用。常時保存は重い                                        |

既存 report01 でも、動画そのものより MediaPipe の出力を保存して動作算出処理を調整しやすくする方針が示されており、`timestampMs`、姿勢特徴点、手の特徴点、左右判定、顔変換行列などを記録する案が挙げられています。

### 3.3 保存しなくてもよい / 再計算できるデータ

常時保存しなくてよいものは、主に「決定的に再計算できる派生値」です。

| データ                 | 方針                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| フレームごとの評価指標 | 要約用には保存。詳細は未加工 / 最終姿勢から再計算可能                              |
| カメラ品質スコア       | 未加工フレームメタデータと特徴点から再計算可能。ただし UI 表示と一致させるなら保存 |
| 領域分割マスク         | 原則保存しない。保存するなら低解像度マスク要約、外接矩形内平均値、ハッシュ程度     |
| 重ね表示 PNG           | 原因の切り分け用に任意保存。評価ログの主データにはしない                           |
| 映像フレーム画像       | 未加工の結果再生では不要。映像再推論モードの固定データとして別管理                 |

ログサイズ削減では、浮動小数点数を 4〜5 桁程度に丸める、全アバターの調整情報を毎フレーム保存しない、領域分割マスクを保存しない、手・指の欠落時は欠落項目を省いた形式にする、全面スナップショットを N フレームごとに置いて中間は差分符号化する、という方針が有効です。

---

## 4. 時刻と同じ入力から同じ結果を得る性質

再生の基準時刻は `performance.now()` や `Date.now()` ではなく、**映像フレームに紐付く `mediaTimeMs`** にします。`requestVideoFrameCallback()` は映像フレームごとの処理、canvas への描画、映像解析、外部音声との同期などに使える API で、コールバックには映像フレームのメタデータが渡されます。([MDNウェブドキュメント][9])

記録すべき時刻は次です。

| 項目                                  | 用途                                       |
| ------------------------------------- | ------------------------------------------ |
| `mediaTimeMs`                         | 再生の正本時刻                             |
| `presentationTimeMs`                  | 映像フレームが画面合成処理に提出された時刻 |
| `expectedDisplayTimeMs`               | 表示予定時刻。遅延解析用                   |
| `presentedFrames`                     | 破棄 / 重複フレーム検出                    |
| `receivedAtPerformanceMs`             | 処理工程内処理時間の測定                   |
| `inferenceStartMs` / `inferenceEndMs` | MediaPipe 推論コスト測定                   |
| `deltaMediaMs`                        | フィルタ / 速度 / 角速度計算               |

また、MediaStream の要求制約だけでなく、実際の設定値は `MediaStreamTrack.getSettings()` で取得して保存します。MDN でも `getSettings()` は制約を指定できる属性の現在値、つまり実際の構成を返す API とされています。([MDNウェブドキュメント][10])

---

## 5. 再生モード設計

### 5.1 モード A: MediaPipe 未加工の結果再生

最優先で作るべきモードです。

```text
記録済み MediaPipe 未加工の結果
  -> ReliabilityEstimator
  -> Canonicalizer
  -> TemporalStateEstimator
  -> MotionIntentEstimator
  -> AvatarMotionProfile
  -> IK / 動作の変換
  -> 最終 VRMPose
```

利点は、ログが比較的小さく、カメラなしで同じ入力を再利用でき、ソルバー / 時系列 / 動作の変換 / アバターの調整情報の改善を安定して比較できることです。制約は、MediaPipe 自体、ROI、カメラ画質、露出、動体ぶれの改善評価には使えないことです。

### 5.2 モード B: 映像固定データ再推論

既存 `motionDebug` には `loadVideoFixture` 経路があり、固定データ映像を使った検証の足場があります。([GitHub][5])

このモードでは、録画済み映像固定データから MediaPipe を再実行します。

```text
映像固定データ
  -> MediaPipe Pose / Hand / Face / Gesture
  -> 全面処理工程
```

利点は、検出器設定、Hand/Face ROI、カメラ品質評価の検証ができることです。制約は、MediaPipe 実行環境、ブラウザ、Worker、GPU/CPU 実装差により、完全同じ入力から同じ結果を得るにはなりにくいことです。MediaPipe Hand Landmarker や Gesture Recognizer も映像・実時間のストリームモードでは追跡と検出の状態を持つため、未加工の結果再生より揺れやすくなります。([Google for Developers][8]) ([Google for Developers][11])

### 5.3 モード C: 標準状態再生

CanonicalUpperBodyState から後段だけを再生するモードも価値があります。

```text
記録済み CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> MotionIntentEstimator
  -> AvatarMotionProfile
  -> IK / 動作の変換
  -> 最終 VRMPose
```

これは標準化より後ろの時系列 / 意味に基づく動作 / アバター / IK の評価に特化します。例えば、同じ `elevation / openness / forwardness / elbowFlexionHint` から、フィルタ係数やアバターの調整情報の変更だけを比較する用途に向いています。

### 5.4 モード D: 最終姿勢再生

`finalPose` または `appliedPose` だけを再生するモードは、アルゴリズム評価ではなく見た目の QA / 回帰プレビュー用です。

```text
記録済み最終 VRMPose
  -> vrm.humanoid.setNormalizedPose()
  -> vrm.update(delta)
```

three-vrm では正規化済み姿勢を `setNormalizedPose()` で適用し、`VRM.update(delta)` で正規化済みリグから未加工リグへ転送する設計が基本です。`setNormalizedPose()` に渡す変換は初期姿勢 / T-pose からのローカル相対的な変換です。([Pixiv][12])

---

## 6. 評価指標定義

### 6.1 Quaternion 角度共通関数

最終姿勢の評価指標は Euler 角ではなくクォータニオン差分で計算します。

```ts
function quatAngleDeg(a: QuaternionArray, b: QuaternionArray): number {
    const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    const clamped = Math.min(1, Math.max(-1, dot));
    return (2 * Math.acos(clamped) * 180) / Math.PI;
}

function angularVelocityDegPerSec(
    prev: QuaternionArray,
    next: QuaternionArray,
    dtSec: number,
): number {
    return quatAngleDeg(prev, next) / Math.max(dtSec, 1e-6);
}
```

three-vrm 側でも、最終姿勢は `VRMHumanBoneName` ごとの正規化済みのローカル回転として扱うべきで、未加工ノードのワールド座標クォータニオンを直接保存・上書きする方式は避けるべきです。

### 6.2 最初に見るべき評価指標と合格ライン

| 評価指標                           | 計算方法                                                  |       合格 |      警告 |    失敗 |
| ---------------------------------- | --------------------------------------------------------- | ---------: | --------: | ------: |
| 中立姿勢での細かな揺れ: 胴体・頭部 | 中立姿勢区間で基準クォータニオンからの RMS                |     ≤ 1.0° |  1.0–2.0° |  > 2.0° |
| 中立姿勢での細かな揺れ: 手首       | 中立姿勢区間で手首 / 手の RMS                             |     ≤ 3.0° |  3.0–5.0° |  > 5.0° |
| 肘の反転回数                       | 肘の曲がる方向が急反転した回数                            |          0 |         - |     ≥ 1 |
| 観測欠落からの復帰時の急変         | Lost/Predicted から Recovering/Tracked 復帰時の最大角度差 |      ≤ 15° |    15–25° |   > 25° |
| 追加遅延: 手・頭部                 | 未加工特徴量と最終姿勢特徴量の相互相関遅れ                |    ≤ 100ms | 100–150ms | > 150ms |
| 追加遅延: 体幹                     | 同上                                                      |    ≤ 150ms | 150–220ms | > 220ms |
| 骨の長さばらつき                   | 高信頼度時の上腕/前腕推定長 CV                            |       ≤ 8% |     8–12% |   > 12% |
| 到達距離制限の発生率               | 到達距離制限発生フレーム / 有効フレーム                   |      ≤ 10% |    10–20% |   > 20% |
| 左右の入れ替わり回数               | 左右の割り当てが時系列整合を破った回数                    |          0 |         - |     ≥ 1 |
| 意味分類のちらつき                 | 最小継続時間未満のジェスチャー表示名変化数                | 0–1 / 区間 |       2–3 |     > 3 |

既存 report03 でも、最初に見るべき指標として中立姿勢での細かな揺れ、肘の反転回数、観測欠落からの復帰時の急変、追加遅延、骨の長さばらつきが挙げられ、中立姿勢での細かな揺れは胴体・頭部 RMS 0.5〜1.0°以下、手首 2〜3°以下、肘反転は固定テスト中 0 回、復帰時の急変は 10〜15°以下、到達距離制限の発生率は 10〜20% を超えると問題の可能性が高い、とされています。

### 6.3 個別評価指標の定義

**中立姿勢での細かな揺れ**

```text
neutralJitterRms(bone) =
  sqrt(mean(angle(q_frame, q_reference)^2))
```

`q_reference` は中立姿勢区間のクォータニオン中央値または低速平均です。胴体・頭は強く評価し、手首・指は許容量をやや広くします。

**肘の反転回数**

```text
angle(pole_t, pole_t-1) > 120° の場合に反転
  かつ armConfidence > threshold
  かつ手首を意図的に交差させていない
```

肘反転は 1 回でも視覚的に目立つため、固定テストでは 0 回を合格条件にします。

**観測欠落からの復帰時の急変**

```text
recoveryJump(side) =
  max angle(finalPose_lastPredicted, finalPose_firstRecovering..N)
```

Lost / Predicted 中に無理のない自然姿勢へ寄せる場合でも、復帰時に急に実測へ吸着してはいけません。

**角速度の急増**

```text
angularVelocityDegPerSec(bone) > threshold(bone) の場合に急増
```

閾値は部位別にします。胴体・頭の急増は厳しく、手・指は緩めにします。three-vrm 調査でも、MediaPipe 特徴点だけでなく最終姿勢前・後制限、適用済みクォータニオン角速度、欠損ボーン代替処理、AnimationMixer 所有権などをデバッグに出すべきとされています。

**到達距離制限の発生率**

```text
reachClampOccupancy(side) =
  frames(clampRatio > 0 or clampedBones includes arm/shoulder) / validFrames
```

この値が高い場合、IK が悪いというより、ユーザー較正、アバター腕倍率、奥行き圧縮、目標倍率が悪い可能性が高いです。

**骨の長さばらつき**

```text
cv = std(observedBoneLength) / mean(observedBoneLength)
```

高信頼度フレームに限定して計算します。単眼推定のワールド座標 z を過信している場合、この値が増えやすくなります。

**意味分類のちらつき**

```text
flicker = count(label changes that violate minDuration or hysteresis)
```

Gesture Recognizer は `Closed_Fist`、`Open_Palm`、`Pointing_Up`、`Thumb_Up`、`Victory` などのカテゴリを返せますが、ラベルを直接アニメーション発火条件にするとちらつきやすいため、最小継続時間とヒステリシスを評価指標化します。([Google AI for Developers][13])

---

## 7. 固定テストモーションセット

### 7.1 最小セット

既存 report03 の固定テストセットを正本として、P0 / P1 に分けます。

| 優先度 | テスト                                        | 長さ目安 | 見るべき項目                                         |
| ------ | --------------------------------------------- | -------: | ---------------------------------------------------- |
| P0     | 中立姿勢 10秒                                 |      10s | 胴体・頭部・手首細かな揺れ、カメラ品質               |
| P0     | 片手をゆっくり上げる左右                      |     各8s | 肩補正、肘の曲がる方向、腕の伸び切り                 |
| P0     | 両手をゆっくり上げる                          |       8s | 胸 / `upperChest` 分配、肩崩れ                       |
| P0     | 片手を画面外へ出して戻す                      |     各8s | Lost / Predicted / Recovering、復帰時の急変          |
| P0     | 腕を交差する                                  |       8s | 左右の入れ替え、曲がる方向反転                       |
| P0     | 速い手振り                                    |       8s | 遅延、意味に基づく動作手振り、一時欠損               |
| P1     | 手を前に出す                                  |       8s | 前出し具合、奥行き圧縮                               |
| P1     | 手を顔の前に置く                              |       8s | 顔・手遮蔽、手首ロール、指安定                       |
| P1     | 指差し・開き手・握り手                        |      10s | 指の曲げ、ジェスチャー状態、意味に基づく動作ちらつき |
| P1     | 顔を左右に向ける                              |       8s | Face/Pose 代替処理、頭部細かな揺れ                   |
| P1     | 手を横に広げる                                |       8s | 開き具合、腕長さ補正                                 |
| P1     | 小柄 VRoid / `upperChest` なし VRM で同一再生 |        - | アバターの調整情報、任意ボーン代替処理               |

report01 でも、正面中立姿勢、ゆっくり手を上げる、高速手振り、手を顔の前に出す、片手を画面外に出す、腕を交差する、横を向く、手をカメラ方向に突き出す、小柄 VRoid、`upperChest` なしモデルがテストケースとして挙げられています。

### 7.2 収録条件

固定テストログは、次の条件を概要情報に記録します。

| 条件         | 記録内容                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| カメラ       | 要求された制約、実際の設定、解像度、fps、facingMode                      |
| 画面内の構図 | 体幹が画面内に収まるか、手が画面内に収まるか、画面端にあるリスク         |
| 照明         | 明るい / 暗い / 逆光などのラベル                                         |
| 被写体       | 身長・体型そのものではなく、肩幅較正値などの匿名化された計測値           |
| アバター     | 既定 VRoid、小柄 VRoid、頭大きめ、`upperChest` なし                      |
| 処理工程     | MediaPipe 設定、フィルタ設定、動作の変換設定、アバターの調整情報ハッシュ |
| 固定データ   | 未加工の結果固定データ / 映像固定データ / 標準化した固定データの種別     |

`requestVideoFrameCallback()` と `getSettings()` をログに取り込む段階 2 は、ロードマップでも明示されています。

---

## 8. QA 観点

### 8.1 主観評価フォーム

数値評価指標は必要ですが、最終目的は「人体忠実」ではなく「キャラクターとして自然で破綻しない」ことです。ロードマップでも、優先順位は「破綻しない」「安定している」「キャラクターとして自然に見える」「ユーザーの意図が伝わる」「実人体に忠実」の順とされています。

推奨フォームは 5 段階評価 + 破綻タグです。

| 項目                         | 評価                 |
| ---------------------------- | -------------------- |
| 全体の安定感                 | 1–5                  |
| キャラクターとして自然か     | 1–5                  |
| かわいさ / 親しみやすさ      | 1–5                  |
| ユーザーの動作意図が伝わるか | 1–5                  |
| 胴体・頭の落ち着き           | 1–5                  |
| 腕・肩の破綻の少なさ         | 1–5                  |
| 手首・指の違和感の少なさ     | 1–5                  |
| 遅延の許容感                 | 1–5                  |
| 総合採用可否                 | 合格 / 警告 / 不合格 |

### 8.2 破綻分類

| 重大度 | 分類   | 例                                                                       |
| ------ | ------ | ------------------------------------------------------------------------ |
| S0     | 即修正 | 肘反転、左右入れ替え、肩が胴体へめり込む、頭が震える                     |
| S1     | 高優先 | 手首ロール暴れ、復帰時の急変、腕の伸び切り、顔前の手で破綻               |
| S2     | 中優先 | 指のちらつき、ジェスチャー表示名ちらつき、意味に基づく動作クリップ誤発火 |
| S3     | 低優先 | 小さな細かな揺れ、表現不足、動きが控えめすぎる                           |

report03 でも、かわいい / 自然に見せる上で避けるべき破綻は、胴体・頭部細かな揺れ、肘反転、肩崩れ、手首ロール暴れ、腕の伸び切り、指のちらつきの順に整理されています。

### 8.3 アバター差分 QA

同じ再生ログを複数アバターに適用します。

| アバター                      | 見るべき差分                           |
| ----------------------------- | -------------------------------------- |
| 標準 VRoid                    | 基準値                                 |
| 小柄 VRoid                    | 到達距離倍率、奥行き圧縮、腕の伸び切り |
| 頭大きめ VRoid                | 手が顔に近い時のめり込み、頭部反映率   |
| `upperChest` なし             | 胸 / 背骨 / 肩分配                     |
| 肩ボーンなし / 指ボーン不完全 | 任意ボーン代替処理                     |

ロードマップでも、VRM 読み込み時に初期姿勢のローカル回転、骨の長さ、肩幅、頭部大きさ、任意ボーンを計測し、小柄 VRoid、頭が大きいモデル、`upperChest` なしモデルで同じ再生ログを比較できることが完了条件になっています。

### 8.4 カメラ品質差分 QA

| カメラ条件            | 見るべき問題                                      |
| --------------------- | ------------------------------------------------- |
| 1280x720 / 30fps 相当 | 基準値                                            |
| 実 fps 低下           | 追加遅延、一時欠損、時系列急増                    |
| 暗所                  | 手一時欠損、動体ぶれリスク                        |
| 顔アップ              | 肩・肘が入らず体幹の座標系が不安定                |
| 遠距離                | 手外接矩形小、Hand 一時欠損、ジェスチャー検出漏れ |
| 手が画面端            | 画面端にあるリスク、復帰時の急変                  |
| 腕交差 / 顔前         | 左右の入れ替え、遮蔽                              |

UX に出す場合は、内部評価指標ではなく「もう少し離れて両肩が入るようにしてください」「手が画面端に近いです」など、ユーザーが修正できる表現に変換します。report03 でもカメラ品質スコアを UX に反映する具体例が整理されています。

---

## 9. 評価指標が改善しても見た目が悪化するケース

評価基盤では、評価指標の単純最小化を避ける必要があります。

| 数値上の改善                 | 起きうる見た目の悪化                             |
| ---------------------------- | ------------------------------------------------ |
| 細かな揺れ低下               | 動きが鈍い、生命感がない                         |
| 角速度の急増減少             | 手振りや指差しの意図が弱い                       |
| 到達距離制限の発生率低下     | 目標倍率を下げすぎて腕が届かない                 |
| 意味に基づく動作ちらつき減少 | ジェスチャーが発火しにくく、表現が乏しい         |
| 遅延低下                     | フィルタ不足で細かな揺れ / 急変が増える          |
| 一時欠損を短く見せる         | 不確かな観測値に早く戻りすぎて復帰時の急変が出る |

したがって、CI / 回帰検査で見る評価指標と、人間 QA で見る「自然さ」「かわいさ」「意図の伝達」は分けます。

---

## 10. 実装モジュール案

既存ロードマップは、現行の `features/gaze/trackingRuntime`、`features/gaze/poseTracking`、`character/retargeting`、`character/ik`、`pages/motionDebug` を足場として活かし、`MotionDebugRecorder` / `MotionReplayPlayer` / `MotionMetrics` を追加する方針です。

推奨追加構成は次です。

```text
src/mocap/evaluation/
  MotionDebugLogSchema.ts
  MotionDebugRecorder.ts
  MotionDebugLogWriter.ts
  MotionDebugLogReader.ts
  MotionReplayPlayer.ts
  MotionReplayClock.ts
  MotionMetrics.ts
  MotionMetricDefinitions.ts
  MotionComparisonReport.ts
  MotionQaTags.ts
```

または既存責務境界を崩さない場合は、次のように `features/gaze` と `pages/motionDebug` に寄せます。

```text
src/features/gaze/evaluation/
  MotionDebugRecorder.ts
  MotionReplayPlayer.ts
  MotionMetrics.ts

src/pages/motionDebug/
  motionDebugReplayPanel.ts
  motionDebugMetricsPanel.ts
  motionDebugComparisonPanel.ts
```

report02 でも、`src/mocap/evaluation/MotionDebugRecorder.ts`、`MotionReplayPlayer.ts`、`MotionMetrics.ts` のような分割が提案されており、段階 1 は未加工の結果記録、最終姿勢記録、評価指標一覧画面、固定テスト系列から始めるべきとされています。

---

## 11. `motion-debug` UI 設計

### 11.1 記録パネル

必要な操作は次です。

```text
[記録開始]
[記録停止]
[ログを書き出す]
[要約を書き出す]
[表示フレームを記録]
```

表示項目:

- 記録継続時間
- フレーム数
- 欠落した / 重複フレーム数
- 現在のカメラ設定
- 現在の処理工程設定ハッシュ
- アバターの調整情報ハッシュ
- 推定したログ大きさ
- 現在の信頼性要約

### 11.2 再生パネル

```text
[ログを読み込む]
[基準設定で再生]
[候補設定で再生]
[一時停止]
[1フレーム進む]
[再生位置を移動]
[比較結果を書き出す]
```

比較 UI は次を表示します。

| UI                   | 内容                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| 時系列表示           | 一時欠損、反転、急増、入れ替え、意味に基づく動作ちらつきのイベント印 |
| 横並びの VRM         | 基準値 / 候補の同時再生                                              |
| スケルトン重ね表示   | 未加工の特徴点、標準化した目標、最終ボーン                           |
| 評価指標差分         | 合格 / 警告 / 不合格と差分                                           |
| 設定差分             | フィルタ / 信頼性 / アバターの調整情報 / 動作の変換設定の差分        |
| フレーム詳細確認画面 | 特定フレームの MediaPipe / 信頼性 / IK / finalPose                   |

### 11.3 品質確認パネル

```text
[失敗を記録]
[品質確認タグを追加]
[自然さを評価]
[安定性を評価]
[意図の伝わり方を評価]
[品質評価を保存]
```

QA タグは、`elbow_flip`、`shoulder_collapse`、`wrist_roll_noise`、`left_right_swap`、`recovery_snap`、`gesture_flicker`、`too_stiff`、`too_laggy`、`not_cute` などを固定語彙にします。

---

## 12. 実時間の調整に頼らない改善サイクル

推奨する運用サイクルは次です。

```text
1. 固定テストモーションを収録
   -> 未加工の結果ログ / 映像固定データ / アバターの調整情報を保存

2. 基準値評価指標を生成
   -> 要約 JSON と見た目の再生を保存

3. パラメータ変更
   -> 信頼性 / 時系列 / IK / アバターの調整情報 / 意味に基づく動作の設定ハッシュを変える

4. 同一ログで再生
   -> 候補評価指標を生成

5. 自動検査
   -> S0/S1 評価指標が悪化していないか確認

6. 横並びの QA
   -> 数値で拾えない自然さ、かわいさ、意図伝達を確認

7. 合格した設定を固定データと一緒に固定
   -> 回帰テストに追加

8. 新しい失敗例を探索的テストから回帰テストへ追加
```

重要なのは、探索的な実時間の調整を完全に禁止することではなく、**実時間ので見つけた失敗を必ず固定データ化し、次回以降は再生と評価指標で再検証できる状態にすること**です。

---

## 13. 実装順序

最短で価値が出る順序は次です。

| 段階 | 実装                                | 完了条件                                                              |
| ---: | ----------------------------------- | --------------------------------------------------------------------- |
|    1 | ログ概要情報 + フレーム NDJSON 公開 | MediaPipe 未加工の結果と finalPose を保存できる                       |
|    2 | 再生から未加工の結果                | ライブカメラなしで同じ finalPose を再生成できる                       |
|    3 | 評価指標要約                        | 中立姿勢での細かな揺れ / 肘反転 / 復帰時の急変 / 到達距離制限を出せる |
|    4 | 固定テスト固定データ                | P0 テストを同じ UI から再生・比較できる                               |
|    5 | 横並びの比較 UI                     | 基準値 / 候補を同時比較できる                                         |
|    6 | アバターの調整情報行列              | 小柄 VRoid / `upperChest` なしで同一ログ比較できる                    |
|    7 | QA フォームおよびタグ               | 主観評価を評価指標と同じ報告に保存できる                              |
|    8 | CI / 回帰結合                       | 固定データ再生の要約が閾値を超えたら検出できる                        |

この順序は、report03 の「記録・再生・デバッグ表示が最優先で、その後にキャリブレーション、信頼度、時系列、IK / 動作の変換、アバターの調整情報、意味に基づく動作動作へ進む」という実装順と整合します。

---

## 14. 最終推奨

`07-evaluation-debug-qa.md` に対する実装方針は、次の一文に集約できます。

**`motion-debug` を、現在状態を見るページから、同一入力ログを保存・再生・比較・採点する評価基盤へ拡張する。**

最初の実装単位は次で十分です。

```text
MotionDebugRecorder
  - 概要情報 + フレーム NDJSON
  - MediaPipe 未加工の結果
  - finalPose
  - カメラ設定
  - アバターの調整情報
  - 処理工程設定ハッシュ

MotionReplayPlayer
  - 未加工の結果再生
  - 固定 dt / mediaTime 時計
  - 基準設定と候補設定の再生

MotionMetrics
  - 中立姿勢での細かな揺れ
  - 肘の反転回数
  - 観測欠落からの復帰時の急変
  - 角速度の急増
  - 到達距離制限の発生率
  - 左右の入れ替わり回数
  - 意味分類のちらつき

MotionQA
  - 固定テスト一式
  - 主観的なスコア
  - 失敗タグ
  - アバター・カメラの組み合わせ
```

この基盤が先に入ると、以降の ReliabilityMap、TemporalStateEstimator、AvatarMotionProfile、Hand/Face ROI、意味に基づく動作動作の改善が、主観ではなく同一ログ・同一アバター・同一評価指標で比較できるようになります。

[1]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/pages/motionDebug "Sincromisor/sincromisor-frontend/src/pages/motionDebug at main · Sincromisor/Sincromisor · GitHub"
[2]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/package.json "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/pages/motionDebug/types.ts "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/pages/motionDebug/motionDebugFrameCapture.ts "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/pages/motionDebug/motionDebugCameraStream.ts "raw.githubusercontent.com"
[7]: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[8]: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google for Developers"
[9]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback "HTMLVideoElement: requestVideoFrameCallback() method - Web APIs | MDN"
[10]: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings "MediaStreamTrack: getSettings() method - Web APIs | MDN"
[11]: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer/web_js "Gesture recognition guide for Web  |  Google AI Edge  |  Google for Developers"
[12]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[13]: https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.gesturerecognizeroptions "GestureRecognizerOptions interface  |  Google AI Edge  |  Google for Developers"
