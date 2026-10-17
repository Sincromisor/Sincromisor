# 切断診断と未完了件数を中央ログで結合確認する

## 背景 / 目的

出力元のテストだけではVectorによるpeer消失を検出できなかった。分割実装後の切断経路を既存収集設定で一度通し、中央検索で原因と影響を辿れることを確かめる。

優先度: 高。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [中央ログでパイプラインの通信相手を保持する](../task-261017221322-pipeline-peer-log-fields/task.md)
- [GoのWebSocket切断原因を再初期化ログへ残す](../task-261017221322-websocket-close-diagnostics/task.md)
- [Python音声サービスの接続終了を識別可能にする](../task-261017221323-python-websocket-lifecycle/task.md)
- [パイプライン再接続の試行と復旧を記録する](../task-261017221323-pipeline-reconnect-attempts/task.md)
- [パイプライン内部失敗の操作と原因を区別する](../task-261017221324-pipeline-runtime-causes/task.md)
- [合成完了とRTCへの音声送信結果を区別する](../task-261017221324-synthesis-websocket-delivery/task.md)
- [再初期化で未完了になった音声要求と破棄数を残す](../task-261017221325-pipeline-interruption-summary/task.md)

## 担当範囲

- [scripts/tests/log-collector.test.mjs](../../../scripts/tests/log-collector.test.mjs)
- [configs/vector.toml](../../../configs/vector.toml)
- [compose/logging.yml](../../../compose/logging.yml)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 新規監視基盤、全タスクの再監査、ブラウザー/Consul/AgentServerの結合試験、keepalive競合そのものの再現。

## 設計判断

- 既存の隔離確認構成を再利用し、人工会話IDとHTTP/WebSocket代役だけを使う。Go/Python本番ログ出力からVector→VictoriaLogs検索までを確認し、ログJSONの手書きだけで完了しない。
- 確認は既知理由付き切断、接続失敗→復旧、合成後送信失敗と部分受信の代表経路に限定する。本文設定は無効にし、秘密の人工印が中央にないことも確認する。
- 稼働サービスへ障害を注入せず、専用保存先を使う。原事象の1011を事後確定したとは記録しない。

## 完了条件

- [ ] 中央検索からsession_id、peer、generation、原因コードと再接続結果を辿れる。
- [ ] 合成成功と送信失敗が区別され、部分受信の結果未受信数とキュー破棄数を照合できる。
- [ ] 使用したコマンド、人工入力、検索条件、結果をtask.mdへ簡潔に残す。公開成果物は秘密のない小さな集計だけとする。

## 確認方法

- 既存の隔離収集試験を元に対象経路だけ実行する。全サービス起動・GPU推論・長時間負荷・複数ホストを必須にしない。実装由来の不具合は原因を特定して修正後に当該確認を再実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。
