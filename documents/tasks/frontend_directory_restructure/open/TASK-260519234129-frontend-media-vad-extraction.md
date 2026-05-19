# TASK-260519234129 frontend media vad extraction

- 作成日: 2026-05-19
- ステータス: Open
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
