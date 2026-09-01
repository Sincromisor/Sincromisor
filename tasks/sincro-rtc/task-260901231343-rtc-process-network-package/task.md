# RTCの共有Pionネットワーク責務を専用パッケージへ分離

## 背景 / 目的

`internal/rtc/network.go` は全セッション共有のUDPソケット、ICE UDP mux、Pion APIの生成・終了を担当するが、セッション単位の状態機械と同じパッケージにある。プロセス所有資源とセッション所有資源の境界をディレクトリから判別できない。

## 完了条件（受け入れ条件）

- [ ] `internal/rtc/network` が共有UDP muxとPion APIの生成・終了、および対応試験を所有する。
- [ ] `cmd/sincro-rtc` が新パッケージから共有Pion APIを受け取り、`rtc.Manager` は引き続き非所有参照として利用する。
- [ ] UDP4、固定ポート、指定インターフェース、公開IPv4、TCP / IPv6無効、全セッション終了後に一度だけ閉じる既存条件が変わらない。
- [ ] 新パッケージの公開要素とソケット所有権が日本語の文書コメントから分かる。

## 設計判断

パッケージ名と型名の重複を避け、内部APIは `network.Process` などインポート後に自然に読める最小名へ整理してよい。新しい設定値やネットワーク方式は追加しない。

## スコープ境界

対象は `internal/rtc/network.go`、`network_test.go`、`cmd/sincro-rtc` の組み立て箇所である。ICE候補契約、セッション交渉、`compose` 設定は変更しない。

## 実装方針

コードと試験を対で専用パッケージへ移し、`main` から明示的に生成・終了する。セッション側へソケット所有権を移さない。

## テスト

`go test ./internal/rtc/network ./cmd/sincro-rtc`、`go test -race ./internal/rtc/network`、`go test ./...` を実行する。

## ドキュメント同期の要否

公開契約と設定供給元は変わらないため設計本文の仕様変更は不要。新パッケージコメントへ所有境界を記載する。
