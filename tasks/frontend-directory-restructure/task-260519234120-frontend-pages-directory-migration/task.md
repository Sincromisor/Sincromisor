# TASK-260519234120 frontend pages directory migration

- 作成日: 2026-05-19
- ステータス: Done
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

## 実施結果

- page entry を `sincromisor-frontend/src/pages/*` へ移動した。
- `vite.config.js` の build input を `src/pages/*` に更新した。
- dev は Vite middleware で旧公開 URL を `src/pages/*` へ内部 rewrite する。
- build 後は `dist/pages/*/index.html` を旧公開 URL 側へ移動し、preview / 配信時も `/simple-vrm/`、`/vrm360/`、`/looking-glass-vrm/`、`/motion-debug/`、`/pose-landmarker-spike/` を維持する。
- `documents/design/frontend/pages.md` に source entry と公開 URL の対応を反映した。

## 確認結果

- `cd sincromisor-frontend && npm run build`: 成功。
- `dist/index.html`、`dist/simple-vrm/index.html`、`dist/vrm360/index.html`、`dist/looking-glass-vrm/index.html`、`dist/motion-debug/index.html`、`dist/pose-landmarker-spike/index.html` の生成を確認した。
