# Pion音声フレーム重複を調査・修正する

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

Pion 経路で、ゆっくり発話した「おはようございます」が
「おはようおはようおはようございおはようございます」と認識された。実機挙動から、
SpeechRecognizer の前で音声フレームが重複していると判定した。

SpeechExtractor は partial ごとに差分音声を送信し、Pion は同一 speech を累積して
SpeechRecognizer へ送る。Browser PCM、Extractor 結果、Pion 累積のどこで同一フレームが複数回
含まれるかを synthetic PCM で特定し、共有の原因箇所で一度だけ除去する。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] Browser PCM の連続する一意な synthetic frame を Extractor→Recognizer の実際の経路へ通し、
  Recognizer に送る各 partial / confirmed 音声が、入力順に各 frame を高々一度だけ含むことを
  回帰テストで検証する。失敗時は実データを記録せず、対象の境界と重複経路をテスト名・task 記録へ残す。
- [ ] 原因箇所を修正し、同じ synthetic frame が partial 累積または confirmed 音声へ二重に入らない
  ことを上記テストで確認する。異なる frame と正当な同一内容の発話を推測で除外しないこと。
- [ ] 既存の sequence / speech ID の単調性、partial と confirmed の送信、session reset の挙動を
  維持する既存 pipeline テストを通すこと。
- [ ] 実機再確認は private evidence だけで行い、音声、転写本文、session ID を Git artifact に
  転載しないこと。重複が残る場合は PASS にせず、原因箇所と再現条件を記録して修正を続けること。

## 設計判断

重複排除は音声内容や byte の一致推測ではなく、重複を作る共有の frame / sequence 処理を修正する。
Extractor の partial 送信契約、Recognizer の wire DTO、Frontend の表示契約は変更しない。

## スコープ境界

対象は Browser PCM 受理から Pion の Extractor→Recognizer 境界まで、およびその回帰テストと
task 記録である。SpeechRecognizer のモデル・推論設定、Frontend の表示、認識済み文字列の
後処理による重複削除は対象外とする。

## 実装方針

`internal/media/input.go`、`internal/pipeline/runtime.go`、`internal/pipeline/conversation.go` を
入力から順に追う。既存 fake Extractor / Recognizer を使い、実際に Recognizer へ送られた byte 列を
capture する最小の結合テストを追加する。原因が特定された共有処理だけを修正する。

## テスト

`go test ./internal/pipeline` を必須とし、media 層を変更した場合は `go test ./internal/media` も実行する。
`go test ./...`、`go vet ./...`、`gofmt -l .`、`npm run gate` を実行する。

## ドキュメント同期の要否

通信契約・公開 UI の変更はない。外部の手順変更がなければ設計文書の同期は不要とし、実機再確認の
結果だけを task 記録へ残す。
