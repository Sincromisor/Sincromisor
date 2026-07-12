# Review: task-260628231542-character-animation-3-0-phase-13-source-comment-remediation

## 判定

APPROVED

Critical / High の blocking 指摘はない。TypeScript production code のコメント改善タスクとして、comment audit、public export / boundary / heuristic / schema / lifecycle の受け入れ条件、省略理由、stale comment / TODO、挙動変更禁止、設計文書との整合確認が task.md に明記されており、実装可能な粒度に収まっている。

## 指摘事項

なし

## 実装者への申し送り

- 依存 2 タスクは `status: done` / `verdict: PASS` 済みで、`documents/rules/coding-ts.md` のコメント品質節と agent gate を前提にしてよい。
- audit 対象は task.md に列挙された 4 つの production `.ts` glob に限定する。`trackingRuntime/roiTracking/*.ts` のような subdirectory は、列挙 glob から外れるため勝手に広げない。
- 対象 glob 直下には production `.ts` が 90 file あり、`__tests__`、`*.test.ts`、`*TestFixtures.ts` も近接している。`comment-audit.md` 冒頭に除外 pattern を明記し、table は対象 file ごとに漏れなく記録する。
- `main.ts`、`dom.ts` など薄い entry / helper も audit し、省略する場合は省略理由を audit に残す。
- コメント追加中に責務混在、設計文書との矛盾、命名・関数分割で解くべき箇所を見つけても、このタスクでは runtime logic、type shape、schemaVersion、threshold 値、export 名を変更せず、`impl.md` に follow-up として file / 理由 / 推奨 task 化単位を記録する。
- 検証は task.md 記載の frontend check / build / focused tests と `tasks:check` / `tasks:index:check` を実行し、未実行があれば理由を `impl.md` に残す。
