# TASK-260517134242 frontend Biome diagnostics cleanup

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

`sincromisor-frontend` の Biome 診断を解消し、`npm run check:biome` が通る状態にする。

## 背景

2026-05-17 時点で `npm run build` は成功するが、`npm run check:biome` は warning 24 件 / info 42 件を出している。多くは機械的に直せるが、`any` や non-null assertion など規約上 hard な項目も含まれる。

## スコープ

- `useLiteralKeys` の修正
- `noConfusingVoidType` の修正
- `noNonNullAssertion` の修正
- `useTemplate` の修正
- `useOptionalChain` の修正
- `noApproximativeNumericConstant` の修正
- `noUnusedPrivateClassMembers` の修正
- Biome が直接検出している `noExplicitAny` の一次対応

## 非対象

- 共通 logger 導入を伴う `console.*` 全面置換
- Zod schema 導入を伴う runtime 境界の全面整理
- ファイル / ディレクトリの大規模リネーム
- 巨大ファイル分割

## 対象例

- `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- `sincromisor-frontend/src/react/app/subscribeActiveSincroAppController.ts`
- `sincromisor-frontend/src/ts/UI/PopMessageService.ts`
- `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
- `sincromisor-frontend/src/ts/RTC/SincroRTCConfigManager.ts`
- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`
- `sincromisor-frontend/src/ts/UI/ChatMessageService.ts`

## 完了条件

- `cd sincromisor-frontend && npm run check:biome` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。
- 残す必要がある lint 抑制には `// biome-ignore <rule>: <reason>` が付いている。
- `any` を残す必要がある場合は同じ行に `// reason: <理由>` がある。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run check:biome
npm run build
```

## 実施結果

- `useLiteralKeys` / `useTemplate` / `useOptionalChain` / `useParseIntRadix` / `noUselessSwitchCase` / `noApproximativeNumericConstant` を解消した。
- `noNonNullAssertion` は DOM 要素取得時の明示エラーへ置き換えた。
- Biome が検出していた `noExplicitAny` は、RTC stats / config / AudioWorklet 境界の専用型または `unknown` へ置き換えた。
- DataChannel payload と RTC config response は `unknown` で受け、実行時検証してから既存型へ変換する入口を追加した。

## 確認結果

- 2026-05-17: `cd sincromisor-frontend && npm run check:biome -- --max-diagnostics=200` 成功。
- 2026-05-17: `cd sincromisor-frontend && npm run build` 成功。
