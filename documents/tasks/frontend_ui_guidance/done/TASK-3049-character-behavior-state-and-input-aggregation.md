# TASK-3049 キャラクター対話状態モデルと入力イベント集約

- 作成日: 2026-05-08
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3048`

## 目的

VAD、顔検出、telop、text、感情コードを直接各 controller が参照する構造を避け、キャラクター表現用の状態モデルへ集約する。後続の目線、姿勢、上半身モーション、発話同期表現が同じ入力状態を見て判断できる土台を作る。

## 背景

- 現在は `HeadBoneController` が `CharacterGaze` を直接参照し、`FaceMorphController` と `FaceEmotionController` が `TalkManager` を直接参照している。
- `UserMediaManager` の VAD 状態は Debug UI へ流れているが、キャラクター表現には使われていない。
- 今後の表現追加を controller ごとの独自購読で進めると、状態遷移、タイミング、自然さ調整が分散して技術的負債になりやすい。

## スコープ

- `CharacterBehaviorState` または同等の型/クラスを追加する
- `idle / attending / user_speaking / thinking / ai_speaking / face_lost / error_or_disconnected` 相当の状態を扱う
- `TalkManager` の text/telop イベントを状態へ反映する
- `CharacterGaze` の顔検出、顔位置、正面度、入退出状態を状態へ反映する
- `UserMediaManager` の VAD 状態をキャラクター側へ伝搬できる経路を作る
- `VRMCharacterManager.update()` から毎フレーム参照できる snapshot API を用意する

## 非対象

- 実際のボーンモーション追加
- 目線、まばたき、microsaccade の実装
- AI 発話中ジェスチャーの実装
- RTC payload 変更

## 実装方針

1. 入力イベントを集約する `CharacterBehaviorState` と、毎フレーム使いやすい読み取り専用 snapshot を定義する。
2. 状態更新はイベント購読と時刻ベースの `update(nowMs)` に分ける。
3. VAD の `rms/peak/isSpeech` は短い envelope と hold を通し、1フレーム単位の揺れを後続へ渡さない。
4. `TalkManager` から AI 発話開始/継続/終了を推定する際は、`speech_id` と `currentMora()` の有効期間を使う。
5. 顔検出の入退出は即時切替ではなく、既存の `CharacterGaze.detecting()` と猶予時間を尊重する。
6. 既存 controller の直接参照は、後続タスクで段階的に state 経由へ移す前提で境界を用意する。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/App/SincroAudioInputController.ts`
- `sincromisor-frontend/src/ts/App/SincroCharacterGazeController.ts`
- `sincromisor-frontend/src/ts/RTC/TalkManager.ts`
- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`

## 完了条件

- キャラクター用の状態 snapshot から、顔検出、顔位置、正面度、VAD、AI 発話状態、感情コードが読める。
- VAD 状態が Debug UI だけでなくキャラクター状態へ流れる。
- 既存の首追従、口形、感情表情が壊れない。
- 状態遷移が timestamp と hold を持ち、発話/顔検出の短い揺れで頻繁に切り替わらない。
- 後続タスクが `CharacterBehaviorState` を参照して実装できる。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- backend 未起動でも状態モデル初期化で例外が出ない。
- カメラ OFF / マイク OFF でも `idle` または `face_lost` 相当で安定する。
- Debug Console の VAD 表示とキャラクター状態の VAD snapshot が大きく食い違わない。
- text/telop 受信時に `ai_speaking` 相当へ遷移し、発話終了後に戻る。
