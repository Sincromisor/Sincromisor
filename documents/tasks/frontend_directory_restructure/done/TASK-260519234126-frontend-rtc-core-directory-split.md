# TASK-260519234126 frontend rtc core directory split

- 作成日: 2026-05-19
- ステータス: Done
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

## 完了メモ

- 完了日: 2026-05-20
- 実装: frontend を `src/app` / `src/features` / `src/character` / `src/shared` / `src/pages` の責務境界へ再配置した。
- 確認: `cd sincromisor-frontend && npm run build` 成功。
- 確認: `cd sincromisor-frontend && npm run check` 成功。
- 確認: `cd sincromisor-frontend && npm run test` 成功。
- 確認: dev server 上で `/` / `/simple-vrm/` / `/vrm360/` / `/looking-glass-vrm/` / `/motion-debug/` の page entry を Playwright smoke 確認した。backend 未起動のため RTC config 404 は想定内。
