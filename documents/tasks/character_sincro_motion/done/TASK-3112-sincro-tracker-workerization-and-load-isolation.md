# TASK-3112 Sincro Tracker の Worker 化とロード分離

- 作成日: 2026-05-12
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3102`, `TASK-3106`, `TASK-3111`

## 目的

`sincro` モードの FaceLandmarker / PoseLandmarker 推論と model 初期化による main thread ブロックを減らし、VRM 描画、Settings / Debug Console 操作、会話 UI の応答性を保ったまま顔・姿勢同期を継続できるようにする。

## 背景

- `TASK-3100` では、重い推論は Web Worker 化を前提に設計し、main thread 版は PoC または fallback に留める方針としていた。
- `TASK-3105` では、MediaPipe Tasks Vision の `detectForVideo()` が同期実行で main thread をブロックするため、実測に応じて Worker 化する必要があると整理した。
- `TASK-3106` / `TASK-3111` で optional Pose pipeline と retarget は成立したが、実カメラでは Face + Pose 同時実行がそれなりに重く、ロード時にも main thread の停止感がある。
- 現在の `TrackerRuntime` は DOM / UI 更新を tracker core から外しており、Worker 化しやすい境界にはなっているが、実際の `FaceLandmarker` / `PoseLandmarker` 初期化と推論は main thread 上で実行している。

## スコープ

- Face / Pose tracker を Worker 実行できる構成へ分離する
- Worker 内で MediaPipe Fileset / FaceLandmarker / PoseLandmarker を初期化する
- main thread から Worker へ video frame を渡す転送方式を選定・実装する
    - 第一候補: `createImageBitmap(video)` + Transferable
    - 必要に応じて `OffscreenCanvas` / `VideoFrame` / main thread fallback を比較する
- Worker から `SincroFaceMotionSnapshot` / `SincroPoseMotionSnapshot` 相当の正規化済み snapshot だけを返す
- `TrackerRuntime` から見た callback 契約をなるべく維持し、VRM controller / Debug UI へ MediaPipe の Worker 詳細を漏らさない
- Worker 初期化中の UI 状態、ロード中表示、失敗時 fallback を Debug Console で確認できるようにする
- Worker 未対応ブラウザ、初期化失敗、転送失敗では現行 main thread tracker または face-only へ戻れるようにする
- load / inference / dropped frame / UI latency を比較できる計測を追加する
- `documents/design/frontend_character.md` に Worker 化後の tracker 境界を同期する

## 非対象

- 全身 IK の本格実装
- 手指トラッキング
- Holistic Landmarker への置き換え
- `worldLandmarks` を使った高精度 3D retarget の本実装
- VRM 描画自体の Worker / OffscreenCanvas 化
- サーバー側 endpoint / JSON 契約の変更
- WebRTC signaling の変更

## 実装方針

1. Worker 化しても、アプリ内部の正本は `SincroFaceMotionSnapshot` / `SincroPoseMotionSnapshot` のまま維持する。
2. Worker は MediaPipe 実行と正規化だけを担当し、DOM、DebugConsole、VRM controller、Dialog 設定を直接参照しない。
3. main thread は camera track / video element の所有、fps 制限、fallback 判定、snapshot の配送を担当する。
4. frame 転送コストが推論削減効果を上回らないよう、Face / Pose の目標 fps を個別に制御する。
5. Worker 初期化は lazy に行い、`sincro` で必要になった時だけ起動する。Pose OFF の場合は PoseLandmarker を Worker 内でも初期化しない。
6. Worker が利用できない環境では main thread 版へ fallback し、現行動作を保つ。
7. コメントは、なぜ Worker 境界・転送方式・fallback を選ぶかという制約を説明する。

## 実装対象候補

- `sincromisor-frontend/src/ts/FaceTracking/TrackerRuntime.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroFaceTracker.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseTracker.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroFaceMotionSnapshot.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseMotionSnapshot.ts`
- `sincromisor-frontend/src/ts/FaceTracking/MediaPipeVisionFileset.ts`
- `sincromisor-frontend/src/ts/FaceTracking/*worker*.ts`（新規）
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/**`
- `documents/design/frontend_character.md`

## 完了条件

- `sincro` の FaceLandmarker / PoseLandmarker 推論を Worker 経由で実行できる。
- Worker 経由でも head / blink / mouth / pose retarget が現在の snapshot 契約で VRM に反映される。
- Pose OFF の場合、PoseLandmarker が Worker 内でも初期化されない。
- Worker 初期化失敗時に UI 全体が停止せず、main thread fallback または face-only へ戻れる。
- model 初期化中の状態、Worker 使用状態、推論時間、fallback reason を Debug Console で確認できる。
- main thread 版と Worker 版の load / inference / UI latency を比較できる。
- 実カメラで Face + Pose 同時実行時の UI 操作遅延が軽減されている。
- `chat` モードの CharacterGaze / AutoMute / AI speech gesture が壊れていない。
- `cd sincromisor-frontend && npm run build` が成功する。
- desktop / mobile viewport で Settings / Debug Console の表示崩れがない。
- `documents/design/frontend_character.md` が Worker 化後の tracker 境界に更新されている。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

```sh
playwright-cli open http://127.0.0.1:5173/simple-vrm/
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

## 手動確認観点

- `sincro` 開始時、モデルロード中に Settings / Debug Console が完全停止しない。
- Face-only と Pose ON の両方で Worker 使用状態が分かる。
- Pose ON で肩・胴体・腕の低振幅 retarget が維持される。
- Pose OFF にした時、face-only は継続し、Pose worker 初期化・推論が止まる。
- Worker を意図的に失敗させても、main thread fallback または face-only に戻る。
- Debug Console を開いた状態で推論・描画が極端に重くならない。

## 後続検討

- Worker 化後も PoseLandmarker の転送コストが高い場合は、Pose の既定 OFF、より低 fps、または `worldLandmarks` / Kalidokit 等の別 retarget 方式を別タスクで比較する。
