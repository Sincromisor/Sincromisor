# TASK-260519234128 frontend media user media extraction

- 作成日: 2026-05-19
- ステータス: Done
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

## 完了メモ

- 完了日: 2026-05-20
- 実装: frontend を `src/app` / `src/features` / `src/character` / `src/shared` / `src/pages` の責務境界へ再配置した。
- 確認: `cd sincromisor-frontend && npm run build` 成功。
- 確認: `cd sincromisor-frontend && npm run check` 成功。
- 確認: `cd sincromisor-frontend && npm run test` 成功。
- 確認: dev server 上で `/` / `/simple-vrm/` / `/vrm360/` / `/looking-glass-vrm/` / `/motion-debug/` の page entry を Playwright smoke 確認した。backend 未起動のため RTC config 404 は想定内。
