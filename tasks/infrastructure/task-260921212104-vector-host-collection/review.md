# レビュー: task-260921212104-vector-host-collection

## 判定

APPROVED

## 理由・申し送り

- 中央保存・共通項目・Consul発見・内容記録の境界は、依存先の`task-260921212053-victorialogs-foundation`と`documents/design/infrastructure/logging.md`に根拠がある。全サービスのDocker原本を中央検索できる状態という利用者要求に対する最小の収集単位であり、負荷値や複数ホストの結合試験は後続タスクへ分離されている。
- 現在の中央用エージェントは`consul-agent-logs`、TCP/UDP 8321である。収集側は予約済みの`consul-agent-logging`、8320を使用し、両方のnode名、サービスID、永続データ、分散用のTCP/UDP公開を分ける。既存の8321を収集用へ変更しない。
- Dockerソケットは読み取り専用マウントでもDockerデーモンを管理できる権限になる。Vectorには必要なソケットだけを渡し、特権化、Docker APIのホスト公開、書込み可能な余分なホスト領域を追加しない。Composeプロジェクトのラベルで収集対象を限定することは内容の選別であり、ソケット権限の縮小ではないことを設計に記録する。
- JSONの展開前に収集側の`timestamp`、`observed_at`、`host`、`project`、`service`、`container_id`、`stream`を確定し、本文のJSONで上書きさせない。解析不能な本文と複数行例外は保持しつつ、既存の共通仕様どおり認証トークン・秘密鍵と、無効化した会話・音声生成本文を中央投入前に除去する。Vector、`log-router`、同居Consulの自己ログは一度だけDocker入力から通し、Vectorの内部ログ入力や送信先を入力へ戻す循環を作らない。
- `log-router`は投入パスだけを受け、VectorのJSONLとクエリを保持して転送する。`consul-agent-logging:8600`を明示resolverにした`SincroLogs.service.consul`のIPv4・9428・5秒再解決とし、未登録、critical、Consul不通、中央停止は5xxとしてVectorへ返す。Caddyで再送を重ねず、登録先変更後の再送はVectorの再試行に一元化する。
- 永続バッファはVectorの所有ボリュームに置き、容量上限、満杯時の破棄または遮断の動作、再試行の観測点を設定と設計へ明記する。Dockerの`local`ログ保持は別所有の原本であり、短命コンテナ、停止中の原本、ローテーション、Vector停止からの自動回収と欠落検知は回収タスクの合格条件である。このタスクは容量内の中央停止・復旧を一度確認し、未実装の回収を完了扱いにしない。
- 対象、非対象、文書同期、固定入力での確認方法は具体的である。Markdownの題名と本文も規約に沿い、コメント品質を任意受け入れ条件として弱めていない。

## 自律補完

- `AUTO_FIX`: 基盤実装の実名に合わせ、収集側の接続先は`consul-agent-logging:8600`、中央側は`consul-agent-logs:8321`として分離する。根拠は依存先の実装結果と、8320が収集用に予約済みという実行時の指定である。
- `AUTO_FIX`: Vectorの具体的なバッファ容量、満杯時の動作、Docker入力の対象指定は、既存のComposeプロジェクト名・利用可能なディスクとVector公式設定から選ぶ。容量内の再送確認を満たし、容量超過時の無欠落保証をしない範囲の通常実装判断である。
