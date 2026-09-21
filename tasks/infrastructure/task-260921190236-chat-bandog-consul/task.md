# チャット基盤をConsul登録とbandog監視へ追加する

## 問題

AgentServerはConsulへ登録済みだがbandogの監視対象に含まれない。
llama-serverはDockerの死活確認だけで、Consulへの登録がない。
このため、会話に必要なサービスが欠けていてもbandogがhealthyになり得る。

## 変更範囲と方針

- `Docker/consul/bandog.sh` に `AgentServer` と `LlamaServer` を必須対象として追加する。
- 既存の `consul-agent-chat` にllama-serverの永続的な登録設定を追加する。
  内部アドレス `llama-server:8080` の `/health` を確認し、モデルロード中・停止中は正常としない。
- 登録の維持・復旧、内部サービスのタグ、確認間隔は既存AgentServerに合わせる。
- bandogは配置プロファイルによらずシステム全体を監視する。chat未配置・未登録も異常とする。
- 接続URLや認証方式は変更せず、Consul設計とCompose設計を同期する。

## 完了条件

- [x] 両サービスのConsul登録とbandog監視が対応し、既存監視対象も維持される。
- [x] LLMのHTTP正常・異常に応じてConsulの死活状態が変わり、登録は維持される。
- [x] 未登録・死活異常ではbandogの失敗件数が増え、復旧時に0へ戻る。
- [x] chat専用の起動範囲を維持し、追加登録設定がComposeに組み込まれる。
- [x] 必須監視とプロファイルの関係、反映方法、コメントを更新する。

## 確認方法

対象のCompose構成テストと、実際のConsul・bandogを使った隔離環境で正常・停止・復旧・未登録を確認する。
稼働環境では対象の監視コンテナに設定を反映し、Consul登録とbandogのhealthyを確認する。
変更文書の整形とタスク管理の整合性を確認する。

## 確認結果

- `node --test scripts/tests/llama-compose.test.mjs scripts/tests/bandog-consul.test.mjs`: 2件成功。
  実際のConsulとbandogを隔離ネットワークで起動し、正常、LLMの503、各サービスの停止・復旧、
  両サービスの未登録、Consul再起動後の設定からの再登録を確認した。検証用コンテナとネットワークは削除済み。
- `sh -n Docker/consul/bandog.sh` と変更したJavaScript / JSONのBiome確認: 成功。
- 変更文書のPrettier確認: 成功。既存の設計索引から参照可能。コメント点検: PASS。
- 稼働環境の監視コンテナへ反映し、両サービスのpassing、DNS応答、bandogの失敗件数0・healthyを確認した。
  ConsulのRPC同期失敗と復旧は[実装時の確認記録](impl.md)を参照する。

結合テストは既存ローカルの `hashicorp/consul:latest` と `ghcr.io/sincromisor/agent-server:latest` を使用する。
HTTP代役で停止・ロード中を再現し、稼働中の会話サービスには障害を注入しない。
