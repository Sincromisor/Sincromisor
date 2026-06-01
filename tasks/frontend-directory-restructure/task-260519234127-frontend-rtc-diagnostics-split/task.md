# TASK-260519234127 frontend rtc diagnostics split

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

RTC の通信処理と診断記録を分けるため、stats / ICE diagnostics / SDP log 関連を `src/features/rtc/diagnostics` に整理する。

## スコープ

- `rtcStats*` の移動
- `rtcIceDiagnostics` の移動
- SDP / ICE ログに関わる補助型の配置確認
- Debug Console model との依存方向確認

## 非対象

- Debug Console React UI の移動
- 診断 UI の見た目変更
- RTC 接続仕様変更

## 完了条件

- RTC diagnostics が `src/features/rtc/diagnostics` にまとまっている
- RTC core から diagnostics への依存が一方向に整理されている
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
