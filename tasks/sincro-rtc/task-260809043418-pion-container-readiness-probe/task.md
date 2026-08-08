# Pion container readiness probeを追加する

## 背景 / 目的

Pion imageにはHTTP probe commandがなく、後続の排他的compose taskは`/health/ready`を実際に監視できない。
aiortc composeが使う`curl`をPion runtime imageにも用意し、composeが使うprobeの実行境界を固定する。

## 完了条件（受け入れ条件）

- [ ] `Docker/sincro-rtc-pion-poc/Dockerfile`のruntime imageに`curl`を追加し、非rootのPion containerから実行できる。
- [ ] 後続composeが`CMD curl --fail --silent --show-error http://127.0.0.1:8001/health/ready`をhealthcheckとして使う契約を、Pion READMEとmigration運用文書に記録する。
- [ ] Pion imageをbuildし、`curl --version`が成功することを確認する。`/health/ready`の応答は後続composeが必須設定を渡して起動してから確認する。

## 設計判断

- 既存aiortc composeと同じ`curl`を再利用する。image levelの`HEALTHCHECK`は追加しない。PionのHTTP portは開発時の8080とcomposeの8001で異なり、固定Dockerfile命令では正しいprobe先を表せないためである。
- probeの供給元はPion runtime image、消費先は後続の`compose/sincro-rtc.yml`に追加するPion serviceである。

## スコープ境界

- 本タスク: Pion runtime imageへのprobe command追加、probe endpoint/成功条件の文書化。
- 依存: `task-260809020144-pion-phase-4-container-image`のPion image。
- スコープ外: Pion compose service、healthcheck stanza、port mapping、network設定、実地cutover。

## 実装方針

既存のapt installへ`curl`を加える。Pion processのreadiness実装は変更せず、`/health/ready`が200のときだけ`curl --fail`が成功する既存HTTP契約をそのまま使う。

## テスト

- `docker build -f Docker/sincro-rtc-pion-poc/Dockerfile -t sincro-rtc-pion-poc:local .`
- `docker run --rm --entrypoint curl sincro-rtc-pion-poc:local --version`
- `npm run gate`と`npm run tasks:check`

必須確認が失敗した場合は、`tasks/README.md`の「失敗時の調査と継続」に従い、image build logとcontainer exit statusをcleanup前に採取して直接原因を修正・再検証する。

## ドキュメント同期の要否

要。`sincromisor-server/sincro-rtc-pion-poc/README.md`と`documents/migration/pion/rollout-and-operations.md`へ、compose healthcheckのcommand、endpoint、成功条件を記録する。Frontend RTC契約は変更しない。
