# 再初期化で未完了になった音声要求と破棄数を残す

## 背景 / 目的

再初期化は旧世代の未完了処理と出力を捨てるが、どれだけの音声要求が結果未受信か、どの出力を破棄したかログから集計できない。

優先度: 高。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [パイプライン内部失敗の操作と原因を区別する](../task-261017221324-pipeline-runtime-causes/task.md)
- [合成完了とRTCへの音声送信結果を区別する](../task-261017221324-synthesis-websocket-delivery/task.md)

## 担当範囲

- [sincromisor-server/sincro-rtc/internal/pipeline/coordinator.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/coordinator.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/runtime.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/runtime.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/reset.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/reset.go)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 応答全体の再送、ブラウザー再生の保証、処理状態機械の再設計。

## 設計判断

- 世代ごとにTTS送信成功数、合成結果受理数を数え、再初期化の既存同期点で結果未受信数と内部出力キューから実際に破棄した件数を一度記録する。
- 意味を限定し、送信失敗で配送が不確かな要求を成功へ数えない。結果未受信数は再生欠落数ではなく、RTC送信済み・ブラウザー再生済みの件数を推測しない。
- 件数だけを持ち、要求本文一覧や新規無制限キューを作らない。既存世代・破棄・履歴保持規則を維持する。

## 完了条件

- [ ] 7件のTTS送信成功に対して4件受理後の再初期化なら、結果未受信3件が記録される。これは原事象の再現ではなく人工確認と明示する。
- [ ] 出力キューの破棄数と旧世代から遅れて届いた値を区別し、次世代へ件数が混入しない。

## 確認方法

- 既存fake clientで部分受信→再初期化と旧結果の遅着を確認する。対象Goテストをrace付きで実行し、カウンターの同期と既存出力動作を確認する。

## 文書同期

- [documents/design/contracts/audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)
- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。
