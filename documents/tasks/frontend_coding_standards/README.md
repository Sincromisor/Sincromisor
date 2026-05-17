# Frontend Coding Standards

`documents/rules/coding-ts.md` と `AGENTS.md` の TypeScript 規約に合わせて、`sincromisor-frontend` の既存コードを段階的に整理するためのタスク群です。

## 現状メモ

- `npm run build` は成功する。
- `npm run check:biome` は warning / info が残っている。
- 規約違反は命名・型境界・logger・null 方針・ファイルサイズに広く分散しているため、1 タスクで全面修正しない。
- runtime validation は、通常版 Zod を外部 I/O 境界へ限定導入する方針とする。worker message や DOM event まで一律に Zod 化しない。
