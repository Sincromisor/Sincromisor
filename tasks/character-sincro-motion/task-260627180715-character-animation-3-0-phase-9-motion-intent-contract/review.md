# Review: task-260627180715-character-animation-3-0-phase-9-motion-intent-contract

## 判定

APPROVED

Critical / High の blocking 指摘はありません。MotionIntent v1 の保存 schema、enum、parse 境界、viewer 表示、テスト、ドキュメント同期先が具体化されており、確認した既存 `file:line` 前提も現状コードと整合しています。

## 指摘事項

（なし）

## 実装者への申し送り

- `MotionIntentWarningCode` は保存 schema の一部なので、後続 estimator / viewer から参照しやすいよう `motionIntentState.ts` から export するのが自然です。task.md の export 一覧には明記されていませんが、schema 記述上は実装して差し支えありません。
- `MotionIntentParseResult` の成功 payload 名は task.md で明文化されていません。既存の `parseCanonicalUpperBodyState()` / `parseTemporalUpperBodyState()` と同じ `{ ok: true; state: MotionIntentState } | { ok: false; errors: ... }` 形に合わせると、viewer の parse error 表示と型の一貫性を保てます。
- ドキュメント同期は `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` が指定済みです。developer-visible な `frame.intent` / `character/motionIntent` contract 追加なので、実装完了条件として必ず反映してください。
