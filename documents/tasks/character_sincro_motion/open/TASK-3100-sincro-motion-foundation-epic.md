# TASK-3100 Sincro モーション基盤 Epic

- 作成日: 2026-05-11
- ステータス: Open
- 優先度: Critical
- 前提タスク: `TASK-3048`

## 目的

Sincromisor 本来の目的である `sincro`（ものまね / 同期）モードのキャラクターモーション基盤を再設計し、`chat` と `sincro` が同じ動きをする暫定実装を解消する。

`chat` は対話相手の顔を認識してキャラクターが相手を見る。`sincro` はカメラ内のユーザーの顔・将来的には上半身の動きを推定し、キャラクターが同じ動きをする。この2つを入力信号、状態、VRM retarget、モーション orchestration の層で明確に分け、今後の手・腕・上半身同期へ拡張できる基底を作る。

## 背景

- `TASK-3048` のキャラクター対話存在感強化は完了済みとして扱い、3100 系はその成果物である `CharacterBehaviorState`、`CharacterMotionOrchestrator`、eye / idle / AI speech motion を前提にする。
- 現状の `CharacterGaze` は MediaPipe `FaceDetector` の6点キーポイントを使い、顔位置を「注視対象」として扱う。
- `HeadBoneController` / `EyeBehaviorController` はその顔位置を使って、相手を見る `chat` 向けの動きを作っている。
- `sincro` で必要なのは「相手を見る」ではなく「自分と同じ顔・姿勢にする」ことであり、頭部姿勢、まばたき、口形、表情、肩、腕など別種の入力が必要になる。
- `@mediapipe/tasks-vision` には `FaceLandmarker` と `PoseLandmarker` が含まれているため、顔同期は `FaceLandmarker`、上半身同期は `PoseLandmarker` を段階的に検証できる。
- Pose Landmarker は将来性が高い一方、過去検証では認識パフォーマンスが課題だったため、最初から中核に据えず optional pipeline と性能ゲートを設ける。

## 関連設計

