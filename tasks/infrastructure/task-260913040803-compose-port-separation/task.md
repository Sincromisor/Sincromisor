# Composeの標準公開を絞り分散配置と管理用ポートを分離する

## 背景 / 目的

ユーザー要求に基づき、単一ホストの標準構成はHTTP 8086/TCPとメディア3479/UDPだけを公開する。
別ホストのRTCが下流4サービスの8002〜8005へ直接接続する既存運用は、管理IPへ公開する追加Composeで維持する。

## 完了条件

- [x] 標準full構成のホスト公開はHTTPと設定されたメディアUDPだけとなる。
- [x] 分散配置用はRTC・下流API・Consulのホスト間通信のみを管理IPv4へ公開する。
- [x] 管理用はRTC HTTPとConsul管理APIをループバックへ公開する。
- [x] 追加ファイルを併用してもrtcプロファイルはRTCと同居エージェントの2サービスに限られる。
- [x] 配布用設定、README、Compose・Consul設計、RTC運用文書を同期し、移行方法を示す。

## 設計判断と変更範囲

既存のサービス定義から不要な `ports` を削除し、`compose/distributed.yml` と `compose/management.yml` へ必要分だけ追加する。
分散用の公開先は既存の `SINCRO_CONSUL_PUBLISH_HOST` を再利用し、空欄はComposeの変数展開で拒否する。
この値はComposeだけが消費する。Python・Goの設定クラス、JSON・WebSocket形式、内部待受ポートは変更しない。
Consul登録先は単一ホストではサービス名、分散配置では管理IPを使う。
サンプルのメディアUDPは要求に合わせて3479にし、既存環境の設定値は維持する。

ホスト公開の変更は破壊的変更であり、分散配置では再作成前に追加ファイルを選択する必要がある。
Redis・S3・VOICEVOXは音声合成と同居する現在の配置に合わせて内部通信を維持する。
未使用のHTTPS、メトリクス、Consul WAN・HTTPS/gRPC・ホスト向けDNSの公開は追加しない。
非公開の運用情報は公開文書へ転記しない。

## 確認結果

- `node --test scripts/tests/consul-compose.test.mjs`: 3件成功。実際のCompose結合結果で標準・分散・管理の公開一覧とrtcの起動範囲を検査した。
- ローカル `.env` の追加ファイル選択を更新し、`docker compose config` で既存の管理IPと下流登録先を維持できることを確認した。
- 対象JavaScriptのBiome検査、変更MarkdownのPrettier確認、タスク・索引検査、`git diff --check` はすべて成功した。
- Composeコメントと設定の説明を点検した。設計索引から既存のCompose・Consul文書へ到達できる。

## 未実施事項

稼働コンテナの再作成、VPSへの配備、変更後の実通信・会話確認は未実施である。
ローカルの非公開起動設定とVPS運用メモには追加ファイル選択と移行確認手順を記載した。
VPSの新定義を反映する際も、同じ追加ファイルを選択してから再作成する必要がある。
