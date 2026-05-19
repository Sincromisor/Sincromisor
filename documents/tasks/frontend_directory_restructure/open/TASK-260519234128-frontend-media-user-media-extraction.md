# TASK-260519234128 frontend media user media extraction

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

`src/ts/rtc` に混在している UserMedia / video input 処理を `src/features/media/userMedia` に移し、ブラウザ media 入力を RTC transport から分離する。

## スコープ

- `userMedia*` 系ファイルの移動
- `videoInputManager` の移動
- audio / video device input と RTC 送信処理の依存整理
- AppController / audio input controller からの import 更新

## 非対象

- VAD runtime の移動
- device selection UI の移動
- getUserMedia の挙動変更

## 完了条件

- UserMedia 所有コードが `features/rtc` から消えている
- RTC へ渡す audio track の契約が変わっていない
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
