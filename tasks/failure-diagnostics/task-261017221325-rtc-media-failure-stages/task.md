# RTC音声入出力の失敗段階をログへ残す

## 背景 / 目的

rtc/media.goとoutbound.goは入力処理・出力処理のエラーをmedia_read_errorやmedia_write_errorへ集約し、RTP読取・復号・投入・送信の区別を失う。

優先度: 中。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

なし。単独で着手できる。

## 担当範囲

- [sincromisor-server/sincro-rtc/internal/rtc/media.go](../../../sincromisor-server/sincro-rtc/internal/rtc/media.go)
- [sincromisor-server/sincro-rtc/internal/rtc/outbound.go](../../../sincromisor-server/sincro-rtc/internal/rtc/outbound.go)
- [sincromisor-server/sincro-rtc/internal/media/input/processor.go](../../../sincromisor-server/sincro-rtc/internal/media/input/processor.go)
- [sincromisor-server/sincro-rtc/internal/media/output](../../../sincromisor-server/sincro-rtc/internal/media/output)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 音声処理方式や正常EOFの契約変更、シグナリングAPI、FFmpeg診断の再実装。

## 設計判断

- 既存エラー境界から失敗操作と安全な型・原因を渡し、受信、復号、PCM投入、音声符号化、RTP送信、RTCP読取を区別する。全フレームのログは追加しない。
- セッションIDと取得できる世代・発話IDを使う。正常EOF・context取消、既存のセッション終了理由と公開応答は維持する。

## 完了条件

- [x] 復号失敗と入力投入失敗、音声送信失敗とRTCP読取失敗を中央へ渡すJSONで識別できる。
- [x] 音声・SDP・候補アドレス・エラー原文を出さず、既存の正常終了を異常扱いしない。

## 確認方法

- 既存input/outputとsession_media_test.goの代役を使い代表的な失敗ログを確認する。対象Goテストを実行し、GPUや実マイクは要求しない。

## 文書同期

- [documents/design/backend/services/sincro-rtc.md](../../../documents/design/backend/services/sincro-rtc.md)
- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。

## 実施結果

既存エラー連鎖に操作と取得済み発話IDだけを添え、SessionのJSONログ境界で安全な型・原因へ変換した。RTP読取、Opus復号、PCM投入、Opus符号化、RTP送信、RTCP読取を区別する。最終音声枠も発話IDを保持し、入力EOF・取消・既存終了理由を維持した。合成音声復号失敗には取得済み世代番号を追加した。

入力・出力のGo試験が成功した。RTC全体試験は世代番号追加に伴う既存ログ期待値7件のみ失敗したため同期し、影響するRTC診断・復号・EOF試験を再実行して成功した。実セッション代役の読取・復号失敗、JSON選別、最終枠ID、既存取消・EOFを確認した。gofmt・文書整形・タスク整合、コメント点検: PASS。実GPU・マイク・外部サービスは使用していない。
