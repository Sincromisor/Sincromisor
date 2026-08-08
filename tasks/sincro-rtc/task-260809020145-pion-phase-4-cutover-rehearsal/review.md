# レビュー: task-260809020145-pion-phase-4-cutover-rehearsal

## 判定

NEEDS_REVISION

## 理由・申し送り

- 完了条件の smoke / rollback / restart 観測は検証可能だが、VPS とローカル Compose を跨ぐ Consul discovery の配置・接続契約が未確定である。現行 `compose/consul-server.yml` と `compose/sincro-rtc.yml` は単一 Docker bridge 内の `-retry-join=${SINCRO_CONSUL_SERVER_HOST}` を前提とし、server / agent に cross-host 用の `bind_addr`、`advertise_addr`、join 先、ACL / TLS を定義していない。VPS から `10.39.2.1:8500` が拒否される現在、Pion agent は下流サービスを発見できない。
- 最小で安全な構成は、ローカル側を唯一の Consul server として VPN address `10.39.2.1` を cluster advertise / join address に固定し、VPS の `consul-agent-rtc` だけをその server へ参加させる形である。VPS→ローカルには TCP 8300、TCP/UDP 8301（agent LAN gossip）、必要なら TCP/UDP 8302（WAN federation を選ぶ場合のみ）、TCP 8500（HTTP API）が必要で、いずれも `10.39.2.1` と VPS の VPN address の相互通信だけに制限する。8500、8300-8302 を public IPv4 に公開してはならない。これは既存のローカル下流サービスを同一 catalog のまま再利用し、別 Consul server / catalog を新設しない最小構成である。
- ただし Docker 内 Consul が VPN host address を advertise できる経路（host networking、明示的な bind / advertise、または host 経由で到達できる固定 address）と、VPS の VPN address / return route は実測で未確定である。`0.0.0.0` の client listener と host port 公開だけでは gossip と catalog の到達先を決められない。この選択は外部設定・ネットワーク所有権を伴うため AUTO_FIX にできない。
- VPS 側は TCP 8001 と Pion の固定 UDP 3479 を public IPv4 `163.44.97.57` へ公開する。Pion の `--public-ipv4` はこの値、`--media-udp` は container 固定 IPv4 と UDP 3479、container interface は実在名にする。TCP 8001 は aiortc と排他的に bind するため、同一 compose project での同時起動は禁止する。VPS repo が古く `.env` もないので、rehearsal 対象 commit と必要な環境値を VPS 上で `docker compose config` が成功するまで同期・固定する手順が必要である。
- browser smoke は HTTPS の frontend origin（有効証明書、当該 origin の microphone permission）と、その origin から同一 origin の `/api/v1/RTCSignalingServer/*` を VPS TCP 8001 へ reverse proxy する経路を前提に明記する必要がある。HTTP の public origin では microphone 取得を検証できず、証明書名と公開 host / proxy の対応が未確定のままでは Chrome / Firefox 条件を満たせない。
- 下流サービスの既存 Consul 登録 address はローカル Docker network の service address である。VPS agent が catalog から得たそれらの address に到達できるか、または service registration の public bind を VPN 到達可能 address へ移すかは未確定である。後者は既存サービスの責務・到達先を変えるため、対象 service ごとの所有者、変更影響、rollback を task に明記して選択する必要がある。
- 既存 `artifacts/gate-4-result.md` は前提未充足を FAIL とし未実行証拠を残している。task 本文は実装不具合を小 task に分割して再実行するとするが、network / TLS / discovery 前提失敗について、取得すべき証拠（VPS↔local の各 port 疎通、`consul members`、catalog の service address、Pion logs / `/health/ready`、browser console / ICE candidate）と、原因別の修正・再検証またはネットワーク所有者への明示的移管を一意に定めていない。このまま artifact 記録だけで終了し得るため補正が必要である。

## 自律補完

- なし。cross-host Consul の bind / advertise と下流 service address の供給方式、TLS termination / DNS 名、VPN firewall の変更主体には複数の妥当な選択肢があり、既存の公開契約と責務分担を変えずに一意に補完できない。
