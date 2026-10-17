# Docker Compose管理ルールとエージェント参照を追加

## 背景と目的

ユーザー要求に基づき、インストール済みのDocker公式スキルを活用してCompose管理ルールを `documents/rules/`へ設け、エージェントが作業時に参照できるようにする。

## 完了条件

- [x] 構成変更・起動依存・設定と秘密情報・公開範囲・保存領域・削除操作・確認方法を管理ルールにまとめる。
- [x] 参照した公式スキルと採用範囲を明記し、既存のCompose設計と矛盾させない。
- [x] `AGENTS.md`から管理ルールへ到達でき、適用する作業が分かる。
- [x] 変更したMarkdownの整形、相対リンク、タスク状態と索引の整合を確認する。

## 変更範囲と判断

- [管理ルール](../../../documents/rules/docker-compose.md)を新設し、[AGENTS.md](../../../AGENTS.md)の用途別参照へ追加した。
- `docker-compose-patterns`と `docker-destructive-guardrails`を読み、起動依存、保存・秘密情報、削除前の対象確認を採用した。
- `compose.yml`と `include`、モデル保存用バインドマウント、既存ネットワーク、ソースからのビルド、初期化処理は既存契約を優先した。公式スキルの一般例による一括移行は求めない。
- `include`、`config`、`down`の公式資料を確認し、参照日と採用範囲を管理ルールに記載した。
- 既存のエージェント実装手順は `AGENTS.md`を読むため、生成元・生成物への参照重複は追加しない。
- Compose設定・サービス実装・実環境の状態は変更しない。既存の未コミット変更は対象外とする。

## 確認結果

- 変更したMarkdownのPrettier確認と `git diff --check`はPASS。相対リンク先36件の存在と既存Compose設計との整合を確認した。
- `npm run tasks:index`で索引を更新し、`npm run tasks:index:check`と `npm run tasks:check`はPASS（553タスク）。
- 文書だけの変更のため、コンテナ起動・GPU・実サービスの接続確認は行わない。既存イメージの未固定指定は今回の規約追加で変更しない。
