# TASK-2005 選択された視線検出用カメラの取得反映

- 作成日: 2026-04-19
- ステータス: Open
- 優先度: High

## 目的

選択したカメラを CharacterGaze 用の入力に使い、既定カメラではなく意図したデバイスで face & gaze preview と AutoMute を動作させる。

## 関連設計

- `documents/design/frontend_ui.md`

## スコープ

- `videoInputDeviceId` を CharacterGaze 用トラック取得へ反映
- 起動時の Gaze カメラ選択
- 実行中変更時の Gaze カメラ再初期化
- `characterGazeVideo` と face & gaze preview の継続利用

## 非対象

- WebRTC で送る映像トラックの追加
- CharacterGaze アルゴリズム自体の変更

## 実装タスク

1. CharacterGaze 用カメラトラック取得の責務を整理する。
2. `videoInputDeviceId` をもとに選択カメラを取得する処理を追加する。
3. `SincroCharacterGazeController` で起動時に選択カメラを使うようにする。
4. 実行中にカメラ変更された場合の停止・再初期化フローを追加する。
5. Gaze OFF/ON 切替とデバイス変更が競合しても破綻しないようにする。
6. 既存の `characterGazeVideo` プレビューと `eyeTarget` 表示が維持されることを確認する。

## 想定変更箇所

- `sincromisor-frontend/src/ts/App/SincroCharacterGazeController.ts`
- `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts` または関連する新規 helper

## 完了条件

- 選択したカメラが face & gaze preview に使われる。
- 実行中のカメラ切替でも Gaze 機能が再開できる。
- AutoMute の挙動が選択カメラに追従する。

## 確認

- 既定カメラ以外を選んだ状態で face & gaze preview が更新されることを確認する。
- Gaze を OFF/ON しても選択カメラが維持されることを確認する。
