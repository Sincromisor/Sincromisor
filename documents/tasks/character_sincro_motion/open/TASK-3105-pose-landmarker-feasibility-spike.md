# TASK-3105 Pose Landmarker 実現性・性能検証 Spike

- 作成日: 2026-05-11
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3101`

## 目的

MediaPipe `PoseLandmarker` を Sincromisor の将来の手・腕・上半身同期に採用できるか、性能、精度、統合難度の観点で検証する。

## 背景

- 以前の環境では Pose Landmarker 相当の認識パフォーマンスがネックになっていた。
- 現在の `@mediapipe/tasks-vision` には `PoseLandmarker` が含まれており、Web/JS から `landmarks` と `worldLandmarks` を取得できる。
- ただし video 推論は同期的に実行されるため、メインスレッド負荷、フレーム落ち、Worker 化の必要性を実測で判断する必要がある。

## スコープ

- Pose Landmarker の minimal PoC を作成する
- Lite / Full など利用可能なモデルの初期候補を確認する
- `numPoses: 1`、`outputSegmentationMasks: false` で検証する
- 10fps / 15fps / 30fps 程度の推論間引きを比較する
- 推論時間、描画 FPS、UI 操作への影響を記録する
- 肩、肘、手首、胸相当の landmark が VRM retarget に使える品質か確認する
- 採用、延期、face-only 継続の判断をタスクへ記録する

## 非対象

- 本番 `SincroPoseTracker` 実装
- VRM 腕・肩 retarget の本格実装
- 手指トラッキング
- Holistic Landmarker 採用

## 実装方針

1. まず main thread PoC で最小計測を行う。
2. 明確に重い場合は Worker 化前提の設計メモを残し、本番実装へ進む条件を厳しくする。
3. segmentation mask は使わない。
4. full body が画面に入らない利用形態を想定し、上半身だけで肩・肘・手首が安定するか確認する。
5. FaceLandmarker と同時実行した場合の負荷を必ず観察する。

## 実装対象候補

- `sincromisor-frontend/src/ts/CharacterGaze/PoseLandmarkerSpike.ts` または一時的な検証用ファイル
- `sincromisor-frontend/public/3rd_party/README.md`
- `documents/tasks/character_sincro_motion/open/TASK-3105-pose-landmarker-feasibility-spike.md`

## 完了条件

- Pose Landmarker の推論時間と体感負荷が記録されている。
- FaceLandmarker 同時実行時の負荷リスクが記録されている。
- 上半身 retarget に使えそうな landmark と不安定な landmark が整理されている。
- `SincroPoseTracker` を続行するか、延期するか、条件付き採用するかの判断が書かれている。
- PoC 用コードを残す場合は本番ビルドや通常起動に影響しない。

## 確認観点

- 1280x720 と 390x844 相当で明らかな UI 停止がないか。
- Debug Console / Settings 操作中に入力遅延が増えないか。
- 顔のみ、上半身、腕を動かした時の landmark 安定性。
- カメラから近い距離、遠い距離、半身だけ映るケース。

## 判定目安

- 採用候補: FaceLandmarker 同時実行でも 10-15fps 推論で UI 操作と VRM 描画が破綻しない。
- 条件付き採用: Worker 化または低fps化すれば使えそう。
- 延期: face-only でも負荷が高い、または上半身 landmark が利用形態に合わない。

## 実施メモ 2026-05-11

### PoC 実装

- `sincromisor-frontend/src/ts/CharacterGaze/PoseLandmarkerSpike.ts` を追加した。
  - `PoseLandmarker` を `runningMode: "VIDEO"`、`numPoses: 1`、`outputSegmentationMasks: false` で初期化する。
  - Lite / Full / Heavy の配置候補を `/3rd_party/pose_landmarker_{lite,full,heavy}.task` として切り替え可能にした。
  - 10fps / 15fps / 30fps の推論間引き、CPU / GPU delegate、FaceLandmarker 同時実行を切り替えられる。
  - 推論時間、平均 / 最大推論時間、描画 FPS、FaceLandmarker 推論時間、video dropped frame、肩・肘・手首・腰の visibility を計測する。
- `sincromisor-frontend/src/pose-landmarker-spike/index.html` を追加した。
  - Vite dev server で `http://127.0.0.1:5173/pose-landmarker-spike/` を直接開く検証専用ページ。
  - `vite.config.js` の production input には追加していないため、通常画面の起動経路には入らない。
- `sincromisor-frontend/public/3rd_party/README.md` に PoseLandmarker model の配置候補を追記した。

### モデル候補

- Google AI Edge の Pose Landmarker docs では Lite / Full / Heavy の model bundle が案内されている。
- Web guide では `detectForVideo()` が同期実行で main thread をブロックするため、video 推論では Worker 化が負荷対策候補になると明記されている。
- 上半身 retarget 候補 landmark:
  - 肩: `left_shoulder`(11), `right_shoulder`(12)
  - 肘: `left_elbow`(13), `right_elbow`(14)
  - 手首: `left_wrist`(15), `right_wrist`(16)
  - 胸相当の推定基準: 肩左右 midpoint と腰左右 midpoint から torso 軸を推定する

### ローカル確認

- `npm run build`: 成功。
- Playwright 表示確認:
  - Desktop相当: `http://127.0.0.1:5173/pose-landmarker-spike/` が表示される。
  - 390x844相当: controls / metrics が縦積みで表示され、console error は 0 件。
  - UI Latency Mark: 9.0ms を確認。

### 未実測・制約

- この作業環境には `public/mediapipe-wasm`、`pose_landmarker_*.task`、`face_landmarker.task` が未配置のため、実カメラによる Pose 推論時間と FaceLandmarker 同時実行負荷は未実測。
- 実測時は `utils/setup/frontend.sh` で wasm を配置し、`public/3rd_party/pose_landmarker_lite.task` から順に配置して検証する。
- 1280x720 と 390x844 の推論負荷、Settings / Debug Console 操作遅延、上半身のみ・近距離・半身ケースの landmark 安定性は、実カメラ環境で追記する。

### 暫定判断

- 現時点では `SincroPoseTracker` の本番実装へは進めず、条件付き採用候補のまま保留する。
- 続行条件:
  - Lite 10-15fps + FaceLandmarker 同時実行で UI 操作と VRM 描画が破綻しない。
  - 肩・肘・手首の visibility が上半身のみの利用形態で概ね安定する。
  - 30fps または Full / Heavy が重い場合でも、低fps化または Worker 化で face-only を巻き込まず停止できる見通しがある。
