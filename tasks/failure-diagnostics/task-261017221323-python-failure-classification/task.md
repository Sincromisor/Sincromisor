# Pythonの実ライブラリ例外を診断原因へ分類する

## 背景 / 目的

共通failure_fieldsへ実際のrequests.exceptions.ReadTimeoutとConnectTimeoutを渡すと、timeoutではなくfailedになることを簡易実行で確認した。

優先度: 高。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

なし。単独で着手できる。

## 担当範囲

- [sincromisor-server/sincro-config/src/sincro_config/runtime_diagnostics.py](../../../sincromisor-server/sincro-config/src/sincro_config/runtime_diagnostics.py)
- [sincromisor-server/voice-synthesizer/tests/test_runtime_diagnostics.py](../../../sincromisor-server/voice-synthesizer/tests/test_runtime_diagnostics.py)
- [sincromisor-server/sincro-config/tests/test_json_logging.py](../../../sincromisor-server/sincro-config/tests/test_json_logging.py)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 全例外の網羅、呼出し先の再試行変更、例外全文の保存。

## 設計判断

- 既存のfailure_fieldsを拡張し、requestsの接続待ち・読取待ち、既存HTTP/S3/Redisの原因と例外型を安全な属性にする。追加依存は導入せず既存環境の実例外型で検証する。
- reason=timeoutを共通分類として維持し、区別可能な場合だけtimeout_phase=connect/readを付ける。既知のHTTP状態・コードだけを残し、未知例外も例外型を残す。

## 完了条件

- [x] ReadTimeoutとConnectTimeoutをtimeoutとして記録し、両者の段階を区別できる。
- [x] 既存のpermission_denied、not_found、disk_full、cancelledとHTTP状態の分類を維持し、未知例外でも本文を出さない。

## 確認方法

- 実例外を使う表形式の単体テストで上記分岐と秘密を含む例外本文の非出力を確認する。共通分類と既存VoiceSynthesizer診断の対象pytest、変更PythonのRuffを実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。

## 実施結果

共通分類で実例外の継承階層から接続・読取時間切れを判定し、例外型、HTTP応答の状態、既知のS3コードを記録した。依存追加はない。実requests、Redis、botocoreと標準例外を使う表形式試験を追加した。

共通分類・JSONL・VoiceSynthesizer診断の対象pytestは26件成功した。変更PythonのRuff検査・整形確認、共通分類のtyも成功した。コメント点検: PASS。
