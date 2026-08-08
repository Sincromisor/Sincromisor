# Pion RTC serverのproduction container imageを作成する

## 背景 / 目的

Pion serverはローカル実行しかできず、production composeから起動できるimageがない。Phase 3で確定した
Go binary、Frontend静的成果物、Opus encoder、FFmpegを1つの実行imageへまとめる。

## 完了条件（受け入れ条件）

- [ ] multi-stage buildでFrontendと`cmd/pion-poc`をbuildし、実行stageにはbinary、Frontend成果物、
      libopus runtime、対応範囲内のFFmpegだけを含める。
- [ ] containerはnon-root userで起動し、Pion serverの既定commandが同梱FrontendとFFmpegを参照する。
- [ ] image buildが成功し、container起動後に`/health/live`と`/health/ready`が200を返す。
- [ ] FFmpegを利用できないimage構成では、HTTP listenerを開かず非0で終了する既存startup契約を維持する。

## 設計判断

- 既存Python RTC imageへGo toolchainを追加せず、Pion専用Dockerfileを1つ追加する。
- image配布最適化やdistroless化は行わない。既存対応範囲を満たすdistribution packageのFFmpegを使う。

## スコープ境界

- 本タスク: Pion image、build context、最低限のcontainer起動確認。
- スコープ外: compose service選択、UDP/public IPの配線、registry push、脆弱性評価基盤。

## 実装方針

既存の`Docker/sincro-frontend/Dockerfile`と`Docker/sincro-rtc/Dockerfile`のuser、BuildKit cache、
repository labelのパターンを再利用する。新しいbuild toolやimage生成scriptは追加しない。

## テスト

- `docker build`でPion imageをbuildする。
- buildしたimageをlocal起動し、live / ready endpointとstartup logを1回確認する。
- rootの`npm run gate`。

## ドキュメント同期の要否

要。Pion READMEへimage buildとlocal起動例を追加する。compose設計の更新は後続taskで行う。
