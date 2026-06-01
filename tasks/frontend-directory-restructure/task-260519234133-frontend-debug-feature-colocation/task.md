# TASK-260519234133 frontend debug feature colocation

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: High
- 種別: Task

## 目的

Debug Console の state / controls / React panels を `src/features/debug` にまとめ、診断 UI と各 feature の runtime 処理の境界を明確にする。

## スコープ

- `src/ts/ui/debugConsole*` の `features/debug/model` への移動
- `src/react/debug` の `features/debug/react` への移動
- audio / gaze / RTC / motion snapshot の import 更新
- AppController debug bridge との接続維持

## 非対象

- 診断項目の追加削除
- Debug Console の見た目変更
- RTC / media / character runtime の移動

## 完了条件

- Debug Console 関連が `features/debug` にまとまっている
- runtime feature から React debug UI への直接依存がない
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
