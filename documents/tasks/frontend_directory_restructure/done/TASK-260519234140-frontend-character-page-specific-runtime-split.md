# TASK-260519234140 frontend character page specific runtime split

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

Looking Glass / VRM360 固有 runtime を `src/character/lookingGlass` / `src/character/vrm360` に整理し、通常 VRM scene と実験ページ固有処理を分ける。

## スコープ

- `src/ts/sincroVrm/lookingGlass` の移動
- `src/ts/sincroVrm/vrm360` の移動
- Looking Glass / VRM360 initializer の配置確認
- page entry から page-specific runtime への import 更新

## 非対象

- Looking Glass / VRM360 の機能変更
- WebXR 設定仕様変更
- scene 基盤全体の移動

## 完了条件

- page-specific runtime が character 配下の専用ディレクトリにまとまっている
- 通常 VRM scene との差分が import 上も読みやすい
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
