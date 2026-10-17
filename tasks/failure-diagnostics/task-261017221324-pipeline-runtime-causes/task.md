# パイプライン内部失敗の操作と原因を区別する

## 背景 / 目的

runtime.goは検証、次段送信、出力待ちの失敗をruntime_errorへ集約する。抽出結果から認識器への送信失敗も抽出側として記録され得る。

優先度: 高。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [GoのWebSocket切断原因を再初期化ログへ残す](../task-261017221322-websocket-close-diagnostics/task.md)

## 担当範囲

- [sincromisor-server/sincro-rtc/internal/pipeline/runtime.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/runtime.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/reset.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/reset.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/conversation.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/conversation.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/observability_logs_test.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/observability_logs_test.go)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 入力検証規則やキュー容量・待機時間の変更、要求数の集計。

## 設計判断

- 失敗した操作と通信相手を分けて保持する。検証、次段送信、文字出力、音声出力を識別し、原因はinvalid_data、backpressure_timeout、write_failedなどの固定値にする。
- 安全なモデル名・フィールドパスは既存protocolの診断を再利用できる範囲だけ使う。エラー文字列の比較や本文出力で分類しない。
- clientイベントと実行ループが同じ失敗を報告しても、再初期化を一度にする既存制御を維持する。

## 完了条件

- [ ] 不正応答、次段送信失敗、出力詰まりを操作・相手・原因で区別できる。
- [ ] 既存session_id、generationと保持する発話IDを照合でき、通常取消を新たな障害に数えない。

## 確認方法

- 既存の不正履歴・ID・出力詰まりの代役試験へログの期待値を追加する。受理する再初期化が1回であり本文を出さないことを対象Goテストで確認する。

## 文書同期

- [documents/design/contracts/audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)
- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。
