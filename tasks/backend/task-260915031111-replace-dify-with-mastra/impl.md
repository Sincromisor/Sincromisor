# 実装と確認

## 変更

chatで既存MastraTextProcessorWorkerを生成し、Dify実装・専用テスト・旧CLIと環境変数を撤去した。
Mastraトークンの確認はchat接続時だけ行い、sincroの単独起動を維持する。
Compose、Docker、設定サンプル、有効設計、READMEとコード例を同期し、変更したシンボルと処理のコメントを点検した。
Dify環境・履歴・資格情報と利用者の `.env` は変更していない。

## 確認

- Python対象22テスト、Ruff、format、型確認が成功。独立評価でもworktreeのsrcを優先して確認した。
- Composeの例示設定でfull / full,chatが解決し、実Dockerビルドが成功した。
- [ブラウザーの実環境確認](acceptance/verification.md)で全ての必須経路が成功した。
- 現行Dify参照はREADMEの廃止・既存環境保持の説明だけ。過去タスクとarchiveは維持した。
- 全体gateは既存Markdown15件の整形不一致でlint段階停止した。今回変更したMarkdownは個別Prettier確認が成功し、対象外の既存文書は変更していない。

## 稼働環境

実環境確認には非公開の一時envと検証イメージを使った。
タスクの共有環境復旧条件に従い、確認後の既存TextProcessorは元のイメージと利用者の `.env` に戻し、イメージID一致とhealthyを確認した。
そのため稼働中の既存chatはDify設定のままであり、今回のMastra切替は実装・検証・コミットまでとする。
運用切替ではREADMEに従って新しい設定を用意し、会話終了後にfull,chatで再作成する。
検証専用MCP・公開指示・一時ブラウザーを片付け、追加したllama-serverはGPU構成を維持する。
