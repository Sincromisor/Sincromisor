# TASK-260517134244 frontend runtime boundary schema and any removal

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

フロントエンドの外部 I/O 境界を `unknown` + schema parse へ寄せ、`any` と危険な型アサーションを減らす。

## 背景

規約では `any` と型アサーションを禁止し、外部 I/O は `unknown` で受けて Zod parse することを定めている。2026-05-17 時点で `any` は 17 箇所 / 3 ファイル、型アサーションは 90 箇所 / 38 ファイルに残っている。

特に WebRTC config、offer / candidate response、DataChannel payload、worker message は実行時境界であり、型だけでは防げない破損が起きる。

2026-05-17 に Zod 導入可否を確認した結果、通常版 Zod を外部 I/O 境界へ限定導入する方針とする。bundle size を理由に `zod/mini` を先行採用する必要は現時点では低く、DX と保守性を優先する。

## スコープ

- 通常版 Zod の dependency 追加
- RTC config response schema の定義
- WebRTC offer / candidate response schema の定義
- DataChannel `text_ch` / `telop_ch` payload schema の定義
- ICE candidate response schema の定義
- `RTCPeerConnection.getStats()` まわりの `any` を専用型または安全な accessor へ置換
- `JSON.parse(... as X)` と手書き validation を Zod schema parse へ置換
- 導入後の bundle / chunk size の確認

## 非対象

- サーバー側 endpoint / JSON 仕様の変更
- DataChannel payload の互換性変更
- WebRTC negotiation flow の作り直し
- 大規模なファイル分割
- worker message の全面 Zod 化
- DOM event / React event の Zod 化
- `zod/mini` への先行切り替え

## 対象例

- `sincromisor-frontend/src/ts/RTC/SincroRTCConfigManager.ts`
- `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
- `sincromisor-frontend/src/ts/RTC/RTCMessage.ts`

## 実装方針

1. 通信契約の変更は行わず、受信側の検証層だけを追加する。
2. schema は境界ごとに正本を 1 箇所に置き、同型の再定義を避ける。`schemas.ts` / `utils.ts` のような曖昧な名前は使わない。
3. Zod schema から `z.infer` で TypeScript 型を作り、型定義と runtime validation の二重管理を減らす。
4. `null` を返す既存 contract がある場合は、境界で `undefined` へ寄せるか、後続 `TASK-260517134245` に残す。
5. schema parse 失敗時は logger で観測可能にし、ユーザー操作に影響する場合は既存 UI error flow に接続する。
6. `npm run build` の出力で chunk size を確認し、Zod が目立つ場合のみ `zod/mini` への切り替えを後続検討にする。

## 完了条件

- `rg "\\bany\\b" sincromisor-frontend/src` の結果が 0 件、または残す行に `// reason:` がある。
- 通常版 Zod が dependency に追加されている。
- RTC config / offer response / candidate response / DataChannel payload の Zod schema 正本がある。
- 対象範囲の手書き validation が Zod schema parse へ置き換わっている。
- `cd sincromisor-frontend && npm run check:biome` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。
- `npm run build` の chunk size を確認し、Zod 追加による懸念があれば後続タスク化されている。
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
- 2026-05-17: Zod 導入可否を確認し、通常版 Zod を RTC / DataChannel などの外部 I/O 境界へ限定導入する方針に決定した。`zod/mini` は bundle size が実測で問題になった場合のみ後続検討する。
- 2026-05-17: `zod` を dependency に追加し、RTC config / offer response / ICE candidate response / `text_ch` / `telop_ch` payload を `rtcBoundarySchema.ts` の Zod schema 正本へ集約した。
- 2026-05-17: `npm run check:biome` と `npm run build` が成功。build 出力では既存の 500kB 超 chunk 警告は継続するが、Zod 導入による単独の巨大 chunk は発生していない。
- 2026-05-17: `npm run check` は未変更ファイル `documents/rules/coding-py.md` の Prettier 警告で失敗するため、本タスクでは未解消として切り分けた。

## 残件

- なし。
