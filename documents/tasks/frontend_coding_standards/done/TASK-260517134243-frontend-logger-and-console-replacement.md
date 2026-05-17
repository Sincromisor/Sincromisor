# TASK-260517134243 frontend logger and console replacement

- 作成日: 2026-05-17
- ステータス: Done
- 優先度: High
- 種別: Task
- 親タスク: `TASK-260517134241`

## 目的

フロントエンド共通 logger を導入し、`console.log` / `console.error` / `console.warn` / `console.dir` の直書きを規約に沿って置き換える。

## 背景

`documents/rules/coding-ts.md` では `console.*` 直書きを禁止し、構造化 logger の利用を定めている。2026-05-17 時点で `console.*` は 68 箇所 / 19 ファイルに残っている。

WebRTC / MediaPipe / 3D 描画は診断ログが重要だが、secret や PII を不用意に出さないためにも、ログ形式とログレベルを集約する必要がある。

## スコープ

- フロントエンド共通 logger module の追加
- `error` / `warn` / `info` / `debug` の最小 API 定義
- 構造化ログ形式の採用
- `console.*` 直書きの置換
- 音声認識結果、チャット本文、デバイス label、TURN credential などをログに出さない方針の確認

## 非対象

- 外部ログ送信基盤の導入
- ログ永続化
- ブラウザ console 以外の transport 実装
- Debug Console UI の大規模変更

## 対象例

- `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
- `sincromisor-frontend/src/ts/RTC/SincroRTCConfigManager.ts`
- `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`
- `sincromisor-frontend/src/ts/UI/ChatMessageService.ts`
- `sincromisor-frontend/src/ts/UI/DialogManager.ts`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
- `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- `sincromisor-frontend/src/motion-debug/motionDebugApp.ts`

## 実装方針

1. まず `src/ts` からも `src/react` からも使える配置に logger を作る。
2. ログ message は英語にする。
3. 例外を catch する箇所では原因チェーンを維持できる場合は維持し、握り潰さない。
4. Debug Console の画面表示に必要なイベント記録と、開発者向け logger を混同しない。

## 完了条件

- `rg "console\\." sincromisor-frontend/src` で直書きが残っていない、または残す行に明確な `// reason:` がある。
- `cd sincromisor-frontend && npm run check:biome` が成功する。
- `cd sincromisor-frontend && npm run build` が成功する。
- ログ message が英語で、secret / PII を含まない。

## 確認コマンド案

```sh
rg "console\\." sincromisor-frontend/src
cd sincromisor-frontend
npm run check:biome
npm run build
```

## 進捗

- 2026-05-17: `src/ts/logging/appLogger.ts` を追加し、`debug` / `info` / `warn` / `error` の共通 logger API を定義した。
- 2026-05-17: `console.*` 直書きを共通 logger 経由へ置き換えた。残る `console.*` は logger transport 内の 4 行のみで、各行に `// reason:` を明記した。
- 2026-05-17: チャット本文、DataChannel payload 全文、デバイス label、選択ファイル名などの PII になり得る値を logger 出力へ載せない形にした。
- 2026-05-17: `npm run check:biome` と `npm run build` が成功した。

## 残件

- なし。
