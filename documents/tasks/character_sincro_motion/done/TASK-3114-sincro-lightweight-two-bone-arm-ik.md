# TASK-3114 Sincro 簡易 Two-Bone Arm IK Retargeter

- 作成日: 2026-05-14
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3113`

## 目的

カメラ映像上の肩・肘・手首 target に合わせて、VRM の上腕・前腕を簡易的に追従させる。

`TASK-3111` の腕 motion は特徴量をボーン回転へ足す方式だったため、ユーザーが手首を画面上で動かしても、キャラクターの手先位置は大まかな雰囲気に留まる。本タスクでは新規外部ライブラリへ置き換えず、既存 `SincroPoseRetargeter` の内側に軽量な two-bone IK 風 solver を追加する。

## 背景

- ユーザーは task-3111 の動作を「上半身・腕の簡易モーション」として評価しているが、IK にはなっていない。
- 目的は高精度な全身 IK ではなく、上半身が映るカメラ構図で「手首・肘が画面上の位置に近づく」こと。
- VRM 個体差、腕長、肩幅、初期ポーズ差があるため、solver は強い clamp、smoothing、confidence gate を持つ必要がある。

## スコープ

- `SincroPoseRetargeter` に lightweight arm IK mode を追加する
- 左右腕ごとに shoulder / elbow / wrist target から上腕・前腕の回転目標を算出する
- VRM の normalized bone node から上腕・前腕・手の基準長を取得し、target をモデル側スケールへ対応付ける
- 肘 pole direction を camera-space elbow target から近似し、肘の曲がる向きを安定させる
- IK 結果と `TASK-3111` の低振幅 retarget を blend し、target 欠損時は既存 retarget または neutral へ戻す
- 左右別の confidence gate、最大上腕リフト、最大開き、最大前腕屈曲、return-to-neutral を設定可能にする

## 非対象

- 全身 IK
- 肩甲骨、鎖骨、手指を含む高精度 solver
- `worldLandmarks` 前提の 3D IK 本実装
- 外部 motion retarget ライブラリへの置き換え
- 既存の `ArmBoneController` / `CharacterMotionOrchestrator` 全面再設計

## 実装方針

1. IK solver は `SincroPoseRetargeter` または同階層の小さな helper に閉じ込め、controller は retarget 済み frame だけを読む。
2. 最初は screen-space 2D の到達方向を優先し、奥行き方向は控えめな補正に留める。
3. VRM の腕長・肩幅を起動時に測り、ユーザーの肩幅基準 target をモデル長へ正規化する。
4. `allowPoseRetarget=false`、低 confidence、stale、片腕欠損では、部位単位で IK を無効化する。
5. 急な手先ジャンプを避けるため、IK target と rotation result の両方に smoothing と max delta を入れる。
6. コメントは、数学的な近似、座標系、破綻時 fallback の意図を説明する。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroPoseRetargeter.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/SincroVRMInitializer.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/debug/**`

## 完了条件

- Pose ON の `sincro` で、手首を上下左右へ動かしたときキャラクターの腕先が同方向へ追従する。
- 肘を曲げる動きが、前腕屈曲だけでなく肘 target の方向にも影響する。
- 片腕 target が欠損した場合、その腕だけが既存 retarget または neutral へ戻る。
- IK 強度を 0 にすると `TASK-3111` 相当の低振幅 retarget に戻せる。
- 腕が体を大きく貫通する、肩が極端にねじれる、手首が瞬間移動する挙動が目立たない。
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
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

## 手動確認観点

- 片手を上げる、横へ開く、肘を曲げる、両手を左右非対称に動かす。
- 腕を画面外へ出して戻した時、復帰時に腕が跳ねない。
- VRM 初期ポーズや腕長が異なるモデルでも、破綻せず低強度で追従する。
- `chat` モードの注視、AutoMute、AI speech gesture が壊れていない。

## 後続検討

- 2D solver の限界が目立つ場合は、`worldLandmarks` を使った奥行き推定を別タスクで検証する。
