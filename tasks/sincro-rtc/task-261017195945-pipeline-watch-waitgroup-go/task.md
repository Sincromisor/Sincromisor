# パイプライン接続監視の待合せをWaitGroup.Goへ整理する

## 背景 / 目的

connectionSet.watchは隣接するWaitGroup.Add、go文、defer Doneで監視処理を開始する。採用Goで利用できるWaitGroup.Goへ置き換え、局所的な定型コードを減らす。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [set_lifecycle.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/set_lifecycle.go)
- [set_test.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/set_test.go)
- [panic_boundary_test.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/panic_boundary_test.go)

## 設計判断

- 対象をconnectionSet.watchの起動部分に限定する。既存のrecover、構築途中のcancel、未公開イベントの保持、Closeの待合せを維持する。
- WaitGroup.Goに渡す関数からpanicが漏れない条件を呼出先まで確認する。既存のpanic分類を削除して行数だけを減らさない。
- RTCのgoReservedなど、状態ロック内の予約と実際の起動を分ける処理には適用しない。Go更新や共通ラッパー追加は不要である。

## 完了条件と確認方法

- [x] sincro-rtcディレクトリでgo test ./internal/pipeline/clientとgo test -race ./internal/pipeline/clientを実行する。
- [x] 接続構築中の失敗、公開後イベント、Closeによる終了待機、panic境界の既存試験で結果が変わらないことを確認する。

変更したGoファイルをgofmtで整形する。確認にはgo.modの採用版を使う。

## 非対象

全リポジトリのWaitGroup一括置換、RTCの生存期間設計変更、監視順序の変更。

## 文書と契約

設計の外部契約は変更しない。確認結果と判断はこのタスクへ記録する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [Go 1.25以降の起動と待合せ、およびpanicの制約](https://pkg.go.dev/sync#WaitGroup.Go)。

## 実装・確認結果

connectionSet.watchのAdd・go・DoneをWaitGroup.Goへ置換した。recover、構築途中のcancel、未公開イベント保持、Closeの待合せを維持した。実際の通知先はCoordinator.safeCallback経由であり、panic通知の再呼出しにも同じ境界が適用されることを確認した。Go 1.26.9のgo test ./internal/pipeline/clientおよびgo test -race ./internal/pipeline/clientはPASS。ローカルlistenを使うためsandbox外で実行した。コメント点検: PASS（監視の所有者と通知先のpanic境界を追記）。
