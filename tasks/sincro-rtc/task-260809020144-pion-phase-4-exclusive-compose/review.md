# レビュー: task-260809020144-pion-phase-4-exclusive-compose

## 判定

NEEDS_REVISION

## 理由・申し送り

- 先行3 task はすべて `done` / `PASS` であり、旧指摘の Consul agent 固定・`RTCSignalingServer` 未登録は解消済みである。Pion は `--consul-agent-host` / `--consul-agent-port` / `--service-bind-host` により既存 Consul 契約へ登録でき、draining 時の deregister も実装済みである。
- ただし、Pion 起動に必須の `--media-udp` は、指定 interface に実際に割り当てられた非 wildcard の literal IPv4 でなければならない。現行 `sincromisor-net` は IPAM / 固定 service IPv4 を定義しておらず、task.md も env から渡す対象に container media bind IPv4 を含めず、その供給方法を決めていない。`public IPv4`、`service-bind-host`、Docker の動的 bridge IP は互換な代替ではないため、Pion profile を確実に起動可能にする実装が一意に決まらない。固定IPv4を使うなら network subnet・service address・env/`--media-udp` の対応を、別方式ならその実在性を検証して起動引数へ渡す方法を受け入れ条件と実装方針に明記すること。
- Pion image は FFmpeg / libopus だけを install しており、既存 aiortc compose と同じ `curl` による HTTP readiness healthcheck を実行できない。task.md は readiness healthcheck を要求するが、現イメージで使う probe command、または image 側へ probe を追加する責務と確認方法が未指定である。compose だけで真の `/health/ready` を監視できるよう、使用可能な probe と必要な対象ファイルを明記すること。
