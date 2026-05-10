# TASK-3048 キャラクター挙動と対話存在感の表現強化 Epic

- 作成日: 2026-05-08
- ステータス: Done
- 優先度: High

## 目的

現状の VRM キャラクター表現が首追従、口形、表情プリセット中心に留まっているため、カメラ、音声、VAD、DataChannel、LLM 由来の感情コードを統合し、対話している空気感が伝わる自然なキャラクター挙動へ拡張する。

本プロダクトは趣味プロダクトであり、現時点で最良と思える体験を作ることを優先する。後方互換性への配慮は必要最小限に留め、最小変更にこだわらず、将来の表現拡張に耐える設計へ整理する。

## 背景

- 現状のキャラクター表現は、`CharacterGaze` 由来の首追従、`telop_ch` 由来の口形、`text_ch.expression_code` 由来の表情プリセットが中心である。
- 腕や手は `ArmBoneController` に固定待機ポーズとごく小さい揺れがあるが、ユーザーの発話、AI の発話、考え中、在席状態などの対話状態とは連動していない。
- 目の動きは独立した表現として未実装であり、首だけで相手を見るため、視線の生き物らしさが不足している。
- `UserMediaManager` には VAD の `isSpeech/rms/peak`、`CharacterGaze` には顔位置、正面度、在席判定、`TalkManager` には text/telop イベントがあるため、まずはフロント側の状態合成だけでも大きく改善できる。
- 単発のボーン制御を積み増すと技術的負債になりやすいため、状態統合レイヤーとモーション生成レイヤーを分け、自然さを検証しながら段階的に実装する。

## 関連設計

