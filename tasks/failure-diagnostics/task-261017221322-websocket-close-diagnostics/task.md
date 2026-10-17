# GoのWebSocket切断原因を再初期化ログへ残す

## 背景 / 目的

clientはCloseStatusを取得できるエラーをEvent.Errへ渡すが、onClientEventが捨てるためremote_closeだけが残る。当時の1011と理由は保存されていなかった。

優先度: 最優先。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [中央ログでパイプラインの通信相手を保持する](../task-261017221322-pipeline-peer-log-fields/task.md)

## 担当範囲

- [sincromisor-server/sincro-rtc/internal/pipeline/client/transfer.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/transfer.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/client/client.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/client.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/client/shutdown.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/shutdown.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/reset.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/reset.go)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: keepalive不具合の修正、pingの追加、時間切れ変更、汎用エラー文字列の収集。

## 設計判断

- 接続の終端診断としてoperation（read/write/decode）、close_code、既知のclose_reason、有限なreasonと例外型を必要時に保持する。close frame未受信は数値を推測せず省略する。
- keepalive ping timeoutなど採用版で確認した固定理由だけを分類し、未知の理由はunknownとする。Err.Error()、相手の自由文、送受信データはログへ出さない。
- 最初の終端原因だけを受理する既存制御、明示Close・親取消の扱い、再接続方式を維持する。

## 完了条件

- [ ] 1011/既知keepalive理由、1000、close frameなしの読取失敗、書込時間切れを区別できる。1000というコードだけで未完了処理の正常終了と断定しない。
- [ ] 受理した再初期化にsession_id、generation、peerと安全な原因が残り、競合するイベントで原因が上書きされない。

## 確認方法

- clientの既存ループバックWebSocket試験とCoordinatorのログ試験を拡張する。任意の秘密文字列をclose reasonに入れ、非出力を確認する。対象Goテストを実行する。

## 文書同期

- [documents/design/contracts/audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)
- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。
