# 廃止済みの設定例を削除する

## 背景 / 目的

現行構成で使われていない設定例を削除し、導入時に旧構成を選ぶ混乱を防ぐ。ユーザーから調査結果に基づく削除とコミットを依頼された。

## 変更範囲

`examples/` の `config.yml`、`nginx.conf`、`redis.conf`、`sincromisor.service`、`voicevox.service` を削除する。
現行手順で使用する `compose.env` と `mcp.json` は保持する。旧Python設定クラスとDockerfileの `SINCROMISOR_CONF` 指定の整理は含めない。

## 完了条件

- [x] 対象5ファイルを削除し、現行の設定例2ファイルは変更しない。
- [x] 現行コード・構成・導入文書に削除対象への参照がないことを確認する。

## 確認結果

- `git grep` で削除対象への参照を確認した。残存する参照は旧設計のアーカイブ内にある `examples/config.yml` の履歴記述2件のみで、現行の利用元やMarkdownリンクはない。
- `config.yml` と `start-server.sh` による導入は `documents/INSTALL.md` で廃止済み。現行RTCはComposeから引数を受け取る。
- Redisは `configs/redis.conf`、フロント配信は `configs/Caddyfile`、VOICEVOXはComposeのサービス定義を使う。
- 対象5ファイルの不存在と残す2ファイルのHEADとの内容一致を確認した。
- `git diff --check`、変更MarkdownのPrettier検査、`tasks:index:check`、`tasks:check` は成功した。

## 文書同期と確認範囲

現行の導入手順・通信契約は変わらないため、設計文書の変更は不要。旧設計アーカイブは履歴として保持する。
未使用の設定例の削除に限るため、サービス起動試験は実施しない。リポジトリ外へ手動配置された設定例の利用状況は未確認。
