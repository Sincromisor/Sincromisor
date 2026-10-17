# Pythonの第三者ログに安全な原因分類を残す

## 背景 / 目的

JsonLogFormatterは第三者ログの本文をLibrary eventへ置換する。秘匿は保たれるが、Uvicornの既知の異常も原因語が残らない。例外位置は既に保持されるため、その仕組みを利用する。

優先度: 中。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [Pythonの実ライブラリ例外を診断原因へ分類する](../task-261017221323-python-failure-classification/task.md)

## 担当範囲

- [sincromisor-server/sincro-config/src/sincro_config/SincromisorLoggerConfig.py](../../../sincromisor-server/sincro-config/src/sincro_config/SincromisorLoggerConfig.py)
- [sincromisor-server/sincro-config/tests/test_json_logging.py](../../../sincromisor-server/sincro-config/tests/test_json_logging.py)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 第三者ログの全文解禁、全ライブラリ対応、Uvicornの内部実装改変、全体DEBUG化。

## 設計判断

- 対象をUvicorn/websocketsの接続異常に限定し、採用版で実際に出るlogger名・固定メッセージ雛形・例外型から既知原因だけを変換する。任意本文を部分一致で拾う汎用解析は作らない。
- 未知ログの固定文・関数・行番号と、例外型・安全なフレーム位置を維持する。例外連鎖は必要な原因型と位置だけを有限件で扱い、値・引数・ソース・ローカル変数は出さない。
- 通常のINFO設定で出ない内部keepaliveログを記録できるとは約束しない。採用版で得られない原因はWebSocket境界の診断へ任せる。

## 完了条件

- [ ] 採用版の既知異常の人工LogRecordが固定reasonへ変換され、未知ログは安全な固定形式を保つ。
- [ ] 秘密を含むargs、例外値、連鎖を渡しても内容を出さず、取得できる例外位置を失わない。

## 確認方法

- test_json_logging.pyを拡張して実フォーマッター出力を確認する。採用版の発生箇所をタスク結果に記し、存在しないログをfixtureで捏造しない。対象pytestとRuffを実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。
