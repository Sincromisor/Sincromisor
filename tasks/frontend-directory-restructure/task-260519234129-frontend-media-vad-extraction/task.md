# TASK-260519234129 frontend media vad extraction

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

VAD / audio processing runtime を `src/features/media/vad` に分離し、音声区間検出を RTC ではなく media feature として扱えるようにする。

## スコープ

- `sileroVad*` 系ファイルの移動
- `learnedVadWorkerClient` の移動
- VAD worklet / runtime / speech state の移動
- worker entry と Vite build の影響確認

## 非対象

- VAD アルゴリズム変更
- audio profile の設定値変更
- Debug Console UI の変更

## 完了条件

- VAD 関連が `src/features/media/vad` にまとまっている
- worker path と runtime load が壊れていない
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
