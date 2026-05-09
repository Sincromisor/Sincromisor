# TASK-3053 AI 発話中の telop・感情同期モーション

- 作成日: 2026-05-08
- ステータス: Done
- 優先度: High
- 親タスク: `TASK-3048`
- 依存: `TASK-3049`, `TASK-3050`, `TASK-3052`

## 目的

AI 発話中に、口形だけでなく、頭、目線、姿勢、腕、手首が発話内容と感情に合わせて自然に変化するようにする。`telop_ch` の mora/文節タイミングと `text_ch.expression_code` を活用し、話している空気感を強める。

## 背景

- 現状の AI 発話表現は `FaceMorphController` の口形と `FaceEmotionController` の表情プリセットが中心。
- `expression_code` は表情には使われているが、姿勢や gesture 強度には使われていない。
- mora ごとに大きく動かすと不自然になるため、発話単位、文節、speech_id の切れ目に絞った動きが必要。

## スコープ

- `ai_speaking` 状態の頭、上半身、腕、手首の小さな gesture
- `telop_ch` の `speech_id`, `vowel`, `text`, `length`, `new_text` に基づく発話ビート
- `expression_code` による姿勢、gesture 強度、視線の差分
- 発話開始/終了時の入りと戻り
- 口形と感情表情との干渉回避

## 非対象

- TTS 音声波形解析
- サーバーからの新規 gesture payload 追加
- 個別キャラクター専用のモーションセット
- 大きな全身ダンス/アニメーション

## 実装方針

1. `TalkManager.currentMora()` と text/telop イベントから、発話中かどうかと発話ビートを推定する。
2. 毎 mora で手を動かさず、speech_id の開始、句読点/短い休止、一定間隔の beat に絞る。
3. happy は姿勢を開き、sad は少し落とし、angry は硬め、surprised は短く跳ねるなど、`expression_code` を姿勢へ反映する。
4. gesture 強度は控えめな既定値から始め、長文時に累積して大きくならないよう clamp する。
5. 口形、表情、目線、腕 gesture が同時に最大化しないよう、重み付けを行う。
6. AI 発話終了後は即停止ではなく、短い余韻を持って idle/attending へ戻る。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/ArmBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceEmotionController.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
- `sincromisor-frontend/src/ts/RTC/TalkManager.ts`

## 完了条件

- AI 発話開始時に自然な入りがある。
- 発話中に頭、目線、姿勢、腕の小さな変化が口形と同期して見える。
- `expression_code` によって姿勢や gesture の雰囲気が変わる。
- 長文応答でも手や頭が忙しなく動き続けない。
- 発話終了後に短い余韻を持って自然に戻る。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- `expression_code` なしの応答では控えめな neutral 発話になる。
- happy/sad/angry/surprised の応答で、表情だけでなく姿勢差分が見える。
- telop が高速に流れても gesture が毎文字/毎 mora で過剰発火しない。
- 口形と感情表情の競合回避が維持される。
- backend 未起動時は既存の表示や idle motion が壊れない。

## レビュー対応メモ

- 2026-05-09:
  - `FaceMorphController` と `FaceEmotionController` の `TalkManager` 直接参照を廃止し、`VRMCharacterManager.update()` から渡される `CharacterBehaviorSnapshot` を唯一の入力にした。
  - 口形と感情表情の短時間アニメーションを各 controller 独自の rAF ではなく、VRM render loop の snapshot 時刻で進めるようにした。
  - `speech_id` が切り替わった telop は `expression_code` 未到着なら neutral として扱い、前発話の happy/sad/angry/surprised が姿勢・gesture へ持ち越されないようにした。
