# AgentServerのMastra一式と実行環境を更新する

## 背景 / 目的

厳密固定されているMastra一式と開発依存・Node実行環境を更新し、既存の管理者認証、会話履歴、Studio、MCP接続を維持する。MCPのメジャー更新と保存領域・認証境界を含むため、このタスク仕様は独立レビューする。

調査基準日は2026-10-11。以下は公式レジストリとロックファイルを比較した更新候補であり、動作確認済みの採用版ではない。実装開始時に公開状況と依存条件を再確認し、互換性を満たす安定版を採用する。更新を見送る候補は具体的な制約と理由を記録する。

| 依存                           | 調査時の採用版 | 更新候補                     |
| ------------------------------ | -------------- | ---------------------------- |
| `@mastra/core`                 | 1.66.0         | 1.75.0                       |
| `@mastra/editor`               | 0.14.5         | 0.16.0                       |
| `@mastra/libsql`               | 1.22.5         | 1.25.1                       |
| `@mastra/loggers`              | 1.3.1          | 1.3.5                        |
| `@mastra/mcp`                  | 1.17.3         | 2.2.0                        |
| `@mastra/memory`               | 1.29.0         | 1.36.0                       |
| `zod`                          | 4.3.6          | 4.6.5                        |
| `@types/node`                  | 22.19.15       | 24.19.2（Node 24に合わせる） |
| `mastra`                       | 1.29.0         | 1.33.0                       |
| `tsx`                          | 4.22.0         | 4.23.15                      |
| `typescript`                   | 5.9.3          | 7.0.2                        |
| `@modelcontextprotocol/client` | 2.2.0          | 2.3.1                        |

npmの各パッケージの`latest`メタデータを参照した。Nodeは24.18.1→24.21.0を同一LTS系列の更新候補とする。

## 完了条件（受け入れ条件）

- [x] [依存定義](../../../sincromisor-server/agent-server/package.json)とロックファイルを更新し、Mastraの相互依存条件を満たす。採用版と見送り理由を記録する。
- [x] `@mastra/mcp`の2系移行に必要な互換修正を行い、core・editor・libsql・memory・CLIと一緒に検証する。候補のMCP 2.2.0にはcore 1.75以上、libsql 1.25.1にはcore 1.68以上が必要。
- [x] MCP SDKのoverrideが必要かを新しい依存構成で判断する。脆弱性対策を後退させず、開発用と`.mastra/output`の配布用の両方で実際に解決された版を確認する。
- [x] Node 24系の保守版をDockerのビルド段・実行段へ反映し、型定義も同系列へ揃える。TypeScript 7への移行に必要な設定・型修正を行う。
- [ ] 本番用ビルドの起動、認証、Studioの指示編集・公開、同一threadの履歴継続と別threadの隔離、MCP接続・呼出し・終了、Pythonへの応答ストリームが維持される。
- [x] 既存の保存済み指示と会話履歴を引き継げる。共有データを削除して更新を成立させない。

## 設計判断と変更範囲

[AgentServer設計](../../../documents/design/backend/services/agent-server.md)を既存契約とする。`src/mastra/`、`tsconfig.json`、`preserve-dependency-overrides.mjs`、`start.mjs`、[Dockerfile](../../../Docker/agent-server/Dockerfile)の変更は更新に必要な範囲へ絞る。AgentServerのnpm管理はフロントのworkspacesから独立したまま維持する。

`application.ts`と`mcp.ts`の認証・接続・終了処理、libSQLの例外ログ抑制、配布成果物へのoverride引継ぎを確認する。上流で代替可能になった回避策は、既存の保護と機能を同等に保てる根拠がある場合だけ整理する。

接続先・トークン・DBの供給元は[Compose](../../../compose/agent-server.yml)と既存設定を維持する。エージェントID、resource/threadの対応、管理者権限、MCPの取消・時間切れ、本文・資格情報を漏らさないログを維持する。新しいクラウドサービス、監視機能、保存方式、認証方式の追加は対象外。公開HTTP・音声ストリーム契約を変える必要が生じた場合は影響を明示し、無断で変更しない。

## 確認方法

1. AgentServerディレクトリで`npm ci`、`npm run check`、`npm test`、`npm run build`を実行し、配布用成果物の依存とoverrideも検査する。
2. 更新前の版でダミーの公開済み指示と会話履歴を作った使い捨てDBを用意し、そのコピーを新版で開いて指示・履歴の継続を確認する。共有DBと認証ボリュームは変更・削除しない。移行がある場合はコピーで可否を確認してから手順を記録する。
3. 本番用起動処理を通した開発環境で、未認証アクセスの拒否、認証後のStudio表示・指示編集・公開、既存のローカルLLMへの会話一件を確認する。Python側の`text-processor/tests/test_mastra_stream.py`と、実HTTPからのストリーム変換を確認する。
4. `src/mastra/__tests__/mcp-fixture.ts`など既存の接続試験を使い、実際のMCPClientで発見・ツール呼出し・取消または時間切れ・切断を確認する。本文や認証値をログへ出さない。主要経路を一度確認する範囲に絞る。
5. ブラウザー操作にはPlaywright CLI利用ルールとスキルを使う。環境不足で未実行の確認は理由と未確認範囲を記録し、確認済みと扱わない。

## 文書同期

[AgentServer設計](../../../documents/design/backend/services/agent-server.md)の採用版・配布手順・回避策を実装に同期する。設定や保存手順を変える必要がある場合は、[Compose設計](../../../documents/design/infrastructure/compose.md)、[保存領域設計](../../../documents/design/infrastructure/storage.md)、設定例も同時に確認する。

## 実装・確認結果

専用ワークツリーのコミット`ea988231`で実装した。環境の`min-release-age=5`を維持し、core 1.74.0、editor 0.15.6、libsql 1.25.0、loggers 1.3.4、mcp 2.1.2、memory 1.35.0、CLI 1.32.1、Zod 4.6.5、Node型定義24.19.1、tsx 4.23.15、TypeScript 7.0.2を採用した。候補表のより新しい版は公開後5日未満のため見送った。Node実行環境は24.21.0へ揃えた。MCPはSDK 2.0.0を要求するためoverrideを維持し、開発・配布ともclient 2.3.1の実解決を確認した。

公式Node 24.21.0を一時領域へ展開し、`npm ci`、型検査、9件の既存試験、Studio付き本番ビルドが成功した。旧版でダミーの公開済み指示と会話履歴を作成したDBをコピーし、新版での読出しと履歴追記を確認した。共有DBは変更していない。

本番起動で未認証・不正認証401、正当認証200を確認し、専用ChromeのStudioで指示編集・保存・公開・再読込みを確認した。Pythonの既存Mastraストリーム試験を含む59試験が成功した。固定応答のローカルLLM代替サーバーから本番Mastraを経由し、Python MastraClientで実HTTPの本文・正常終端を確認した。ただし代替応答は実LLMによる生成の検証とは扱わない。

実LLMの会話確認とDocker実行は環境不足で残っている。独立評価は未達項目によりFAILで、実装コミットは専用ワークツリーに保持しmainへ未統合。[実装記録](impl.md)と[評価](eval.md)を参照する。

専用ワークツリーの`npm run gate`も静的検査・ビルド・677件の単体テストがすべて成功した。実LLMとDockerの未確認はこの結果で代替しない。