- `documents/design/frontend_character.md`
- `documents/design/frontend_vad.md`
- `documents/design/networking_rtc.md`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceEmotionController.ts`
- `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- `sincromisor-frontend/src/ts/RTC/TalkManager.ts`
- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`

## スコープ

- キャラクター用の対話状態モデルを追加する
- VAD、顔検出、telop、text、感情コードをキャラクター表現へ統合する
- 目線、まばたき、注視、視線外しなどの eye behavior を追加する
- 呼吸、重心移動、肩、胸、背骨、腕、手首を含む上半身モーションを追加する
- ユーザー発話中、AI 発話中、考え中、待機中、顔検出入退出時の反応を設計する
- 不自然な動き、過剰な揺れ、VRM 個体差による破綻を抑える
- 実装後に `frontend_character.md` を更新する

## 非対象

- サーバー側音声認識、音声合成、LLM 応答生成の大規模変更
- WebRTC シグナリング endpoint の変更
- VRM モデルそのものの作成、改変、配布
- Looking Glass 固有演出の新規設計
- 表情やモーションの UI チューニング画面の大規模追加

## 設計方針

1. キャラクター表現用の状態を `CharacterBehaviorState` のような専用モデルへ集約する。
2. `TalkManager`、`UserMediaManager`、`CharacterGaze`、`FaceEmotionController` などから直接ボーンを叩かず、状態モデルを通してモーションへ変換する。
3. `CharacterMotionOrchestrator` のような層を追加し、毎フレームの目標姿勢、目線、表情補助値、ジェスチャーを決める。
4. 各 BoneController は固定ポーズの上書きではなく、状態に応じた目標値へ補間する責務へ移行する。
5. 後方互換性よりも設計の明快さを優先し、既存 controller が責務過多なら分割または作り直す。
6. 自然さを最重要品質として扱い、強い動きよりも、低振幅、適度な遅延、ランダム性、状態遷移の滑らかさを優先する。
7. モデル差に強い実装にするため、存在しないボーンや expression は安全に無視し、利用可能な範囲で表現する。

## 想定する対話状態

- `idle`: 待機中。呼吸、微小な重心移動、自然なまばたき。
- `attending`: 顔検出中。ユーザーを見ているが、発話はない。
- `user_speaking`: ユーザー発話中。聞き姿勢、軽い前傾、視線維持、過度でない相槌準備。
- `thinking`: ユーザー発話後から AI 応答前。視線を少し外す、短い思案姿勢、落ち着いた戻り。
- `ai_speaking`: AI 発話中。口形、頭のアクセント、文節単位の手振り、感情姿勢。
- `face_lost`: 顔が消えた後。急に無反応にせず、少し待ってからニュートラルへ戻す。
- `error_or_disconnected`: 接続異常時。動きは控えめにし、UI 側のエラー表示を邪魔しない。

## 入力信号

- `CharacterGaze`
  - 顔検出有無
  - 鼻位置または顔中心位置
  - `facing()` による正面度
  - arrive/leave イベント
- `UserMediaManager`
  - `VadStateReport.isSpeech`
  - `rms`
  - `peak`
  - 学習 VAD の speech probability
- `TalkManager`
  - `text_channel_message`
  - `telop_channel_message`
  - `currentMora()`
- `ChatMessage`
  - `message_type`
  - `speech_id`
  - `expression_code`
- `TelopChannelMessage`
  - `speech_id`
  - `vowel`
  - `text`
  - `length`
  - `new_text`

## 目の動きの方針

- 首追従とは別に、目線の micro behavior を追加する。
- VRM 標準の `lookUp/lookDown/lookLeft/lookRight` expression が使える場合は、それを優先して視線を表現する。
- VRM の humanoid eye bones または VRM lookAt が扱える場合は、モデル差を確認した上で eye bone または lookAt 制御を検討する。
- 目線は常にユーザーへ固定せず、以下を混ぜる。
  - ユーザー発話中は視線維持を強める
  - 考え中は 0.4 秒から 1.2 秒程度、斜め上または横へ視線を外す
  - AI 発話中は文節の切れ目で短い視線移動を入れる
  - 顔が画面端へ移動した場合は、首より先に目線が追い、少し遅れて首が追う
  - 長時間固定を避けるため、低頻度の microsaccade を入れる
- まばたきは完全ランダムではなく、状態に応じて頻度を変える。
  - 通常待機: 自然な間隔
  - ユーザー発話開始直後: 少し抑制
  - 考え中: やや増やす
  - surprised: 短く目を開く方向の表情があれば優先
- 目線変化は急激にしない。補間、clamp、deadband を必ず持つ。

## 自然さの制約

- 首、目、上半身、腕が同時に大きく動かないようにする。
- 動きの開始と終了に easing を入れる。
- ランダム性は seed なしの完全な揺れではなく、状態ごとの範囲に制限する。
- 音量や VAD に対して 1 フレーム単位で直結せず、短い envelope と hold を通す。
- 顔検出が不安定な時に視線や首が細かく震えないよう、既存の OneEuroFilter や deadband と整合させる。
- 発話中の gesture は `speech_id`、文節、mora の切れ目に同期し、毎 mora で手を振るような過剰演出は避ける。
- 画面内 UI 操作や Debug Console 表示を妨げるほどキャラクターが大きく動かない。
- VRM に存在しないボーン、表情、look expression を前提にしない。

## 実装分割案

1. `TASK-3049`: キャラクター対話状態モデルと入力イベント集約を追加する。
2. `TASK-3050`: 呼吸、重心移動、上半身 idle motion を実装する。
3. `TASK-3051`: VAD 連動の聞き姿勢、相槌、発話終了リアクションを実装する。
4. `TASK-3052`: 目線、まばたき、視線外し、microsaccade を実装する。
5. `TASK-3053`: telop と expression_code に連動した AI 発話中の頭、姿勢、手振りを実装する。
6. `TASK-3054`: 自然さ調整、VRM 個体差対策、Playwright/手動確認、設計文書同期を行う。

## 子タスク

- Done: `documents/tasks/frontend_ui_guidance/done/TASK-3049-character-behavior-state-and-input-aggregation.md`
- Done: `documents/tasks/frontend_ui_guidance/done/TASK-3050-character-idle-breathing-and-upper-body-motion.md`
- Done: `documents/tasks/frontend_ui_guidance/done/TASK-3051-vad-listening-posture-and-backchannel-motion.md`
- Done: `documents/tasks/frontend_ui_guidance/done/TASK-3052-eye-behavior-gaze-blink-and-microsaccade.md`
- Done: `documents/tasks/frontend_ui_guidance/done/TASK-3053-ai-speech-telop-emotion-synchronized-motion.md`
- Done: `documents/tasks/frontend_ui_guidance/done/TASK-3054-character-motion-naturalness-verification-and-design-sync.md`

## 完了メモ

- 2026-05-11:
  - 子タスク `TASK-3049` から `TASK-3054` が完了済みのため、本 Epic も完了扱いとする。
  - 後続の `sincro` 同期モーション基盤は `documents/tasks/character_sincro_motion/open/TASK-3100-sincro-motion-foundation-epic.md` へ分離した。
  - `TASK-3100` 以降は、本タスクで整備した `CharacterBehaviorState`、`CharacterMotionOrchestrator`、eye / idle / AI speech motion を前提に進める。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/LegBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceEmotionController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts` または同等の新規ファイル
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts` または同等の新規ファイル
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/EyeBehaviorController.ts` または同等の新規ファイル
- `sincromisor-frontend/src/ts/App/SincroAudioInputController.ts`
- `sincromisor-frontend/src/ts/App/SincroCharacterGazeController.ts`
- `sincromisor-frontend/src/ts/RTC/TalkManager.ts`

