# TASK-3113 Sincro Pose のカメラ空間腕ターゲット正規化

- 作成日: 2026-05-14
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3111`, `TASK-3112`

## 目的

`TASK-3111` の肩・上半身・腕の低振幅 retarget を、簡易 IK が扱える「カメラ映像上の肩・肘・手首ターゲット」へ拡張する。

現状の `SincroPoseMotionSnapshot` は `upperArmLift` や `lowerArmFlex` などの特徴量を持つが、手首や肘を映像上の位置へ合わせるための target point を持たない。簡易 IK の前段として、MediaPipe PoseLandmarker の肩・肘・手首・腰ランドマークを、VRM retarget 層が読める安定した座標系へ正規化する。

## 背景

- `TASK-3111` では上半身と腕の動きが反映されるようになったが、腕ボーンへ低振幅 offset を足す方式であり、手首や肘の到達位置を解く IK ではない。
- `SincroPoseTracker` は 2D normalized landmarks を読んでいるため、追加の外部ライブラリなしでも簡易的な 2D / 擬似 3D ターゲットは作れる。
- ただし MediaPipe 生ランドマークを VRM controller へ直接渡すと責務境界が崩れるため、既存どおり snapshot を正本にする。

## スコープ

- `SincroPoseMotionSnapshot` に、左右腕ごとの shoulder / elbow / wrist target を追加する
- target は camera normalized 座標、肩幅基準の local 座標、visibility / presence、stale 状態を持つ
- 肩中心・肩幅・腰中心から、上半身 local coordinate を作る
- 左右反転、映像座標 Y 軸、肩幅スケールの扱いを `SincroPoseTracker` 内で正規化する
- target 欠損時は部位単位で `tracked=false` にし、既存の低振幅 retarget へ戻せる情報を保持する
- Debug Console に target availability / confidence / stale reason を出せる下地を用意する

## 非対象

- VRM ボーンへ IK を適用する実装
- 手指トラッキング
- `worldLandmarks` を使った本格 3D IK
- Kalidokit など外部 motion / IK ライブラリへの置き換え
- サーバー側 endpoint / JSON 契約の変更

## 実装方針

1. MediaPipe の raw landmark は `SincroPoseTracker` と Worker 内正規化処理の外へ出さない。
2. snapshot には「どの点をどの信頼度で使えるか」を明示し、VRM 側が推測で欠損判定しないようにする。
3. 初期段階では 2D normalized 座標を肩幅基準の local 座標へ変換し、奥行きは `z` が安定する範囲で optional に扱う。
4. target は neutral calibration を前提にせず、次タスクで IK solver がモデル側の腕長・基準姿勢と対応付ける。
5. コメントは、なぜ 2D target を使い、どの限界を受け入れているかを説明する。

## 実装対象候補

- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseMotionSnapshot.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroPoseTracker.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroTrackerWorkerTypes.ts`
- `sincromisor-frontend/src/ts/FaceTracking/sincro-tracker.worker.ts`
- `sincromisor-frontend/src/ts/App/SincroCharacterGazeController.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/**`

## 完了条件

- pose snapshot から左右の shoulder / elbow / wrist target を読み取れる。
- 片腕だけ画面外、手首だけ低 confidence、肩だけ検出などの状態を部位単位で表現できる。
- 既存の `SincroPoseRetargeter` は target 追加後もビルド・実行できる。
- Worker 経路と main-thread fallback 経路で同じ snapshot 契約を返す。
- Debug Console で target の検出状態と fallback reason を確認できる。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

## 手動確認観点

- `sincro` + Pose ON で、肩・肘・手首の target が腕の動きに合わせて変化する。
- 片腕を画面外に出すと、その腕だけ target unavailable になる。
- カメラに近い上半身構図でも target が極端に発散しない。
- Pose OFF では target が neutral / unavailable になり、face-only 同期が継続する。

## 後続検討

- `z` または `worldLandmarks` の安定性が十分なら、後続の簡易 IK で奥行き補正に使う。

## 完了メモ

- `SincroPoseMotionSnapshot` に左右腕の shoulder / elbow / wrist target を追加した。
- target は camera normalized 座標、肩中心・肩幅基準の local 座標、confidence / visibility / presence、stale reason を持つ。
- Worker 経路と main-thread fallback 経路は同じ `SincroPoseTracker` 正規化処理を使う。
- Debug Console の Sincro Motion panel で左右腕 target の availability と stale reason を確認できる。
- 確認: `cd sincromisor-frontend && npm run build`
