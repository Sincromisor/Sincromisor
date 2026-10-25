# 依存パッケージの修正と配布処理の確認

## 背景 / 目的

2026-10-11にPythonとAgentServerの依存パッケージを修正版へ更新し、配布成果物にも更新を反映した。

## 完了条件

- [x] 修正版へ更新可能な依存を更新し、対象の依存解決・ビルド・既存テストで確認する。
- [x] 配布成果物にもMCPクライアントの修正版を反映する。
- [x] 調査記録には成果物の公開範囲を適用する。

## 方針と変更範囲

Pythonの既存の`constraint-dependencies`へ修正下限を指定し、`uv.lock`を更新する。NeMo、ReazonSpeech、Torch、現行Transformersの版とGit参照は維持する。npmは警告対象と、その更新に必要な親依存だけを変更する。廃止済みNue-ASRの削除や互換性を確認できない強制更新は含めない。

通信契約とサービスの機能は変更しない。Mastraの配布処理については[AgentServer設計](../../../documents/design/backend/services/agent-server.md)を同期する。

## 更新した依存

| 更新対象                       | 更新前 → 更新後 |
| ------------------------------ | --------------- |
| Werkzeug                       | 3.1.8 → 3.1.9   |
| multidict                      | 6.8.0 → 6.9.1   |
| urllib3                        | 2.7.0 → 2.8.0   |
| `@modelcontextprotocol/client` | 2.0.0 → 2.2.0   |
| `@modelcontextprotocol/sdk`    | 1.30.0 → 1.32.1 |
| fast-uri                       | 3.1.7 → 3.1.8   |
| brace-expansion                | 5.0.9 → 5.0.12  |
| brace-expansion                | 1.1.18 → 1.1.21 |
| tsx配下のesbuild               | 0.27.7 → 0.28.2 |
| source-map-js                  | 1.2.1 → 1.2.2   |

`tsx`は4.21.0から4.22.0へ更新し、既存のesbuild 0.28.2と共通化した。重複していた旧esbuildと各環境用バイナリーがロックから削除される。

### MCPの固定依存と配布処理

`@mastra/mcp 1.17.3`はクライアント2.0.0を固定している。npmメタデータで1.18.0および最新2.2.0も同じ固定を確認したため、親の不要な更新を避け、`overrides`を`@mastra/mcp`配下のクライアントだけに限定する。修正版が要求するcore 2.2.0はその配下へ導入され、既存サーバー側のcore 2.0.0と分離される。

Mastraのビルドは出力依存定義ファイルへ`overrides`をコピーせず、配布用依存の再導入でクライアント2.0.0に戻ることを再現した。`build`スクリプトの後半でプロジェクトの上書き指定をコピーし、配布側のロックと導入済みパッケージも更新する。ローカルの`ignore-scripts=true`でも省略されないよう、npmのライフサイクルフックに依存せず明示的に実行する。後処理の失敗はビルド失敗として伝播する。Dockerfileもこの後処理をコピーする。

Mastraが修正版を標準採用した時点で上書きを外し、ほかの上書きがなければ後処理も削除できる。更新元の指定はプロジェクトの`package.json`だけに置く。

## 確認結果

- AgentServerの`npm run check`: 成功。`npm test`: MCPの一覧・認証・呼出し・失敗・取消、会話の分離など9件成功。初回はサンドボックスのローカル待受拒否とNodeの異常終了が発生し、待受を許可した同じテストの再実行は全件成功した。
- AgentServerの`npm run build`: 成功。配布用ロックと導入実体でもMCPクライアント2.2.0 / SDK 1.32.1を確認した。
- フロントの`npm run build`: 成功。`npm audit`は0件。
- Python 3.14の隔離環境で更新した3パッケージを導入し、multidictの大文字小文字を無視した複数値取得・集合演算、Werkzeugのパス逸脱拒否、urllib3のローカルHTTP分割圧縮応答の展開を確認した。圧縮展開は`decode_content=True`を明示する。

- `uv lock --check --offline`、変更したJS/JSONのBiome、MarkdownのPrettier、`git diff --check`、タスク状態・索引検査: 成功。

未実行: GPUを用いた実音声認識、実LLMとの会話、Dockerイメージのビルド。NeMoの中核依存は変更せず、Pythonは更新したパッケージの基本動作と全workspaceの依存解決、AgentServerは既存接続テストと本番用の配布ビルドを検証範囲とした。
