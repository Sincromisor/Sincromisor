# Review: task-260705214026-remove-motion-rollback-fallback-paths

## 判定
APPROVED

前回 High は解消された。full application default 昇格タスクを依存に追加し、削除対象 / 残置対象 / code removal 開始条件が task.md 内で一意に定義されたため、実装に進めてよい。

## 指摘事項
なし

## 実装者への申し送り
- `meta.yaml` でも `task-260705214907-full-normalized-pose-production-default` が依存に追加済み。受け入れ条件どおり、この依存が `status: done` / `verdict: PASS` になるまでは code removal に入らないこと。
- 削除対象は arm / torso / full application rollback に固定され、`composerSemanticFingerApplicationMode` は残置対象に分離されている。Debug Console controls / snapshot fields / tests の削除範囲で semantic / finger rollback まで巻き込まないこと。
- 現行コード上の削除対象は `vrmCharacterManager.ts:323` から `:333` の arm fallback trigger、`:357` から `:370` の torso / shoulder fallback trigger、`sincroPoseRetargetTypes.ts:173` から `:176` の temporary flag default 群が中心になる。
