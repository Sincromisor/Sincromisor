# レビュー: task-261011201056-compose-logs-without-docker-socket

## 判定

APPROVED

## 理由・申し送り

- Dockerソケットを共有せず、Composeサービス群のログだけを集めるというユーザー要求と、既存のjournald → Vector → log-router → VictoriaLogs経路が根拠になっている。現在の`log-observer`がDocker Events・inspect・Consulチェック巡回を使い、`vector-data`と`observer-data`が配送状態を保存していることとも一致する。
- 削除対象と維持対象が区別されている。`host_diagnostics`、`docker_*`、`consul_check`の生成とDocker API参照を削除しつつ、Composeラベルでの選別、journal原本・cursor・ACK付きディスクバッファ、本文制御・秘密情報除去、既存のサービス登録と中央保存先の発見を維持する範囲は明確である。
- 高リスク部分の状態ファイルは、書込側をVector、読取側をobserver、共有先を既存の`vector-data`と定める。起動識別子、時刻、正常性、固定理由、原子的更新、期限切れ・未来時刻・欠落・不正・到達不能時の非正常判定、旧`observer-data`の安全な移行または不明区間化まで決まっており、古い正常結果による誤判定を防げる。
- 完了条件と確認方法は検証可能である。人工ログの隔離Composeで中央到達、原本回収、中央停止からの復旧、Vector停止・再作成、配送状態の異常・復旧を確認し、今回の必須確認が失敗した場合は修正してから完了する。二つの収集構成による確認は複数ホストという要求を単一ホスト上で検証する最小構成であり、別物理ホストや長時間・負荷試験を必須化していない。
- 公開挙動の変更は、`logging.md`、`consul.md`、`storage.md`、必要時の`examples/compose.env`とComposeへ同期する対象が示されている。削除する中央ログのイベント種別、残るjournal読取権限、配送の限界も文書化対象であり、既存のRTC・音声パイプライン契約を変更しない範囲である。
- タスク名・本文はMarkdown規約に沿った日本語であり、コメント規約を任意要件やタスク本文の複製にしていない。実装時に`documents/rules/source-comments.md`を直接適用できる。

## 自律補完

- なし
