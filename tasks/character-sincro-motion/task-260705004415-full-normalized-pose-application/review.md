# Review: task-260705004415-full-normalized-pose-application

## 判定

APPROVED

前回 blocking だった full application switch の名前、所在、既定値、off 時の復帰先、Debug Console での確認境界が task.md に明記された。改訂で追加された方針は既存の `SincroPoseRetargetConfig` / Debug Console の実験 flag 境界と矛盾しないため、実装に進めてよい。

## 指摘事項

- なし。

## 実装者への申し送り

- `fullNormalizedPoseApplicationMode: "off" | "upper_body"` は `SincroPoseRetargetConfig` 近傍に置き、通常設定 UI、URL query、env var、backend API、保存設定 contract へ広げない方針が task.md で確定している。実装時に公開設定 contract を増やす場合は、タスク外の設計変更として扱う。
- `"off"` は full `setNormalizedPose(finalPose)` だけを止め、前段の arm / torso / shoulder / semantic / finger flag を暗黙変更しない。rollback 手順や Debug Console summary の rollback reason もこの境界に合わせる。
- `documents/design/frontend/character/motion.md:462` 以降の Production Application Gates、`VRMCharacterManager.update()` の現行更新順、dry-run の `status !== "available"` で `result` を持たない contract、pipeline state の clone / composerDryRun 保存契約についての参照は現状と整合している。
- TypeScript production comment audit は required columns と最低対象 decision が task.md に明記されており、コメント品質観点は受け入れ条件として成立している。

APPROVED
