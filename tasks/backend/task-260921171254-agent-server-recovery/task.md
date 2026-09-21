# AgentServerの再起動・Consul登録・未対応feedbackの修正

## 背景と目的

ユーザー報告の3件を調査し、ローカルのチャット基盤を復旧する。
実環境でAgentServerとllama-serverが停止し、両サービスに再起動ポリシーがないことを確認した。
ConsulにはAgentServerの登録処理がなく、ログにはlibSQLの `listFeedback` 未対応例外が繰り返し出ていた。

## 完了条件

- AgentServerとLLMにホスト再起動時の復帰設定を加え、実環境の起動を確認する。
- ConsulへAgentServerを登録し、起動・停止・再起動に応じた死活確認を行う。
- feedback一覧の未対応を明示したまま、定期取得によるサーバーの大量例外ログを解消する。
- 認証と会話履歴の分離を維持し、設計・回帰テストを同期する。

## 設計判断と変更範囲

Composeの `restart: unless-stopped` をAgentServer、llama-server、専用Consulエージェントへ設定する。
Consulは設定ファイルで内部名 `agent-server:4111` を登録し、トークンを共有しないTCP確認を使う。
停止中は登録を維持し、再作成・IP変更・起動順による登録欠落を防ぐ。分散配置のgossipには8319を追加する。
TextProcessorの接続先と生成APIの契約、既存のDB・認証ボリュームは変えない。

Mastra標準の保存領域設定で未使用の `observability` を無効化する。
StudioのInboxは501でも3秒間隔の取得を続けることをブラウザーと採用版のコードで確認した。
一覧GETに限定した前段処理で、共通のSimpleAuthが認証した要求へ例外化せず501を返す。
未認証要求と他のAPIは標準処理へ委ね、ログ全体の抑制や空の成功応答は行わない。
feedback管理機能の新規実装や依存更新は範囲外である。

## 確認

型検査、AgentServerの既存テストとfeedbackの認証・無ログ確認、Composeのプロファイル・公開範囲テストを実行する。
本番イメージを再ビルドし、実環境で認証付きAPI、Consul登録、再起動後の復旧、feedback要求時のログを確認する。
実行結果と未実行事項は [実装記録](impl.md) に記す。

## 設計の同期

[AgentServer](../../../documents/design/backend/services/agent-server.md)、
[Compose](../../../documents/design/infrastructure/compose.md)、
[Consul](../../../documents/design/infrastructure/consul.md)を更新する。
未対応だった監視APIの500を501へ変更するが、既存の生成・認証・保存契約は変えない。
