# TASK-260519234127 frontend rtc diagnostics split

- 作成日: 2026-05-19
- ステータス: Open
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
