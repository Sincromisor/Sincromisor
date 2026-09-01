# RTCのDataChannel送信責務を専用パッケージへ分離

## 背景 / 目的

`internal/rtc` には本番16ファイルと試験17ファイルがあり、`data_channel.go`（393行）、`data_channel_payload.go`、`data_channel_session.go` と送信キューの試験が、PeerConnection交渉やセッション生存期間の実装と同居している。DataChannelのJSON変換、キュー、Pionの送信抑制、送信処理担当は独立した責務であり、利用者が求めるディレクトリ単位の把握を妨げている。

## 完了条件（受け入れ条件）

- [ ] `internal/rtc/datachannel` が `text_ch` / `telop_ch` のJSON変換、キュー、送信抑制、送信処理担当とその単体試験を所有する。
- [ ] `internal/rtc` には、Pionのチャネル到着をセッションへ接続する処理だけが残り、送信キューの実装詳細を持たない。
- [ ] `text_ch` 64件、`telop_ch` 128件、1 MiBで抑制、256 KiB以下への復帰を最大5秒待つ既存契約と、失敗時のセッション終了条件が変わらない。
- [ ] 移動・変更した本番コードと直接の試験補助コードが `source-comments.md` とGo規約を満たし、公開要素、処理担当の終了条件、破棄判断を日本語で説明している。

## 設計判断

新しい抽象層は作らず、既存の `dataChannelWriter` 相当の最小インターフェースを利用側の `datachannel` パッケージに置く。フロントエンドのDataChannel名・JSON形式・信頼性属性は変更しない。

## スコープ境界

対象は `internal/rtc/data_channel*.go`、対応する試験、`Session` からの参照である。Offer / Answer、ICE再起動、音声処理、フロントエンドは変更しない。

## 実装方針

送信機とペイロード変換を `internal/rtc/datachannel` へ移し、対応する単体試験も同じ新パッケージへ移す。セッション固有のPionコールバックは親パッケージに残す。

## テスト

モジュールルートで `go test ./internal/rtc/...` と `go test -race ./internal/rtc/...` を実行し、最後に `go test ./...` を実行する。

## ドキュメント同期の要否

公開通信契約は変わらないため `frontend-rtc.md` の変更は不要。新パッケージには責務と隣接処理を示すパッケージコメントを置く。
