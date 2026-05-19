# TASK-260519234120 frontend pages directory migration

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

Vite MPA のページ entry を `src/pages/*` に集約し、ページ固有処理と共通 app / feature / character 実装の境界を明確にする。

## スコープ

- `src/simple-vrm`、`src/vrm360`、`src/looking-glass-vrm`、`src/motion-debug`、`src/pose-landmarker-spike` の entry 移動
- `vite.config.js` の build input 更新
- HTML script import の更新
- URL ルートを維持するための配置または redirect 方針確認

## 非対象

- React app shell の再設計
- UI 見た目変更
- ページ URL の変更

## 完了条件

- ページ entry が `src/pages/*` に集約されている
- ユーザー向け URL の維持方針が明記されている
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