## 完了条件

- キャラクターが待機中も呼吸、重心、まばたき、視線の小さな変化を持つ。
- ユーザー発話中に、聞いている姿勢と視線維持が自然に発生する。
- ユーザー発話終了後に、考え中の短い表現が入り、AI 発話へ滑らかに遷移する。
- AI 発話中に、口形だけでなく頭、目線、姿勢、腕の小さな変化が発話に同期する。
- `expression_code` が表情だけでなく姿勢や動きの強度にも反映される。
- 顔検出の入退出時に、急なスナップや不自然な停止が起きない。
- 目の動きが首追従と競合せず、ユーザーを見ている感覚を強めている。
- 低スペック端末でも明確なフレーム落ちや CPU 急増がない。
- 複数の VRM で、存在しないボーンや expression により例外停止しない。
- `cd sincromisor-frontend && npm run build` が成功する。
- `documents/design/frontend_character.md` が実装後の構造に追従している。

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

- カメラ OFF、マイク OFF、backend 未起動でも待機モーションが破綻しない。
- カメラ ON で顔を左右へ動かした時、目線が先行し、首が後から自然に追う。
- 顔を一時的に外した時、即座に大きく戻らず、短い猶予の後にニュートラルへ戻る。
- マイク入力で発話すると、聞き姿勢や小さな相槌が過剰でなく発生する。
- AI 発話中、長文でも手や頭が忙しなく動きすぎない。
- `expression_code` ありの応答で、happy/sad/angry/surprised の姿勢差分が見える。
- Debug Console や Settings の操作中に、キャラクターの動きが UI 操作の邪魔にならない。
- `simple-vrm` desktop/mobile でキャラクターが画面外へ大きくずれない。

## 技術的負債を残さないための注意

- `requestAnimationFrame` の独自ループを controller ごとに増やしすぎない。可能な限り `VRMCharacterManager.update()` の毎フレーム更新へ統合する。
- `window.performance.now()` 直接参照や magic number は、モーション設定としてまとまる場所へ寄せる。
- ボーン名取得失敗でキャラクター全体が止まる設計を見直し、任意ボーンは graceful degradation する。
- 既存 controller の固定ポーズ上書きが新しい orchestration と競合する場合は、局所的なパッチではなく責務ごと再設計する。
- コメントは Google TypeScript style に沿い、処理の逐語説明ではなく、なぜその設計にしたかを短く説明する。

## 設計文書更新

実装時は `documents/design/frontend_character.md` の以下を更新する。

- コンポーネント一覧に behavior state / motion orchestrator / eye behavior を追加する。
- データフローに VAD、Gaze、TalkManager、expression_code から motion state への流れを追加する。
- 既知課題とテスト方針に、自然さ、VRM 個体差、低スペック端末での負荷確認を追加する。
