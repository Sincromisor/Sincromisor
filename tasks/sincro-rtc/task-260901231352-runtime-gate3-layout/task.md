# RTC起動処理とGate 3補助コードを責務別に整理

## 背景 / 目的

`cmd/sincro-rtc/main.go` は379行、同ディレクトリの試験は904行あり、起動依存の構築、HTTP提供、シグナル待機、終了処理、ログ補助が一つの本番ファイルにある。`internal/config` と `internal/gate3` は概ね分割済みだが、英語だけのコメントや試験基盤の位置づけが一部残る。

## 完了条件（受け入れ条件）

- [ ] `cmd/sincro-rtc` を入口、依存構築、HTTP提供、終了処理の責務別ファイルへ分け、各本番ファイルを300行以下にする。
- [ ] 同ディレクトリの試験を起動、提供、終了処理、プロセス結合の対象別に整理し、既存のプロセス境界試験を維持する。
- [ ] `internal/config` と `internal/gate3` の公開要素・外部処理・固定データ生成に残る英語コメントと説明不足を日本語規約へ合わせる。
- [ ] Gate 3の既存子パッケージは責務が成立しているため、具体的な混在がない限り追加分割しない。
- [ ] 起動順、`ready` 公開、`draining`、Consul解除、HTTP停止、共有資源終了の既存順序と6秒上限が変わらない。

## 設計判断

実行入口は `cmd/sincro-rtc` に維持し、起動用の枠組みや依存性注入コンテナーは導入しない。Gate 3は既存の `browser`、`consuldev`、`harnessenv`、`pipelinecontract`、`process` 境界を再利用する。

## スコープ境界

対象は `cmd/sincro-rtc`、`internal/config`、`internal/gate3` のGoコード・試験と、`pipeline/protocol/testdata` の固定データ生成補助コメントである。起動設定、`compose`、Gate 3契約は変更しない。

## 実装方針

既存関数を現在の責務に沿うファイルへ移す。コメント是正では逐語説明を追加せず、供給元、所有者、終了条件、固定データの用途を残す。

## テスト

`go test ./cmd/sincro-rtc ./internal/config ./internal/gate3/...` と `go test ./...` を実行する。並行処理を移動した場合は対象へ `go test -race` を追加する。

## ドキュメント同期の要否

起動・Gate 3仕様は変わらないため設計本文の仕様変更は不要。パッケージコメントとREADMEの配置説明は後続責務図タスクで同期する。
