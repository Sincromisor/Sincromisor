# Goの回復したpanicに安全な発生位置を残す

## 背景 / 目的

pipelineとRTCのrecover境界は処理段階やpanicという理由だけを残し、どの関数で起きたか特定できない。

優先度: 中。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [GoのWebSocket切断原因を再初期化ログへ残す](../task-261017221322-websocket-close-diagnostics/task.md)
- [パイプライン内部失敗の操作と原因を区別する](../task-261017221324-pipeline-runtime-causes/task.md)

## 担当範囲

- [sincromisor-server/sincro-rtc/internal/pipeline/client/connection.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/connection.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/coordinator_runtime.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/coordinator_runtime.go)
- [sincromisor-server/sincro-rtc/internal/rtc/safe.go](../../../sincromisor-server/sincro-rtc/internal/rtc/safe.go)
- [sincromisor-server/sincro-rtc/internal/rtc/session_build.go](../../../sincromisor-server/sincro-rtc/internal/rtc/session_build.go)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 全goroutineのスタック収集、全recoverの一括改修、panicの再送出方式の変更。

## 設計判断

- recoverしている同じgoroutineでruntime.Callers/CallersFrames相当を使い、有限個の関数名・ファイル名・行番号だけを取得する。panic値、引数を含むdebug.Stack原文、絶対パスは記録しない。
- 対象はclient worker、Coordinator worker/callback、Session worker/callbackの既存recover境界に限定する。共通の小さな変換だけを共有し、回復や終了通知の所有者を変えない。

## 完了条件

- [x] 人工panicの発生関数と行を処理段階・セッションに対応付けられる。clientの終端イベントを経由しても位置を失わない。
- [x] 秘密を含むpanic値と引数は出力されず、既存の終了・再初期化が一度だけ完了する。

## 確認方法

- 既存panic_boundary_test.goとRTC recovery試験へJSONログの期待値を追加する。回復時点のフレームを確認し、対象Goテストを実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)
- [documents/design/backend/services/sincro-rtc.md](../../../documents/design/backend/services/sincro-rtc.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。

## 実施結果

- 共通の小さな`diagnostics.CapturePanic`で現在のgoroutineの最大32フレームを取得し、関数名・ファイル名・行番号へ変換した。panic値は受け取らず、引数・絶対パス・`debug.Stack`を保持しない。
- client workerは安全な型付きエラーで位置を終端イベントへ渡し、既存`DiagnosticAttrs`から再初期化へ引き継ぐ。CoordinatorとDataChannelの通知先は既存の同期呼出しのまま位置を取得し、Sessionのworker/callback/cleanup境界にも添える。終了通知やCloseの所有者・回数は変更しない。
- 対象Go race試験`Test(ConnectionWorkerStagesRecover|PanicEvent|CoordinatorWorkerPanic|SessionRecoverWrappers|DataChannelWorkerMetrics)`がPASS。clientの2段階、Coordinatorの同期通知、Sessionの16段階、終端イベント経由の再初期化を確認し、人工panicの位置・秘密値の不在・通知の重複防止を検査した。
- 変更した本番処理と直接関係する補助処理のコメント、ログ・RTC設計を同期した。全goroutineの収集、全recoverの改修、致命的runtime/cgoエラーの回復は対象外。