- `documents/design/frontend_character.md`
- `documents/design/frontend_migration_react.md`
- `documents/design/networking_rtc.md`
- `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- `sincromisor-frontend/src/ts/App/SincroCharacterGazeController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/EyeBehaviorController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/ts/UI/DialogManager.ts`

## スコープ

- `chat` と `sincro` のキャラクターモーション入力を設計上分離する
- `SincroFaceTracker` を `sincro` の顔同期本流として設計・実装する
- `FaceLandmarker` の head pose / blendshape を VRM 向け snapshot へ正規化する
- VRM retarget 層を用意し、頭部、目、まばたき、口形を段階的に同期する
- `PoseLandmarker` は `SincroPoseTracker` として将来拡張の optional pipeline にし、性能検証後に採否を決める
- `CharacterBehaviorState` または後継の状態集約層を、注視用 gaze と同期用 face/pose motion を扱える形に拡張する
- Debug Console / Settings / 設計文書を、新しいモード分離に追従させる

## 非対象

- WebRTC signaling endpoint / JSON 契約の変更
- サーバー側音声認識、音声合成、Text Processor の大規模変更
- VRM モデルファイルそのものの修正
- 手指の高精度トラッキングの本実装
- Holistic Landmarker を中核に据える実装
- Looking Glass 固有の最適化

## 設計方針

1. `chat` は `AttentionFaceTracker` 相当の入力で、対話相手の顔位置・在席・AutoMute を扱う。
2. `sincro` は `SincroFaceTracker` を本流とし、顔ランドマーク、顔姿勢、blendshape を扱う。
3. `SincroPoseTracker` は optional とし、肩・腕・上半身同期のための拡張点として分離する。
4. MediaPipe の生結果を VRM controller が直接読まない。必ず正規化 snapshot と retarget 層を通す。
5. retarget は neutral calibration、clamp、deadband、smoothing、confidence gate を持つ。
6. Pose 推論は顔同期より低頻度でよい。描画は60fps、推論は10-15fps程度から検証する。
7. 重い推論は Web Worker 化を前提に設計し、メインスレッド版は PoC または fallback に留める。
8. 端末性能が不足する場合は、`face-only` へ自動降格できる構造にする。
9. `chat` の自然な対話演出と `sincro` の同期性が混ざって不自然にならないよう、モード別に motion priority を分ける。

## 実装分割

1. `TASK-3101`: 同期モーション全体の設計文書と用語整理を行う。
2. `TASK-3102`: 顔トラッキング runtime と `SincroFaceTracker` の入力基盤を実装する。
3. `TASK-3103`: `SincroFaceTracker` の head / eye / mouth retarget を実装する。
4. `TASK-3104`: `chat` / `sincro` のモード別 motion orchestration を分離する。
5. `TASK-3105`: `PoseLandmarker` の性能・精度・統合可能性を検証する。
6. `TASK-3106`: 採用可能なら optional `SincroPoseTracker` と性能ゲートを実装する。
7. `TASK-3107`: Debug / Settings / 確認・設計同期を行い、運用可能な状態に磨く。

## 子タスク

- Done: `documents/tasks/character_sincro_motion/done/TASK-3101-sincro-motion-architecture-and-design-doc.md`
- Open: `documents/tasks/character_sincro_motion/open/TASK-3102-face-tracking-runtime-and-sincro-face-tracker.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3103-sincro-face-retargeting-head-eye-mouth.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3104-talk-mode-aware-character-motion-orchestration.md`
- Open: `documents/tasks/character_sincro_motion/open/TASK-3105-pose-landmarker-feasibility-spike.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3106-optional-sincro-pose-tracker-and-performance-gates.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3107-sincro-motion-observability-settings-and-verification.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3108-sincro-head-pitch-direction-fix.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3109-sincro-separate-blink-expression-calibration.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3110-sincro-blink-open-threshold-tuning.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3111-sincro-pose-retarget-formalization-and-tuning.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3112-sincro-tracker-workerization-and-load-isolation.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3113-sincro-pose-camera-space-arm-targets.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3114-sincro-lightweight-two-bone-arm-ik.md`
- Done: `documents/tasks/character_sincro_motion/done/TASK-3115-sincro-pose-upper-body-anchor-and-ik-fallback.md`
- Open: `documents/tasks/character_sincro_motion/open/TASK-3116-sincro-pose-ik-observability-verification-and-design-sync.md`

## 完了条件

- `chat` と `sincro` でキャラクターの入力解釈と motion priority が分かれている。
- `sincro` で FaceLandmarker 由来の頭部姿勢、まばたき、口形が VRM に反映される。
- `chat` の既存注視、自動ミュート、AI 発話 motion が壊れない。
- active session 中の `talkMode` 切替時に、RTC を再接続する条件と local motion だけ切り替える条件が設計・実装上明確である。
- camera track、preview video、MediaPipe tracker loop の所有権が明確で、二重 `getUserMedia` や二重推論 loop が残らない。
- FaceLandmarker の推論時間、推論 fps、main thread 負荷、fallback 条件が確認されている。
- Pose Landmarker の採用可否が、計測値と設計判断として残っている。
- Pose を採用する場合も、低性能端末では face-only へ降格できる。
- MediaPipe 生データ、VRM retarget、motion orchestration の責務境界が明確である。
- PoseLandmarker 由来の腕同期は、低振幅 retarget から簡易 IK へ拡張する場合も snapshot / retarget / controller の境界を維持する。
- 簡易 IK は外部 motion 制御ライブラリへの全面置換ではなく、既存 `SincroPoseRetargeter` 系の局所拡張として扱う。
- 複数 VRM で、存在しないボーンや expression により例外停止しない。
- `cd sincromisor-frontend && npm run build` が成功する。
- `documents/design/frontend_character.md` が新しい構成に更新されている。

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

- `chat` ではキャラクターがユーザーを見ているように動く。
- `sincro` ではキャラクターがユーザーの頭部方向、まばたき、口の開閉に追従する。
- `sincro` 中に AI 発話 gesture や idle motion が同期感を邪魔しない。
- 顔未検出時に急なスナップや不自然な固定が起きず、ニュートラルへ戻る。
- カメラ入力が不安定でも首・目・口が細かく震え続けない。
- Debug Console / Settings の表示が新しい状態を切り分けやすい。
- backend 未起動でも VRM 表示と face-only 検証が可能である。

## 技術的負債を残さないための注意

- `CharacterGaze` に sincro 用の責務を無理に足さない。注視と同期は分ける。
- MediaPipe の戻り値名をそのままアプリ全体へ漏らさず、内部 snapshot へ正規化する。
- モード判定を各 controller に散らさず、上位 orchestration または状態 snapshot に寄せる。
- 推論 loop を controller ごとに乱立させない。起動、停止、カメラ差し替え、エラー処理を共通化する。
- Worker 化できる境界を最初から意識し、DOM 依存を tracker 本体へ持ち込まない。
- コメントは Google TypeScript style に沿い、処理の逐語説明ではなく、設計上の理由や制約を説明する。
