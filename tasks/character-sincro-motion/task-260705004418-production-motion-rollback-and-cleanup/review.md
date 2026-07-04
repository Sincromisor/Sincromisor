# Review: task-260705004418-production-motion-rollback-and-cleanup

## 判定

APPROVED

Critical / High の blocking 指摘はない。依存タスクの review metadata は `APPROVED` に更新済みで、task.md は full application の PASS commit / artifact 確認を cleanup 開始条件として保持しているため、実装に進めてよい。

## 指摘事項

なし。

## 実装者への申し送り

- 直接依存の `task-260705004415-full-normalized-pose-application` は現時点で `status: open` / `review: APPROVED` / `reviewed_sha: edf9f7d63b8843663a44bfaa9fcdce43ed20aa7f` である。レビューは通っているが実装完了を示す close / PASS artifact ではないため、task.md の受け入れ条件どおり、full normalized pose application の PASS commit / artifact が確認できるまで cleanup に入らず停止すること。
- 依存タスク側の申し送りでは、`fullNormalizedPoseApplicationMode: "off" | "upper_body"` を `SincroPoseRetargetConfig` 近傍に置き、通常設定 UI、URL query、env var、backend API、保存設定 contract へ広げない方針が確定している。本 cleanup task でもこの境界を前提に rollback runbook と stale path 削除を整理すること。
- 依存タスク側の rollback 境界は、`"off"` が full `setNormalizedPose(finalPose)` だけを止め、前段の arm / torso / shoulder / semantic / finger flag を暗黙変更しない、というもの。本 cleanup task の runbook では各段階へ戻す手順を明示し、full switch と前段 temporary flag の責務を混同しないこと。
- 既存コード参照は現状と整合している。`documents/design/frontend/character/motion.md:468` から `:471` は Production Application Gates の段階表、`sincroPoseRetargetTypes.ts:76` は `composerArmApplicationMode` の temporary flag コメント、`vrmCharacterManager.ts:302` は flag 切替 lifecycle、`sincroVrmPoseComposerDryRun.ts:21` / `:115` は dry-run status と stale result 非返却の contract を指している。
- cleanup inventory では「削除」「残置」「後続 task 送り」を artifact に分けて記録し、残す debug-only 経路は目的、削除条件、所有者を comment audit と artifact の両方に残すこと。
- `runtime-motion-ownership-map.md` は現時点で direct write / composer 移行判断の正本になっているため、production code を消した場合は map 上の書き手・分類・follow-up note が stale にならないよう同時更新すること。
- comment audit は task.md 指定の列と最低対象を満たすだけでなく、弱い既存コメントの rewrite / delete、TODO の canonical task ID と削除条件、public export / boundary / lifecycle / heuristic の省略理由まで `impl.md` と実コードで照合可能にすること。

APPROVED
