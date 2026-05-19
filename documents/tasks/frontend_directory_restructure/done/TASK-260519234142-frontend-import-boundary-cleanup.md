# TASK-260519234142 frontend import boundary cleanup

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: High
- 種別: Task

## 目的

ディレクトリ再編後の import 依存を棚卸しし、feature / app / character / shared の境界違反や深すぎる相対 import を解消する。

## スコープ

- `features/rtc` から React UI への直接依存確認
- `character` から dialog / debug React UI への直接依存確認
- `shared` に feature 固有コードが入っていないか確認
- `../../../` が深くなりすぎた箇所の配置見直し

## 非対象

- path alias 導入
- runtime 挙動変更
- 追加の大規模ファイル分割

## 完了条件

- 禁止する依存方向が残っていない
- 残す例外依存には理由が明記されている
- `cd sincromisor-frontend && npm run build` が成功する
- 可能なら `cd sincromisor-frontend && npm run check` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
npm run check
```

## 完了メモ

- 完了日: 2026-05-20
- 実装: frontend を `src/app` / `src/features` / `src/character` / `src/shared` / `src/pages` の責務境界へ再配置した。
- 確認: `cd sincromisor-frontend && npm run build` 成功。
- 確認: `cd sincromisor-frontend && npm run check` 成功。
- 確認: `cd sincromisor-frontend && npm run test` 成功。
- 確認: dev server 上で `/` / `/simple-vrm/` / `/vrm360/` / `/looking-glass-vrm/` / `/motion-debug/` の page entry を Playwright smoke 確認した。backend 未起動のため RTC config 404 は想定内。
