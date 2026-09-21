# エージェント定義と初期プロンプトを分離する

## 目的

`application.ts` に同居するサーバー初期化とキャラクター定義を分離し、定義の差し替えとプロンプト編集の場所を明確にする。

## 受け入れ条件

- キャラクター定義を `agents/character.ts`、初期プロンプトを `prompts/character.ts` へ切り出す。
- 生成関数はモデルと保存領域を引数で受け取り、環境変数の読取りやサーバー起動を行わない。
- プロンプト本文、エージェントID、生成・履歴設定、認証、MCP、Editorの動作を維持する。
- 編集箇所と反映方法、Studioの公開済み指示の優先を設計文書へ記載する。

## 実装と確認

既存のMastra構成から定義と初期プロンプトを抽出した。接続先と保存領域の所有は `application.ts` に残し、キャラクターの振る舞いに関する設定を生成関数へ集約した。新しい依存関係や通信契約の変更はない。

既存の会話履歴テストに、分離した初期プロンプトが実際のモデル要求へ渡される確認を追加した。確認結果は以下のとおり。

- AgentServerの `npm run check`: 成功。
- `MASTRA_TELEMETRY_DISABLED=true MASTRA_AUTO_REFRESH_PROVIDERS=false npm test`: 全5件成功。
- 同じ環境変数を付けた `npm run build`: 成功。
- 変更したTypeScriptのBiome検査、MarkdownのPrettier検査、`git diff --check`: 成功。
- `npm run tasks:index:check` と `npm run tasks:check`: 成功。
- コメント点検: PASS。

初回の制限環境ではテストがNodeの異常終了、ビルドがネットワーク依存の待機になったため、実行権限を付けて再実行し成功した。Mastra CLIは既存の再公開形式の入口に警告を出すが、本番成果物の生成は成功する。稼働サービスの再作成と実LLMによる会話確認は行っていない。
