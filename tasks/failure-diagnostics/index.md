# 異常時ログの改善

## 背景 / 目的

2026-10-17の調査で、切断原因の破棄、中央収集での通信相手の上書き、再接続試行の非記録、生成成功と配送成功の混同を確認した。既存のJSONL・Vector・VictoriaLogsを利用し、実装担当が一領域ずつ確認できる17タスクへ分割する。

調査元はローカルの `work/update-20261017/reconnect-investigation/findings.json`。このファイルは公開リポジトリでの存在を前提にしない。再現では受信停止とkeepaliveの競合が最有力となったが、当時のclose codeは保存されておらず、原事象の1011は直接確定していない。今回のタスクは診断改善を扱い、切断不具合そのものの修正を含まない。

既存のログ基盤・内部診断タスクは完了済みであり、再実装しない。未完了タスクに同じ範囲のものはなかった。起票時のHEADは `0b8a5044d941833218c893f1c774f436432233cb`。

## 分割と進め方

| 順序 | 領域         | 担当する改善                                                                     |
| ---- | ------------ | -------------------------------------------------------------------------------- |
| 1    | 切断の特定   | 中央のpeer保持、Go切断原因、Python例外分類、Python接続終了                       |
| 2    | 再接続と影響 | 再接続試行、内部失敗分類、合成時間、配送結果、未完了件数                         |
| 3    | 周辺の診断   | Consul、RTC音声、ブラウザーのHTTPとICE、Python第三者ログ、AgentServer、Goのpanic |
| 4    | 中央での確認 | 切断・復旧・配送失敗・未完了件数の代表経路だけを結合確認                         |

順序は優先度の目安であり、実装上の依存だけを各 `meta.yaml` の `depends_on` に記録する。中央確認は切断経路の依存だけを待ち、周辺診断すべての完了を要求しない。ブラウザーのHTTPとICEは同じ受信契約を触るため順に実装する。

各タスクは対象テストで完了を判断する。実GPU、実会話、全サービス起動、複数ホスト、長時間試験を一律に要求しない。共通のログ設計を触るため、同時実装する場合も該当節だけを更新して他タスクの編集を戻さない。

## 共通の判断

- `service` はCompose上の出力元、`peer` は通信相手とする。会話ID、世代、操作、原因は出力元が保持する値だけを記録する。
- 本文記録が無効でも異常と処理時間は残す。例外原文、URL、認証情報、音声、SDPを診断追加のために出さない。
- 処理完了、送信成功、受信、ブラウザー再生を同義にしない。既存通信モデルに足りないIDや再生確認を推測で補わない。
- 既存の再試行・時間切れ・取消・資源解放を維持する。起票時の独立レビューは通信契約を変更するブラウザーの2タスクに限定し、他タスクで制御変更が必要になった場合は実装前に範囲を見直す。
- タスクごとの設計判断・範囲・確認方法を優先し、新しい監視サービスや汎用トレース基盤を導入しない。

## 参照

- [ログの保存と検索](../../documents/design/infrastructure/logging.md)
- [音声パイプライン契約](../../documents/design/contracts/audio-pipeline-websocket.md)
- [既存の内部診断タスク](../infrastructure/task-260921221014-runtime-failure-diagnostics/task.md)

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 17 件）

### open（未完） — 8 件

