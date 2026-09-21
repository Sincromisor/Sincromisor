# 実装と確認結果

## 結果

AgentServer・llama-serverの停止を復旧し、専用Consulエージェントを追加した。
実環境で3サービスがhealthy、Dockerの再起動ポリシーが `unless-stopped` であることを確認した。
AgentServer停止後にConsulがcriticalを検知し、修正版の再作成とConsul・LLM再起動後にクラスタ上でpassingへ戻った。
AgentServer経由の実LLMストリームで本文イベントと終端を確認した。トークン・会話内容は記録していない。

## 検証

- `npm --prefix sincromisor-server/agent-server run check`: PASS。
- AgentServerの `npm test`: 5件PASS。最終変更したHTTP・会話履歴試験を個別に再実行してPASS。
- feedback一覧は未認証・不正トークンで401、正しいBearer・Cookieで501。HTTPサーバーを組み立てる回帰テストで例外ログ0件を確認した。
- 実コンテナでもBearer・Cookieを交互に12回要求して501を確認し、サーバーログは増えなかった。
- StudioのAgents画面を認証状態で開き、定期取得中もサーバーの例外ログが増えないことを確認した。
- `node --test scripts/tests/llama-compose.test.mjs scripts/tests/consul-compose.test.mjs`: 4件PASS。
- `docker compose config --quiet`、本番イメージのビルド、修正版への再作成: PASS。
- 変更対象のBiome、Markdown整形、コメント点検: PASS。

制限環境ではNodeのHTTP・子プロセスを使う試験が失敗したため、同じ確認を制限外で実行して成功した。
ビルド時のMastra CLIの入口再公開に対する警告は従来の構造によるもので、ビルドと実起動は成功した。

## 残る制限

ホスト全体やDockerデーモンの再起動は未実行。実コンテナの再起動設定、サービス単位の再起動と復旧を確認した。
Dockerによる再起動ではComposeの依存待機は働かず、LLMロード中は生成失敗があり得る。
feedback管理は未対応のまま、ブラウザーには501が表示される。StudioのInbox定期取得自体は止めていない。
Consul登録は同じComposeネットワーク用であり、管理APIを他ホストへ公開しない。TCP確認はLLM準備完了を保証しない。
クラスタ登録の反映時にConsulのRPC接続でEOF・期限切れが一時発生したが、サービス登録・死活確認は正常へ収束した。

既存の未追跡 `volumes/proper-noun-dictionaries/` は変更・コミットしていない。
