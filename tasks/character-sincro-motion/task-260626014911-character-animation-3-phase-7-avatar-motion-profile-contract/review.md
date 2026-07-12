# Review: task-260626014911-character-animation-3-phase-7-avatar-motion-profile-contract

## 判定

APPROVED

前回の blocking High である parser 値域、測定式 / warning code、minimal 変換 mapping は task.md に固定され、ParseResult shape と deep clone テストも補われている。改訂差分により新たに実装不能またはテスト不能になる破綻は見当たらない。

## 指摘事項

- なし

## 実装者への申し送り

- `parseAvatarMotionProfile()` は、既存の strict plain object parser pattern に寄せ、extra key や unknown enum は `invalid_state` として扱うのが自然。task.md のテスト項目に extra key / unknown enum が含まれるため、期待 code を実装内でぶらさないこと。
- `SincroPoseRetargeter.getAvatarMotionProfile()` は完成版 `AvatarMotionProfile` を返すようになる一方、既存 Debug Console / motion-debug / solver / composer は `MinimalAvatarMotionProfile` を参照している。既存 call site では task.md の方針どおり `toMinimalAvatarMotionProfile()` を明示して通し、Phase 6 snapshot schema は変更しないこと。
- warning code は task.md の命名規則を正本にして、旧 minimal profile の `missing_upper_chest` などと混在させないこと。minimal 互換変換で warning を渡す場合も、完成版 contract 由来の code として扱う前提で実装すること。
