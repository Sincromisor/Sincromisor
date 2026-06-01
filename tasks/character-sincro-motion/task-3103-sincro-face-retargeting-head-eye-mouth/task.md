# TASK-3103 Sincro Face Retargeting（頭部・目・口）

- 作成日: 2026-05-11
- ステータス: Done
- 優先度: Critical
- 親タスク: `TASK-3100`
- 依存: `TASK-3102`

## 目的

`SincroFaceTracker` の正規化 snapshot を VRM の head / eye / mouth expression へ変換し、`sincro` モードでユーザーの顔の動きにキャラクターが追従する最初の体験を作る。

## 背景

- `chat` の現行実装は「画面内の顔位置を見る」ための首・目線制御であり、同じ頭部回転や口形を再現するものではない。
- FaceLandmarker の head pose と blendshape を直接 VRM に適用すると、モデル差、軸差、ノイズ、過大回転により破綻しやすい。
- 技術的負債を避けるため、MediaPipe 結果と VRM 適用の間に Retargeter を置く。

## スコープ

- `SincroFaceRetargeter` または head / eye / mouth 別 retargeter を追加する
- head pose を VRM の `neck` / `head` / `upperChest` へ安全に反映する
- blink blendshape を VRM の blink expression または eye bone fallback へ反映する
- mouth blendshape を `aa/ih/ou/ee/oh` など既存 `FaceMorphController` と整合する形で反映する
- neutral calibration、clamp、smoothing、deadband、confidence gate を実装する
- pitch / yaw / roll の符号、ミラー方向、neutral calibration を固定 snapshot で検証できるようにする
- retargeter の純粋関数部分に小さな単体テスト、または固定 snapshot の検証ケースを追加する
- 顔未検出時は急に停止せず、ニュートラルへ滑らかに戻す

## 非対象

- Pose Landmarker による肩・腕同期
- 高精度な視線推定
- 手指・腕の同期
- VRM モデル固有の個別プロファイル UI

## 実装方針

1. `sincro` の retarget は `chat` の AI 発話 gesture や thinking aversion より優先する。
2. head pose は首だけに全量を入れず、利用可能なボーンに分配する。
3. pitch / yaw / roll はモデル差を考慮して小さめの初期上限から始める。
4. mouth はまず `jawOpen` / `mouthClose` / `mouthFunnel` / `mouthPucker` / smile 系から VRM 標準 vowel expression へ近似する。
5. `FaceMorphController` の telop 口パクと競合しないよう、`sincro` モードではユーザー口形を優先する。
6. Retargeter は MediaPipe の category 名に依存しすぎないよう、欠損時は値0として扱う。
7. calibration と軸変換は UI や controller に散らさず、retargeter 内のテスト可能な関数へ寄せる。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/EyeBehaviorController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceEmotionController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/SincroFaceRetargeter.ts` または同等の新規ファイル
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`

## 完了条件

- `sincro` モードでユーザーの頭部 yaw / pitch / roll がキャラクターに反映される。
- まばたきと口の開閉が、ユーザーの顔動作に追従する。
- `chat` モードの首追従、目線、口パク、AI 発話 gesture が壊れない。
- 顔未検出・低 confidence・expression 欠損時に例外停止しない。
- 追従が過敏すぎず、ノイズで震え続けない。
- 固定 snapshot 検証で、yaw / pitch / roll の符号、左右ミラー、neutral 差分が期待通りである。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- 顔を左右へ向けると、キャラクターも同じ方向へ向く。
- 顔を上下へ向けると、キャラクターも自然な範囲で上下へ向く。
- 首を傾けると、roll が過剰でない範囲で反映される。
- 口を開く、閉じる、すぼめる動きが VRM の口形へ反映される。
- blink expression が無い VRM でも停止しない。
- カメラ映像のミラー表示有無に関わらず、`sincro` の左右方向が意図通りになる。

## 実施メモ

- `SincroFaceRetargeter` を追加し、`faceMotion` snapshot から head / blink / look / mouth の VRM 向け値を生成する層を分離した。
- neutral calibration、clamp、deadband、confidence gate、smoothing、顔未検出時の neutral return を retargeter 内へ集約した。
- head pose は `upperChest` / `neck` / `head` へ分配し、該当ボーンが無い場合は既存 head control fallback に合算適用する。
- `EyeBehaviorController` は `sincro` 中に retarget 済み look / blink を優先し、blink expression が無い場合は eye bone fallback で停止しない。
- `FaceMorphController` は `sincro` 中に telop 口パクを抑制し、ユーザー口形 retarget の `aa/ih/ou/ee/oh` を優先する。
- `SincroFaceRetargeterVerification.ts` に固定 snapshot 検証ケースを追加し、yaw / neutral / mouth / blink の期待値を型付きで残した。
- 確認: `cd sincromisor-frontend && npm run build` 成功。

## 未確認

- 実カメラ + `face_landmarker.task` 配置状態での左右符号、roll、モデル別 expression の体感確認。
