# Dependabot frontend dependency remediation

<!--
  起票の入口は /new-task（起票 + 独立レビューを一括）。既存 task.md を後から再レビューする
  場合は /review-task <task-dir> を使う。いずれも APPROVED を得てから /run-task に渡す。
  各節は tasks/AUTHORING-CHECKLIST.md（task-reviewer 評価観点の正本）に対応する。
  初回 NEEDS_REVISION の最頻出根拠は「設計判断の未確定」と「ドキュメント同期要否の未記載」。
-->

## 背景 / 目的

`sincromisor-frontend/package-lock.json` に対して、`js-yaml` 1件と `postcss` 2件の未解決 Dependabot alerts がある。修正版へ限定更新し、フロントエンドの既知脆弱性を解消する。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [x] `js-yaml` が `4.3.1` 以上へ更新される。
- [x] 推移依存 `postcss` が `8.5.23` 以上へ更新される。
- [x] `npm audit` が脆弱性0件を返し、フロントエンドの build / test / check が成功する。

## 設計判断（着手前に確定済み）

`js-yaml` は直接依存の下限を修正版へ上げる。`postcss` は既存依存の許容範囲内で lockfile のみ更新し、不要な直接依存を追加しない。

## スコープ境界

フロントエンドの open Dependabot alerts の解消だけを対象とする。サーバー依存と警告に無関係な一括更新は対象外。

## 実装方針（既存コード整合: file:line）

`sincromisor-frontend/package.json:36` と `sincromisor-frontend/package-lock.json` を npm で更新する。

## テスト

- `npm audit`
- `npm run check`
- `npm run build`
- `npm test`

## ドキュメント同期の要否

不要。依存パッケージの脆弱性修正版への更新であり、公開 API、通信契約、公開挙動を変更しない。
