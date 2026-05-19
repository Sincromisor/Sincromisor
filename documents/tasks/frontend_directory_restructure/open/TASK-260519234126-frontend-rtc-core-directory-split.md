# TASK-260519234126 frontend rtc core directory split

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

WebRTC transport の中核処理を `src/features/rtc` に移し、RTC ディレクトリを PeerConnection / signaling / DataChannel の責務に限定する。

## スコープ

- `rtcTalkClient` の移動
- peer connection factory / events / shutdown の移動
- negotiation / ICE candidate sender の移動
- data channel / boundary schema / message 型の移動
- import path の更新

## 非対象

- UserMedia / VAD の移動
- TalkManager / telop の移動
- endpoint / payload 契約変更

## 完了条件

- RTC core が `src/features/rtc` 配下にまとまっている
- WebRTC endpoint / JSON payload が変更されていない
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
