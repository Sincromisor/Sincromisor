# staging VPS 再開メモ

更新日: 2026-08-09

## 接続先と現在状態

- SSH: `ssh gloria@malvales.hachune.net`
- staging URL: `https://sincromisor-staging.negix.org/`
- VPS public IPv4: `163.44.97.57` (`ens3`)
- VPS VPN: `10.39.2.1/24` (`wg2`)
- 開発環境（このworktree）のVPN: `10.39.2.8/24` (`wg2`)
- VPS上の実行用worktree: `/tmp/sincromisor-gate4-rehearsal`
- 実行compose project: `sincromisor`。全compose操作に
  `--project-name sincromisor` を付ける。

現在はPionが起動済みでhealthyである。

```sh
ssh gloria@malvales.hachune.net \
  'curl --fail --silent http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses'
# {"sessions":0,"session_limit":10,"ready":true,"draining":false}
```

公開portはTCP 8001とUDP 3479。UDP 3479のVPS firewall dropは解消済みで、Chromeから
Pion ICE `connected` を確認している。

## VPN下流service

下流APIはVPSではなく、この開発環境で動く。VPSから以下は到達済み。

```text
10.39.2.8:8002 SpeechExtractor
10.39.2.8:8003 SpeechRecognizer
10.39.2.8:8004 TextProcessor
10.39.2.8:8005 VoiceSynthesizer
10.39.2.8:8500 Consul HTTP API
```

開発環境のConsul catalogは下流4 serviceを `10.39.2.8` で登録している。
VPSと開発環境はどちらもDocker subnet `172.28.0.0/16` を使うため、VPSの
`consul-agent-rtc` を開発環境Consulへmemberlist joinさせてはいけない。広告される
`172.28.0.x` がVPS自身のnetworkと衝突するためである。

aiortcはConsul HTTP APIを直接参照する。現在VPS `.env` には次を設定済み。

```text
SINCRO_CONSUL_SERVER_HOST=10.39.2.8
SINCRO_CONSUL_AGENT_HOST=10.39.2.8
SINCRO_PION_CONSUL_HTTP_HOST=10.39.2.8
SINCRO_PION_SERVICE_BIND_HOST=10.39.2.1
```

## ローカルコードとVPS同期

現在のローカルHEADは `d2deef4`。

- `d2deef4 fix(rtc): allow external Consul HTTP endpoint`
  - `compose/sincro-rtc.yml` は
    `${SINCRO_CONSUL_AGENT_HOST:-consul-agent-rtc}` を使う。未指定時の通常compose動作は不変。
- `e267cfc` / `edfd57d` は aiortc Docker CMDを `uv run --no-sync` とし、runtimeのPyPI依存解決を除去した。

VPS worktreeはGitHub SSH鍵がなく `git pull` できない。現在、検証のため次の2ファイルだけが
ローカル変更としてVPS worktreeに同期済みである。

```text
Docker/sincro-rtc/Dockerfile
compose/sincro-rtc.yml
```

将来の同期も対象ファイルを確認して `scp` で明示的に送る。VPSの既存checkoutは履歴が分岐しているため、
`git reset` / rebase は行わない。

## 実証済み事項

- Pion: public HTTPS config / offer / candidate、Chrome ICE `connected`、`sessions=0`への収束。
- Pion: TCP 8001・UDP 3479公開、health readiness、stop後の起動を確認。
- aiortc: `--no-build --no-deps` 起動、公開signaling、Chrome音声track受信、
  VPS→VPN下流4 WebSocket接続を確認。
- aiortc image: `docker run --network none` でstatus endpoint応答。詳細は
  `tasks/sincro-rtc/task-260809190756-aiortc-rollback-offline-start/artifacts/offline-start.md`。

## 未達のGate 4受け入れ条件

1. PionでChrome/Firefox各1回の1 turn会話（利用者/応答text、telop、非無音合成音声）。
   ChromeはICE接続まで、Firefoxは未実施。
2. Pion process crash後のrestart policyによる自動再起動、ready、新規session受理。
3. aiortc rollbackのChrome/Firefox smoke。
   aiortc composeはTCP 8001のみ公開しmedia UDPを公開しないため、現在のpublic経路ではICEが
   `connecting` で停止する。固定3479/UDPだけを使うPionとの差分である。
4. Gate 4 artifactとroadmapの最終判定更新。

## 直近の再開手順

Pion状態を確認する。

```sh
ssh gloria@malvales.hachune.net '
  curl --fail --silent http://127.0.0.1:8001/health/ready
  curl --fail --silent http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
'
```

Chrome fake microphoneでPion smokeを行う（`開始する`後、Pion logでICE `connected` を確認）。

```sh
node --input-type=module
```

Playwright実行例はtask履歴またはこのセッションを参照する。Chromeには次の起動引数が必要。

```text
--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream
--use-file-for-fake-audio-capture=sincromisor-server/sincro-rtc-pion-poc/internal/gate3/testdata/gate3-input.wav
```

Pion logとmetricsの確認。

```sh
ssh gloria@malvales.hachune.net '
  cd /tmp/sincromisor-gate4-rehearsal
  docker compose --project-name sincromisor --profile pion logs --tail=120 sincro-rtc-pion
  curl --fail --silent http://127.0.0.1:8001/metrics
'
```

aiortcへ切り戻す場合は、Pion停止後に次を使う。`SINCRO_CONSUL_AGENT_HOST=10.39.2.8` が
containerに入っていることを確認する。

```sh
cd /tmp/sincromisor-gate4-rehearsal
docker compose --project-name sincromisor --profile pion stop -t 6 sincro-rtc-pion
docker compose --project-name sincromisor --profile full up -d --no-build --no-deps sincro-rtc
docker inspect sincromisor-sincro-rtc-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep SINCRO_CONSUL_AGENT_HOST
```

Pion起動時は固定IP `172.28.0.10` が空いている必要がある。VPS側の誤起動した
`consul-agent-recognizer` がこのIPを取った場合は、staging不要containerを停止・削除してから起動する。

## 注意

- `sudo systemctl restart docker` 後、Docker image pullが一度停止した。2回目のrestart後は復旧した。
- staging環境はテスト専用であり、途中検証後にaiortcへ復旧する必要はないとのユーザー指示がある。
- Gate 4 taskは `tasks/sincro-rtc/task-260809020145-pion-phase-4-cutover-rehearsal/`、statusはopen。
