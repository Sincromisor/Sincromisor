# TASK-260519234134 frontend settings feature colocation

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: Medium
- 種別: Task

## 目的

settings UI の field / primitive / shell / page-specific sections を `src/features/settings` に整理し、設定 UI の共通部品とページ差分を読みやすくする。

## スコープ

- `settingsFields` の移動
- `settingsPrimitives` の移動
- `settingsShell` の移動
- `simpleVrm/components/*Settings*` の配置整理
- dialog / right tool panel からの import 更新

## 非対象

- AppController settings snapshot の移動
- 設定項目の仕様変更
- settings UI のデザイン変更

## 完了条件

- settings React 関連が `features/settings` にまとまっている
- 共通 primitive とページ固有 section の境界が明確になっている
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