| タスク                                                                                                               | タイトル                                               | 判定 | 依存                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [task-261017221325-pipeline-interruption-summary](./task-261017221325-pipeline-interruption-summary/task.md)         | 再初期化で未完了になった音声要求と破棄数を残す         | —    | `task-261017221324-pipeline-runtime-causes`, `task-261017221324-synthesis-websocket-delivery`                                                                                                                                                                                                                                                    |
| [task-261017221325-rtc-media-failure-stages](./task-261017221325-rtc-media-failure-stages/task.md)                   | RTC音声入出力の失敗段階をログへ残す                    | —    | —                                                                                                                                                                                                                                                                                                                                                |
| [task-261017221326-agent-error-diagnostic-fields](./task-261017221326-agent-error-diagnostic-fields/task.md)         | AgentServerの失敗ログに型と既知コードを残す            | —    | —                                                                                                                                                                                                                                                                                                                                                |
| [task-261017221326-browser-ice-failure-summary](./task-261017221326-browser-ice-failure-summary/task.md)             | ICE失敗時の限定した診断値を中央へ送る                  | —    | `task-261017221326-browser-signaling-diagnostics`                                                                                                                                                                                                                                                                                                |
| [task-261017221326-browser-signaling-diagnostics](./task-261017221326-browser-signaling-diagnostics/task.md)         | ブラウザー診断へシグナリングの操作とHTTP状態を追加する | —    | —                                                                                                                                                                                                                                                                                                                                                |
| [task-261017221326-python-library-log-causes](./task-261017221326-python-library-log-causes/task.md)                 | Pythonの第三者ログに安全な原因分類を残す               | —    | `task-261017221323-python-failure-classification`                                                                                                                                                                                                                                                                                                |
| [task-261017221327-disconnect-log-central-acceptance](./task-261017221327-disconnect-log-central-acceptance/task.md) | 切断診断と未完了件数を中央ログで結合確認する           | —    | `task-261017221322-pipeline-peer-log-fields`, `task-261017221322-websocket-close-diagnostics`, `task-261017221323-python-websocket-lifecycle`, `task-261017221323-pipeline-reconnect-attempts`, `task-261017221324-pipeline-runtime-causes`, `task-261017221324-synthesis-websocket-delivery`, `task-261017221325-pipeline-interruption-summary` |
| [task-261017221327-go-panic-source-location](./task-261017221327-go-panic-source-location/task.md)                   | Goの回復したpanicに安全な発生位置を残す                | —    | `task-261017221322-websocket-close-diagnostics`, `task-261017221324-pipeline-runtime-causes`                                                                                                                                                                                                                                                     |

### done（完了） — 9 件

| タスク                                                                                                       | タイトル                                           | 判定    | 依存                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| [task-261017221322-pipeline-peer-log-fields](./task-261017221322-pipeline-peer-log-fields/task.md)           | 中央ログでパイプラインの通信相手を保持する         | ✅ PASS | —                                                                                              |
| [task-261017221322-websocket-close-diagnostics](./task-261017221322-websocket-close-diagnostics/task.md)     | GoのWebSocket切断原因を再初期化ログへ残す          | ✅ PASS | `task-261017221322-pipeline-peer-log-fields`                                                   |
| [task-261017221323-pipeline-reconnect-attempts](./task-261017221323-pipeline-reconnect-attempts/task.md)     | パイプライン再接続の試行と復旧を記録する           | ✅ PASS | `task-261017221322-websocket-close-diagnostics`                                                |
| [task-261017221323-python-failure-classification](./task-261017221323-python-failure-classification/task.md) | Pythonの実ライブラリ例外を診断原因へ分類する       | ✅ PASS | —                                                                                              |
| [task-261017221323-python-websocket-lifecycle](./task-261017221323-python-websocket-lifecycle/task.md)       | Python音声サービスの接続終了を識別可能にする       | ✅ PASS | `task-261017221323-python-failure-classification`                                              |
| [task-261017221324-pipeline-runtime-causes](./task-261017221324-pipeline-runtime-causes/task.md)             | パイプライン内部失敗の操作と原因を区別する         | ✅ PASS | `task-261017221322-websocket-close-diagnostics`                                                |
| [task-261017221324-synthesis-operation-timing](./task-261017221324-synthesis-operation-timing/task.md)       | 本文設定に依存しない音声合成の段階と時間を記録する | ✅ PASS | `task-261017221323-python-failure-classification`                                              |
| [task-261017221324-synthesis-websocket-delivery](./task-261017221324-synthesis-websocket-delivery/task.md)   | 合成完了とRTCへの音声送信結果を区別する            | ✅ PASS | `task-261017221323-python-websocket-lifecycle`, `task-261017221324-synthesis-operation-timing` |
| [task-261017221325-consul-discovery-causes](./task-261017221325-consul-discovery-causes/task.md)             | GoのConsul探索失敗を原因別に記録する               | ✅ PASS | `task-261017221322-pipeline-peer-log-fields`                                                   |

<!-- AUTOGEN:tasks END -->
