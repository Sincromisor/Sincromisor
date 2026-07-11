# Implementation Log: task-260712044929-record-motion-debug-build-commit

## Completion Summary

- Vite config が `SINCROMISOR_GIT_COMMIT` だけを build constant へ渡し、未設定時は JavaScript の `undefined` を define するようにした。Git command は実行しない。
- motion-debug manifest の build provenance を trim / lowercase / 7〜40桁 hexadecimal で正規化し、取得不能・`unknown`・不正値は field ごと省略するようにした。
- valid / absent / invalid の manifest test と v1 parser compatibility assertion を追加し、設計文書を同期した。

## Verification

- `cd sincromisor-frontend && npm test -- --run pages/motionDebug/__tests__/motionDebugRecordingController.test.ts`: PASS（10 tests）
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS（lint / build / 73 test files、511 tests。1 file / 2 tests skipped）

## Not Run

- gate の Markdown check を通すため、基点に存在した前タスクの未整形 `eval.md` / `impl.md` 2件を Prettier で機械整形した。意味内容の変更はない。

## TypeScript Production Comment Audit

| path                                                                           | symbol or decision                           | kind                                       | current comment                 | decision | required maintenance knowledge                                                             | action                                                           | reviewer note                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------ | ------------------------------- | -------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `sincromisor-frontend/src/vite-env.d.ts`                                       | `__SINCROMISOR_GIT_COMMIT__`                 | public global declaration / build boundary | なし（新規）                    | add      | build / CI caller が env から注入し、未設定は `undefined`、利用側で検証してから保存する    | TSDoc を追加                                                     | declaration が `string \| undefined` で runtime Git lookup を示唆しないこと |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugBuildProvenance.ts`     | `normalizeMotionDebugBuildGitCommit()`       | public export / normalizer                 | なし（新規）                    | add      | trim / lowercase 後の hash 条件と、省略が recording failure ではないこと                   | TSDoc を追加                                                     | `unknown`、空白、不正値、7〜40桁境界が実装と一致すること                    |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts` | `createManifest()` build provenance decision | persistence boundary                       | manifest 生成の専用コメントなし | add      | source ready と provenance availability は独立し、commit 不在でも recording を継続すること | TSDoc を追加し、validated value のみ conditional property で保存 | 不正値で `gitCommit` property 自体が省略され、v1 schema が維持されること    |
