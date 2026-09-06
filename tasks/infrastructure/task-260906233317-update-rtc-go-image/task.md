# RTCのGoビルド基盤を1.26系の修正版へ更新する

## 背景 / 目的

2026-09-06、HEAD `5bc93dcb1130fe339e4e114a7c2294dd97497463` を調査した。
[Dockerfile](../../../Docker/sincro-rtc/Dockerfile)は `golang:1.26.5-bookworm`、
[go.mod](../../../sincromisor-server/sincro-rtc/go.mod)は `go 1.26.5` を指定している。
[Go公式変更履歴](https://go.dev/doc/devel/release)によると1.26.6にセキュリティ修正、1.26.7と1.26.8に追加修正がある。
ユーザーの更新要求と修正済みツールチェーンの利用を根拠に、同じ1.26系の1.26.8へ更新する。

## 完了条件（受け入れ条件）

- [ ] ビルド用イメージを `golang:1.26.8-bookworm`、`go.mod` の最低版を1.26.8へ更新する。
- [ ] GoのテストとRTCイメージのビルドが成功し、生成バイナリの `go version -m` で1.26.8を確認する。
- [ ] 隔離した確認環境でRTCが起動し、Composeの死活確認に成功する。

## 実装方針 / スコープ境界

対象は上記2ファイル。1.27系への移行、Goモジュールの一括更新、Node.jsやUbuntuの世代変更は含めない。
Bookwormのビルド環境、Ubuntu 24.04の実行環境、CGOとlibopusの構成を維持する。
Docker Hub公開APIで1.26.8-bookwormの存在を確認済み（2026-09-02更新）。
通信契約や公開ポートは変更しないため、フロントの契約修正は不要。

## テスト

`sincromisor-server/sincro-rtc` で `go test ./...` を実行する。
リポジトリルートを文脈にDockerfileをビルドし、生成バイナリの版と動的リンクを確認する。
死活確認は [Compose](../../../compose/sincro-rtc.yml) の `http://127.0.0.1:8001/health/ready` を使う。
依存Consulを含む一時環境で確認し、稼働サービスは置き換えない。

## 文書同期 / 調査記録

[Compose設計](../../../documents/design/infrastructure/compose.md)と設計索引の導線を確認し、版を記載する現在文書があれば同期する。
起票時は定義、公式情報、配布タグの読み取りのみ。更新後のビルド・起動は未実行。
全体の調査結果は [コンテナ更新調査](artifacts/container-image-audit.md) を参照する。
