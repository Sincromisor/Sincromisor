# TASK-3104 talk mode 別 Character Motion Orchestration

- 作成日: 2026-05-11
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3100`
- 依存: `TASK-3103`

## 目的

`chat` と `sincro` でキャラクター motion の優先順位を分け、対話演出と同期演出が混ざって不自然になることを防ぐ。既存 `CharacterMotionOrchestrator` と各 controller を、talk mode aware な構成へ整理する。

## 背景

- `chat` では AI 発話 gesture、考え中の視線外し、相手を見る動きが自然さにつながる。
- `sincro` では同じ演出がユーザー同期を邪魔し、キャラクターが勝手に動いているように見える。
- 現状は `SincroController.startRTC()` が `talkMode` を RTC に渡すが、キャラクター motion の優先順位には十分反映されていない。

## スコープ

- `CharacterBehaviorState` または上位 app state に `talkMode` を反映する
- active session 中の `talkMode` 切替仕様を決める
- `chat` と `sincro` の motion priority を整理する
- `sincro` では Face retarget を優先し、AI 発話 gesture や idle motion を抑制する
- `chat` では既存の注視、VAD listening、AI speech motion を維持する
- mode 切替時に tracker / retarget / controller が安全に切り替わるようにする

## 非対象

- RTC payload の変更
- Pose Landmarker 本実装
- Settings UI の詳細追加

## 実装方針

1. mode 判定を各 controller に散らさず、snapshot または orchestration 層で参照する。
2. `chat` は `gaze` を主入力、`sincro` は `faceMotion` を主入力として扱う。
3. active session 中に `talkMode` を変える場合、RTC の `talk_mode` も変える必要があるため、音声処理経路を変える切替は RTC 再接続を必要条件にする。
4. local motion preview だけを切り替える設定を入れる場合は、`talkMode` とは別の `characterMotionMode` 相当として扱い、RTC 契約と混同しない。
5. `sincro` では idle breathing は残してよいが、頭・目・口の同期を邪魔しない低強度にする。
6. AI 発話中の口形は `chat` では telop、`sincro` ではユーザー口形を優先する。
7. mode 切替直後は neutral transition を入れ、前モードの pose が残留しないようにする。

## 実装対象候補

- `sincromisor-frontend/src/ts/SincroController.ts`
- `sincromisor-frontend/src/ts/App/SincroCharacterGazeController.ts`
- `sincromisor-frontend/src/ts/App/SincroAppSettingsApply.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/*Controller.ts`

## 完了条件

- `chat` と `sincro` で motion priority が分かれている。
- `sincro` 中に AI speech gesture や thinking aversion が同期感を壊さない。
- `chat` では既存の対話存在感表現が維持される。
- active session 中の `talkMode` 切替が、RTC 再接続を伴うのか local motion のみなのか明確である。
- local motion preview 用の切替を設ける場合、`talkMode` と別名・別状態で管理されている。
- mode 切替で tracker loop や motion state が二重化しない。
- `cd sincromisor-frontend && npm run build` が成功する。

## 確認観点

- `chat` で顔を画面端へ動かすと、キャラクターが相手を見る。
- `sincro` で顔を左右へ向けると、キャラクターが同じ向きになる。
- `sincro` で AI 発話が発生しても、頭や口が勝手な発話 gesture に乗っ取られない。
- `chat` / `sincro` を切り替えても前モードの表情や姿勢が残り続けない。
