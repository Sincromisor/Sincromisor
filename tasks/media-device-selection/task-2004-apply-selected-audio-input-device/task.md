# TASK-2004 選択されたマイク入力デバイスの取得反映

- 作成日: 2026-04-19
- ステータス: Done
- 優先度: High

## 目的

選択したマイク入力デバイスを `getUserMedia` 制約へ反映し、既定デバイスではなく指定デバイスの音声を RTC と Audio Monitor に流せるようにする。

## 関連設計

- `documents/design/frontend_ui.md`

## スコープ

- `audioInputDeviceId` を `UserMediaManager` の制約へ反映
- 起動時の取得デバイス切替
- 実行中変更時の音声トラック再取得
- RTC 送信トラック差し替え
- Audio Monitor の監視対象差し替え

## 非対象

- カメラトラック再取得
- Debug Console の見た目刷新

## 実装タスク

1. `UserMediaManager` に音声入力 deviceId を保持・反映する API を追加する。
2. `SincroAudioInputController` から dialog settings を読んで deviceId を適用する。
3. 起動時の `getUserMedia` で選択された deviceId を使う。
4. 実行中に deviceId が変わった場合の再取得フローを追加する。
5. RTC 側で `replaceTrack()` または同等の安全な差し替え処理を実装する。
6. Debug Console の local audio meter 対象も新トラックへ更新する。

## 想定変更箇所

- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`
- `sincromisor-frontend/src/ts/App/SincroAudioInputController.ts`
- `sincromisor-frontend/src/ts/App/SincroRtcSessionController.ts`
- `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`

## 完了条件

- 選択したマイク入力デバイスが実際に使用される。
- 実行中のデバイス変更でも音声送信が継続できる。
- Audio Monitor が新しい入力を監視できる。

## 確認

- ブラウザ既定とは別のマイクを選んで入力されることを確認する。
- 実行中にマイクを切り替えても致命的な切断が起きないことを確認する。
