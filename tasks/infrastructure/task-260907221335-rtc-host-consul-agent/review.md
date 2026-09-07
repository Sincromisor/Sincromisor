# レビュー: task-260907221335-rtc-host-consul-agent

## 判定

NEEDS_REVISION

## 理由・申し送り

- 背景には、RTCを中央Consulサーバーへ直接登録している現行Composeから、ホスト側エージェント経由へ移すという運用上の根拠がある。Goの`discovery.Registration`は任意のConsul HTTPエンドポイントへ登録・解除し、同じエンドポイントから下流サービスも解決するため、WebRTC通信契約やGo実装を変えずにCompose、設定例、運用文書を変更する範囲は一意に進められる。
- 現在の`rtc`プロファイルは`sincro-consul-server`も選択し、`sincro-rtc`はその正常性へ依存する。`rtc`ではローカルサーバーを選択・依存対象から外し、RTCと同じComposeネットワークの新エージェントへ`SINCRO_PION_CONSUL_HTTP_HOST`を向ける必要がある。`full`ではローカルサーバーを維持し、そのエージェントが同サーバーへ参加する。このプロファイルの責務分離と、RTC向けConsul HTTP APIをホストへ公開しないことは、既存構成から一意に決まる。
- ただし、VPS用エージェントのネットワーク方式は未決定であり、このままでは実装を確定できない。Docker bridgeを使う場合、エージェントの`-bind`はコンテナ内の待受先、`-advertise`は既存Consulメンバーが到達できるVPS管理IPv4、TCP/UDP 8301のホスト公開とファイアウォールはその広告先への受信経路として対応させる必要がある。HTTP 8500はRTCコンテナからの内部接続だけにし、公開ネットワークへ公開しない。ホストネットワークを使う場合は、full構成のローカルサーバーと8301を共用できないため、ポート設計またはfullの起動構成を別途選ぶ必要がある。既存の他サービス用`-retry-join`と`-client=0.0.0.0`だけでは、Docker内部IPv4がgossipの広告先になるおそれがある。
- 実装前に、(1) VPSと既存Consulホストで相互到達する管理IPv4、(2) エージェントのネットワーク方式、`-bind`、`-advertise`、LAN gossipポート、(3) TCP/UDP 8301の公開元・公開先・ファイアウォール規則、(4) 既存サーバーへの参加先とRTCの`/health/ready`を実行できる管理経路を確定する必要がある。`SINCRO_PION_PUBLIC_IPV4`はブラウザ用であり、これらの管理値に流用しない。
- 高リスク変更の完了は、選定済み値による二ホスト確認が必要である。外部サーバーから`RTCSignalingServer`を発見し、その確認がpassingになること、SIGTERM後に同じ探索結果から登録が消えること、RTCから下流4サービスを解決できることを観測する。実VPSまたは二ホスト検証ができない場合、記録だけで完了にはできない。
- Goの設定・登録処理は`internal/pipeline/discovery/registration.go`と`cmd/sincro-rtc/server.go`で既に登録アドレス、`/health/ready`確認、解除順序を持つ。変更が不要なら変更しない。変更する場合だけ、その契約を守る試験と`documents/rules/source-comments.md`を直接適用する。

## 自律補完

- `AUTO_FIX`: `task.md`の「確認したHEAD」を現行HEAD `163b46f2927788de98da8d68af0853a561f091f1`へ更新する。実装方針に影響しない記録の同期である。
- gossipの広告・到達経路、エージェントのネットワーク方式、full構成での8301共用可否は公開構成と実運用の選択を伴うため、自律補完できない。
