# TASK-260517134244 frontend runtime boundary schema and any removal

- 作成日: 2026-05-17
- ステータス: Open
- 優先度: High
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

フロントエンドの外部 I/O 境界を `unknown` + schema parse へ寄せ、`any` と危険な型アサーションを減らす。

## 背景

規約では `any` と型アサーションを禁止し、外部 I/O は `unknown` で受けて Zod parse することを定めている。2026-05-17 時点で `any` は 17 箇所 / 3 ファイル、型アサーションは 90 箇所 / 38 ファイルに残っている。

特に WebRTC config、offer / candidate response、DataChannel payload、worker message は実行時境界であり、型だけでは防げない破損が起きる。

## スコープ

- Zod の導入可否確認と `package.json` への dependency 追加
- RTC config response schema の定義
- WebRTC offer / candidate response schema の定義
- DataChannel `text_ch` / `telop_ch` payload schema の定義
- worker message の型境界整理
- `RTCPeerConnection.getStats()` まわりの `any` を専用型または安全な accessor へ置換
- `JSON.parse(... as X)` を parse helper + schema validate へ置換

## 非対象

- サーバー側 endpoint / JSON 仕様の変更
- DataChannel payload の互換性変更
- WebRTC negotiation flow の作り直し
- 大規模なファイル分割

## 対象例

- `sincromisor-frontend/src/ts/RTC/SincroRTCConfigManager.ts`
- `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
- `sincromisor-frontend/src/ts/RTC/RTCMessage.ts`
- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`
- `sincromisor-frontend/src/ts/RTC/LearnedVadWorkerClient.ts`
- `sincromisor-frontend/src/ts/RTC/silero-vad.worker.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroTrackerWorkerClient.ts`
- `sincromisor-frontend/src/ts/FaceTracking/SincroTrackerWorkerTypes.ts`

## 実装方針

1. 通信契約の変更は行わず、受信側の検証層だけを追加する。
2. schema は境界ごとに正本を 1 箇所に置き、同型の再定義を避ける。
3. `null` を返す既存 contract がある場合は、境界で `undefined` へ寄せるか、後続 `TASK-260517134245` に残す。
4. schema parse 失敗時は logger で観測可能にし、ユーザー操作に影響する場合は既存 UI error flow に接続する。

## 完了条件

- `rg "\\bany\\b" sincromisor-frontend/src` の結果が 0 件、または残す行に `// reason:` がある。
- `JSON.parse(... as X)` が runtime validation へ置き換わっている。
- RTC config / DataChannel payload の schema 正本がある。
- `cd sincromisor-frontend && npm run check:biome` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。
- endpoint / JSON 契約を変えた場合は、変更内容と再デプロイ要否が明示されている。

## 確認コマンド案

```sh
rg "\\bany\\b|JSON\\.parse" sincromisor-frontend/src/ts/RTC sincromisor-frontend/src/ts/FaceTracking
cd sincromisor-frontend
npm run check:biome
npm run build
```

## 進捗

- 2026-05-17: `RTCPeerConnection.getStats()` の `any` を専用 stats 型へ置換した。
- 2026-05-17: RTC config response を `unknown` で受け、実行時検証後に `SincroRTCConfig` へ変換する入口を追加した。
- 2026-05-17: `text_ch` / `telop_ch` payload の `JSON.parse(... as X)` を、`unknown` parse + field validation へ置き換えた。
- 2026-05-17: `rg "\\bany\\b" sincromisor-frontend/src` は 0 件。

## 残件

- Zod dependency の導入可否確認と、手書き validation から schema 正本への置き換え。
- worker message の schema 正本化。
