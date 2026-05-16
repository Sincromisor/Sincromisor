# TASK-260517024504 Sincro Pose の world landmarks 3D target 化

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3113`, `TASK-260517014025`

## 目的

本格 IK の前提として、現在の screen-space 2D target を、MediaPipe PoseLandmarker の `worldLandmarks` を含む 3D target snapshot へ拡張する。

現在の `SincroPoseRetargeter` は肩・肘・手首の 2D 画面座標から腕回転を近似しているため、手先位置をモデル空間で拘束できない。IK solver を本格化する前に、入力 snapshot 側で「カメラ画像上の座標」「MediaPipe world 座標」「VRM 正規化空間へ変換するための品質情報」を分けて保持できるようにする。

## 背景

- `TASK-3114` の簡易 IK は screen-space 2D の軽量近似であり、手首位置を厳密に満たす IK ではない。
- MediaPipe PoseLandmarker は image coordinates と 3D world coordinates を出力できる。
- 3D IK では target 座標系、肩幅/腕長スケール、左右反転、カメラ奥行き、confidence gate を明確に分けないと、モデル差や構図差で破綻しやすい。

## スコープ

- `SincroPoseTargetPointSnapshot` に 3D target 情報を追加する
- `SincroPoseTracker` / Worker 経路で `worldLandmarks` を取り込み、肩・肘・手首・腰・膝・足首を正規化する
- 既存 2D target と 3D target を併存させ、簡易 IK と新 IK の比較ができるようにする
- 3D target の品質情報を `tracked` / `usableForIk` とは別に表現する
- Debug Console で 2D target と 3D target の有無・confidence・座標系・fallback reason を切り分けられるようにする
- 設計文書へ `worldLandmarks` と VRM target space の責務境界を反映する

## 非対象

- IK solver 本体の実装
- 外部 IK ライブラリの導入
- full-body retarget の完成
- サーバー側 endpoint / JSON 契約変更

## 実装方針

1. 既存の 2D target 契約は壊さず、3D target を optional field として追加する。
2. MediaPipe の生 `worldLandmarks` を VRM controller へ直接渡さず、`SincroPoseMotionSnapshot` の内部契約へ正規化する。
3. 座標系の意味をコメントで明記する。
    - image normalized coordinate
    - MediaPipe world coordinate
    - shoulder/hips anchor 基準の local target
    - VRM rig scale へ変換する前の normalized target
4. 3D target は `hasWorldCoordinates`、`worldQuality`、`worldIkWeight`、`worldStaleReason` のように、2D target とは別 gate を持つ。
5. 手首や肘の confidence が低い場合でも、座標が有限であれば weak 3D target として扱える余地を残す。

## 実装対象候補

- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseMotionSnapshot.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseTracker.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroTrackerWorkerTypes.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroTrackerWorkerClient.ts`
- `sincromisor-frontend/src/ts/FaceTracking/sincro-tracker.worker.ts`
- `sincromisor-frontend/src/ts/FaceTracking/sincroPoseTargetPoint.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/panels/SincroMotionPanel.tsx`
- `documents/design/frontend/character/tracking.md`
- `documents/design/frontend/character/motion.md`

## 完了条件

- `SincroPoseMotionSnapshot` で 2D target と 3D target を同時に観測できる。
- Worker / main-thread のどちらでも `worldLandmarks` が欠落・存在するケースを安全に扱える。
- Debug Console で「Pose は検出しているが world target がない」「world target はあるが IK には weak」「完全欠損」を切り分けられる。
- 既存の簡易 IK / feature retarget は 3D target がなくても動作を維持する。
- `cd sincromisor-frontend && npm run build` が成功する。

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
```

## 手動確認観点

- 実カメラで肩・肘・手首の 2D / 3D target が Debug Console に出る。
- 近距離上半身、片腕欠損、腕を画面外へ出した状態で world target gate が説明可能な fallback reason を出す。
- Firefox / Chrome で PoseLandmarker delegate 差分により snapshot 形式が壊れない。

## 後続

- `TASK-260517024505` で、この 3D target を入力に VRM normalized bone 向けの 3D two-bone IK solver を実装する。
