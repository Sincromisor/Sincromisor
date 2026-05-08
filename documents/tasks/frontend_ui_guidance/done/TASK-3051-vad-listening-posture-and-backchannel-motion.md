# TASK-3051 VAD 連動の聞き姿勢・相槌・発話終了リアクション

- 作成日: 2026-05-08
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3048`
- 依存: `TASK-3049`, `TASK-3050`

## 目的

ユーザーが話している間に、キャラクターが聞いている雰囲気を出す。VAD の発話状態、音量 envelope、発話終了タイミングを使い、軽い前傾、視線維持、うなずき準備、発話終了後の小さな相槌を自然に発生させる。

## 背景

- 現状の VAD は送信用音声の制御と Debug UI 表示に使われているが、キャラクター表現には未利用。
- ユーザー発話中もキャラクターの変化が首追従程度に留まり、聞かれている感覚が弱い。
- 発話音量に直接動きを同期すると不自然に震えやすいため、状態遷移と envelope を挟む必要がある。

## スコープ

- `user_speaking` 状態の聞き姿勢
- VAD onset/off に対する短い反応
- 発話終了後の小さなうなずき、姿勢戻り
- RMS/Peak を低周波の動き強度へ変換する envelope
- 短いノイズ発話を無視する hold / debounce

## 非対象

- AI 発話中の gesture
- 目線 controller の詳細実装
- VAD アルゴリズム自体の改善
- サーバー側音声処理変更

## 実装方針

1. `CharacterBehaviorState` の VAD snapshot を使い、`user_speaking` と `thinking` への遷移を安定させる。
2. 発話開始時は急に動かず、0.2 秒から 0.5 秒程度で聞き姿勢へ入る。
3. 発話中は頭/胸/肩の大きな動きを抑え、相手を見ている状態を保つ。
4. 発話終了後、短い遅延を置いて小さな nod を発生させ、すぐ AI 発話が始まる場合は過剰に重ねない。
5. RMS/Peak は gesture の直接角度ではなく、前傾や attentive intensity の補助値に留める。
6. 会場ノイズや誤検知で動きが連発しないよう、最低発話時間と cooldown を持つ。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`

## 完了条件

- ユーザー発話中に、軽い前傾や聞き姿勢が自然に発生する。
- 発話終了後に小さな相槌または戻り動作が入る。
- 短いノイズや VAD の瞬間的な揺れで姿勢が忙しく切り替わらない。
- AI 発話中 gesture と重なっても、首、上半身、腕が過剰に同時動作しない。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- マイクへ短く音を入れた時に、大きな反応が連発しない。
- 2 秒以上話した後に、自然な発話終了リアクションが見える。
- 無音状態では `idle` へ滑らかに戻る。
- Debug Console の VAD 表示とキャラクターの聞き姿勢タイミングが大きくずれない。
