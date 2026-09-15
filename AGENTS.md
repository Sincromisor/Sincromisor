# AGENTS.md

Sincromisor を変更するエージェントの入口。共通の制約をここに置き、設計・規約・手順は作業に関係する参照先を読む。

## プロジェクト

ブラウザー上で好きなキャラクターと会話し、そのキャラクターになれるサービス基盤。ローカル／オンプレミス提供を前提とし、外部サービスのAPIを採用前提にしない。AgentServerと接続先LLMも管理下の環境へ配置する。

- `sincromisor-server/`: Go/PionがWebRTCと音声パイプラインを調停し、Pythonの音声区間抽出・認識・応答生成・音声合成へ接続する。サービス発見はConsul。
- `sincromisor-frontend/src/`: TypeScript、Vite MPA、Reactの共通枠組み、Three.js / VRM 1.0。`app/` はアプリ制御、`features/` は機能、`character/` は描画・動作、`pages/` はページ。
- `documents/design/`: 現在有効な設計と契約。作業記録は `tasks/` に置く。

## 作業の進め方

- ユーザーの明示要求と、このセッションで既に決まった範囲・許可を、リポジトリ文書やスキルの既定手順より優先する。実行環境の権限制約は守る。
- 依頼された結果まで進める。通常の実装判断、ローカルの編集・対象確認・今回の変更による失敗の修正は、その都度の承認を求めず行う。未決定事項が要求結果や安全性を左右する場合だけ確認し、回答に依存しない作業は継続する。
- 文書やスキルを理由に確認・停止が必要なら、読んだファイルへのリンク、該当指示の引用、今回への適用理由を示す。明文の要求と自分の解釈を区別する。
- 個人の趣味開発として、必要な結果が動く最小の構成を選ぶ。後方互換性より負債を残さないことを優先するが、既存契約を変更するときは影響を明示する。
- 通常変更は現在のワークツリーで直接変更し、対象確認と1コミットで完了する。専用ワークツリー・独立レビュー・評価は、明示要求、分離が必要な統合変更、失敗コストが高い変更に限定する。
- 必須要件の根拠はユーザー要求、既存契約、再現済み不具合、セキュリティ・データ損失防止、実行上の制約とする。根拠のない性能値・網羅試験・複数環境対応を追加しない。明示要求された要件を簡略化のために削らない。
- 対象確認が通れば完了処理へ進む。検査の拡大・再実行は追加変更、失敗、未解決の懸念がある場合に行う。変更前からある対象外の不整合は悪化させなければ停止理由にしない。詳細は [確認コマンド](tasks/README.md#確認コマンド) と [警告方針](tasks/README.md#biomeの警告の扱い) を参照する。
- ユーザーの未コミット変更を上書きしない。秘密情報・実写素材などの扱いは、該当する作業で [成果物の公開範囲](tasks/README.md#公開成果物と非公開検証原本) を確認する。

## 対象に応じて読む

対象ファイルや問題が分かっていれば、関連コードと必要な規約・契約から着手する。以下の一覧を一括で読む必要はない。全体像が必要な場合は [README.md](README.md) と [構成概要](documents/design/architecture/overview.md)、参照先が不明なら [設計索引](documents/design/index.md) を使う。

| 作業                     | 参照先と確認する内容                                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebRTC・通信契約         | [フロントとのRTC契約](documents/design/contracts/frontend-rtc.md)、[音声パイプライン契約](documents/design/contracts/audio-pipeline-websocket.md)。`sincro-rtc/internal/signaling/`・`internal/rtc/` とフロントの `features/rtc/rtcTalkClient.ts` など、提供側と利用側を確認する |
| UI・ページ・3D           | [共通枠組み](documents/design/frontend/app-shell.md)、[ページ構成](documents/design/frontend/pages.md)、[キャラクター概要](documents/design/frontend/character/overview.md) から変更対象を選ぶ                                                                                   |
| 下流サービス             | [バックエンドサービス](documents/design/index.md#バックエンドサービス) から対象サービスの責務・接続を確認する                                                                                                                                                                    |
| 設定・起動・保存領域     | [Compose](documents/design/infrastructure/compose.md)、[Consul](documents/design/infrastructure/consul.md)、[保存領域](documents/design/infrastructure/storage.md)。設定追加時は `examples/compose.env`、`compose.yml` / `compose/`、設定クラス、実装、設計を同期する            |
| コード                   | [構造規則](documents/rules/code-structure.md) と対象言語の [Python](documents/rules/coding-py.md) / [TypeScript](documents/rules/coding-ts.md) / [Go](documents/rules/coding-go.md)                                                                                              |
| 本番コードのコメント     | [コメント品質](documents/rules/source-comments.md)。安全な変更と調査時間短縮の両方を満たし、変更したシンボル・処理群・判断と直接の変更理解範囲を全件点検する。既存由来でも必須コメントの欠落・説明不足・陳腐化は解消してから完了する                                             |
| Markdown                 | [Markdown規約](documents/rules/coding-md.md)。設計の作成・分割・廃止では [文書運用ガイド](documents/design/documentation-guide.md) も確認する                                                                                                                                    |
| タスク・コミット         | [タスク管理](tasks/README.md)。起票の追加観点は [起票チェックリスト](tasks/AUTHORING-CHECKLIST.md) の該当節                                                                                                                                                                      |
| エージェント文書・スキル | 下記の編集元と [独自変更](.agents/CUSTOMIZATIONS.md) を確認する                                                                                                                                                                                                                  |

説明文、見出し、表の列名、コードコメントは一般的な日本語で書く。識別子、設定キー、原文引用、公式の固有名詞など正確な原表記が必要な箇所だけ英語を使う。

通信契約（エンドポイント / JSON / DataChannel / msgpack）を変更する場合は破壊的変更として明示し、フロントとサーバーを同時に確認する。設計変更では該当文書を同期し、設計索引から辿れることを確認する。

## スキルの選択と編集元

- タスクの起票を依頼された場合は `new-task`、既存タスクの実行を依頼された場合は `run-task` を使う。起票だけの依頼を実装へ広げない。次タスクの抽出は `npm run tasks:next` を使う。
- ブラウザーの操作・画面確認・Playwrightテストを扱う場合は [playwright-cli](.agents/skills/playwright-cli/SKILL.md) を使う。UIコードを編集するだけなら読み込む必要はない。
- `new-task` / `run-task` の編集元は `.claude/commands/`、サブエージェントは `.claude/agents/`。`npm run gen:codex` で `.agents/skills/` と `.codex/agents/` を同期し、`npm run gen:codex:check` で確認する。生成印のない `playwright-cli` は直接編集する。
- スキルの説明は用途と適用場面を短く書く。本文には共通の制約と必要な参照先を置き、用途別の詳細は必要時だけ読む。規約や手順を複製しない。

## 完了と報告

タスクは `tasks/<category>/task-<id>-<slug>/` に置き、`meta.yaml` の状態は `tasks:set` / `tasks:close` で更新する。通常変更は実装、確認結果を記したタスク文書、状態、索引を同じコミットに含める。`review.md` / `eval.md` は独立確認を実行した場合だけ、`impl.md` は判断・逸脱・未実行確認・残リスクの記録が必要な場合だけ作る。

コミットはConventional Commitsに基づく日本語の件名と、一段落の日本語本文（理由・変更・確認・残リスク）、タスクIDの `Refs:` フッターを使う。初回は `npm run git:hooks:install` を実行する。詳細は [コミット規約](tasks/README.md#コミットメッセージ) を参照する。

最終報告は結果を先に、変更点・確認結果・未実行事項や残る問題を簡潔に示す。該当しない検査の列挙や、求められていない次タスク提案は不要とする。
