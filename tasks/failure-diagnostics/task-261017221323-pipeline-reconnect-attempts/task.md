# パイプライン再接続の試行と復旧を記録する

## 背景 / 目的

connectUntilRunningは接続失敗を記録せず待機と再試行を繰り返す。切断後にどのサービスのどの接続段階で止まったか追えない。

優先度: 最優先。2026-10-17の異常時ログ調査とユーザーの分割起票要求に基づく。起票時の確認対象は `0b8a5044d941833218c893f1c774f436432233cb`。調査の背景・全体の分担は[索引](../index.md)を参照する。

## 依存関係

- [GoのWebSocket切断原因を再初期化ログへ残す](../task-261017221322-websocket-close-diagnostics/task.md)

## 担当範囲

- [sincromisor-server/sincro-rtc/internal/pipeline/connect.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/connect.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/client/connection.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/connection.go)
- [sincromisor-server/sincro-rtc/internal/pipeline/client/set_lifecycle.go](../../../sincromisor-server/sincro-rtc/internal/pipeline/client/set_lifecycle.go)

上記と直接関係する呼出元・対象テストだけを変更する。非対象: 再接続方針の変更、Consulの詳細分類、一般的な監視基盤の追加。

## 設計判断

- resolve、dial、initialize、activateの失敗を型付きの安全な情報として上位へ渡す。既存の公開前pendingイベントの原因を後続キャンセルで置き換えない。
- 接続失敗にpeer、session_id、generation、attempt、retry_delay_msと原因を記録し、復旧・取消に経過時間と結果を記録する。初期接続と再接続を区別する。
- 既存の再試行回数・待機・ロック・世代公開条件は変えない。まず試行境界のログに限定し、新たな集約タイマーを作らない。

## 完了条件

- [ ] 接続拒否、接続時間切れ、初期化失敗が相手と段階付きで残る。
- [ ] 失敗後の復旧と終了による取消を区別し、実際の試行回数・待機時間を照合できる。

## 確認方法

- 既存factory、waiterとclient接続試験で失敗→成功、待機中取消、公開前切断を確認する。原因の秘密原文がないことを含め対象Goテストを実行する。

## 文書同期

- [documents/design/infrastructure/logging.md](../../../documents/design/infrastructure/logging.md)
- [documents/design/contracts/audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)

変更したログ項目と意味だけを該当節へ反映する。音声・会話の通信形式や正常処理は変更しない。
