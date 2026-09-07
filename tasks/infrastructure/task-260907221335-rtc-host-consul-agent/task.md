# VPS上のRTCを同一ホストのConsulエージェントへ接続する

## 背景 / 目的

ユーザーの実運用は複数ホストに跨り、RTCはグローバルIPv4を持つVPSにある。
サーバーへの直接登録はPion移行時の考慮漏れであり、ホスト側のConsulエージェントを経由する意図だった。
確認したHEADは `48725311008f1966683e5ddf4c6ee4f4dcecdc42`。
現在の `compose/sincro-rtc.yml` はConsulサーバーの正常性に依存し、`rtc` はサーバーとRTCの2サービスを選択する。

## 完了条件

- [ ] RTCと同じホストのConsulエージェントをComposeで配置し、RTCの登録・探索・解除のHTTP接続先にする。
- [ ] `rtc` 単独構成は新しいConsulサーバーを起動せず、既存の別ホストのサーバーへ参加する。full構成は既存のローカルサーバーを維持し、新エージェント経由で利用する。
- [ ] エージェントの参加先・広告先・必要ポート、RTCの登録先・ブラウザ向けIPv4の違いを設定サンプルと設計文書に明記する。
- [ ] 別ホストからのサービス探索とRTCへの到達、同一ホストのエージェントによる死活確認、終了時の登録解除を確認する。

## 設計判断 / 外部境界

既存のホストごとのConsul構成を維持し、中央への集約はしない。Go側のHTTP登録APIは再利用する。
`SINCRO_PION_CONSUL_HTTP_HOST/PORT` はRTCコンテナから同一ホストのエージェントへ渡す。
参加先は既存 `SINCRO_CONSUL_SERVER_HOST` を起点とし、ホストを跨ぐゴシップの広告先は導入先の管理ネットワークで到達できる値を使う。
別ホストの利用者から到達不能なDocker内部IPをRTCのサービスアドレスとして広告しない。
ブラウザ向け `SINCRO_PION_PUBLIC_IPV4` は別の責務として維持する。
実VPSの管理アドレス・ネットワーク・配備方法は着手時に確認し、未確認値で稼働先を切り替えない。
公開ネットワークへのConsul管理API公開を解決手段にしない。

## 変更範囲

`compose/sincro-rtc.yml`、`compose/consul-server.yml`、必要なエージェント設定、`examples/compose.env`。
Goの設定・登録処理は `sincromisor-server/sincro-rtc/internal/config/` と実際のConsul利用箇所を確認する。
`documents/design/infrastructure/compose.md`、`consul.md`、`documents/migration/pion/rollout-and-operations.md`、READMEを同期する。
WebRTCの通信形式、他サービスのエージェント削除は対象外。

## 確認方法 / 作業経路

実ホスト間の通信と配備を伴う高リスク変更。起票時に独立レビューし、実装時も対応する経路を使う。
full/rtcのCompose構成検査、Goの変更範囲の確認に加え、別ホスト相当の分離ネットワークで登録・探索・死活確認を検証する。
実VPSへの反映は接続条件確認後に行い、実施できない検証は理由と残作業を記録する。

## 着手前に確定する事項

独立レビューではネットワーク設定が不足しているため `NEEDS_REVISION` となった。
VPSと既存Consul側で使う管理ネットワーク、エージェントの `-bind` と `-advertise`、
ホスト間のTCP/UDP 8301の到達経路・公開先・ファイアウォールを確認して仕様を確定する。
RTC向けHTTP 8500はホストの公開ネットワークへ公開しない。
ホストの実アドレスは公開タスクへ記録せず、設定キーと役割、確認結果を記録する。

完了時は別ホストからRTCを発見でき、エージェントの `/health/ready` 確認がpassingとなること、
SIGTERM後の登録解除、RTCから下流探索が成功することを観測する。
実VPSまたは必要な二ホスト検証が実施できなければ、記録だけで完了扱いにしない。
