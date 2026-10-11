# RTCのGo依存とGo保守版を更新する

## 背景 / 目的

Pion・Prometheusと推移依存を更新し、既存のWebRTC通信と音声パイプラインを維持する。

調査基準日は2026-10-11。以下は公式レジストリとロックファイルを比較した更新候補であり、動作確認済みの採用版ではない。実装開始時に公開状況と依存条件を再確認し、互換性を満たす安定版を採用する。更新を見送る候補は具体的な制約と理由を記録する。

| 依存                                  | 調査時の採用版 | 更新候補 |
| ------------------------------------- | -------------- | -------- |
| `github.com/pion/interceptor`         | v0.1.48        | v0.1.49  |
| `github.com/pion/rtcp`                | v1.2.17        | v1.2.19  |
| `github.com/pion/webrtc/v4`           | v4.2.20        | v4.2.23  |
| `github.com/prometheus/client_golang` | v1.24.1        | v1.25.0  |
| `github.com/pion/datachannel`         | v1.6.2         | v1.6.3   |
| `github.com/pion/dtls/v3`             | v3.1.8         | v3.1.10  |
| `github.com/pion/ice/v4`              | v4.4.2         | v4.4.7   |
| `github.com/pion/mdns/v2`             | v2.2.0         | v2.2.2   |
| `github.com/pion/sctp`                | v1.11.1        | v1.12.0  |
| `github.com/pion/sdp/v3`              | v3.0.19        | v3.0.20  |
| `github.com/pion/srtp/v3`             | v3.0.15        | v3.1.3   |
| `github.com/pion/stun/v4`             | v4.0.0         | v4.0.1   |
| `github.com/pion/transport/v4`        | v4.1.0         | v4.1.1   |
| `github.com/pion/turn/v5`             | v5.1.1         | v5.1.2   |
| `github.com/prometheus/common`        | v0.71.0        | v0.72.0  |
| `golang.org/x/crypto`                 | v0.57.0        | v0.58.0  |
| `golang.org/x/image`                  | v0.46.0        | v0.47.0  |
| `golang.org/x/net`                    | v0.59.0        | v0.61.0  |
| `golang.org/x/sys`                    | v0.48.0        | v0.49.0  |

Go Module Proxyの各モジュールの`@latest`を参照した。同じモジュールパス内の更新であり、別メジャーパスへの移行は含めない。

## 完了条件（受け入れ条件）

- [ ] [go.mod](../../../sincromisor-server/sincro-rtc/go.mod)と`go.sum`を更新し、Pion一式とPrometheusの依存を矛盾なく解決できる。見送り候補には理由を残す。
- [ ] Go 1.26.8を1.26系の保守版へ更新する。調査時の候補は1.26.9。[RTCのDockerfile](../../../Docker/sincro-rtc/Dockerfile)と[ログ監視のDockerfile](../../../Docker/logging/observer/Dockerfile)にあるGoビルド環境も揃える。
- [ ] RTCの既存テストとビルドが通り、開発環境で接続・音声入出力・切断の主要経路を一度確認できる。

## 設計判断と変更範囲

依存更新と必要最小限のAPI互換修正を行う。Pionの直接・推移依存を一緒に解決し、各パッケージの最新版を親依存の条件を無視して強制しない。Go 1.27への移行、状態機械の再設計、RTC・音声パイプライン契約の変更は対象外。

Go更新に伴うログ監視バイナリのビルド確認を含める。RTCのDockerfileにあるフロントビルド段はこのタスクで再編しない。

## 確認方法

1. `sincromisor-server/sincro-rtc`で`go mod verify`、`go test ./...`、`go test -race ./...`、`go build ./cmd/sincro-rtc`を実行する。
2. [RTCのREADME](../../../sincromisor-server/sincro-rtc/README.md)に従い、既存の開発環境で主要なWebRTC接続・音声入出力・切断を一度確認する。ブラウザー操作にはPlaywright CLI利用ルールとスキルを使う。長時間・多端末の追加試験は必須にしない。
3. 変更したDockerfileのGoビルド段を確認する。実行環境不足で未確認の項目は具体的に記録する。

## 文書同期

RTCのREADMEと採用Go版を記載した現行文書を必要に応じて同期する。[RTC契約](../../../documents/design/contracts/frontend-rtc.md)と[音声パイプライン契約](../../../documents/design/contracts/audio-pipeline-websocket.md)を維持する。
