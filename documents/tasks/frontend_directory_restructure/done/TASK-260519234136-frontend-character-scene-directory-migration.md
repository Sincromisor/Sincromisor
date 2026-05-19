# TASK-260519234136 frontend character scene directory migration

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

VRM scene、camera、light、initializer の scene 関連処理を `src/character/scene` に移し、three scene 基盤を character domain に集約する。

## スコープ

- `src/ts/sincroVrm/vrmScene` の移動
- VRM initializer の配置見直し
- page entry から scene initializer への import 更新
- scene option と app controller 起動の境界確認

## 非対象

- VRM motion / retargeting / IK の移動
- scene layout の見た目変更
- three / VRM library upgrade

## 完了条件

- scene 基盤が `src/character/scene` にまとまっている
- page-specific runtime との境界が明確になっている
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
