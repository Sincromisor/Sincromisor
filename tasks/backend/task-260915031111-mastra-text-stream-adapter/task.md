# Mastraの応答を既存のテキスト処理契約へ変換する

## 背景 / 目的

DifyのSSEを文単位に分割し正常終端だけ確定する現行動作を、Mastra APIへ接続する処理担当に実装する。
前提は [task-260915031110-mastra-studio-session-memory](../../backend/task-260915031110-mastra-studio-session-memory/task.md)。サービス入口の切替とDify撤去は [task-260915031111-replace-dify-with-mastra](../../backend/task-260915031111-replace-dify-with-mastra/task.md) に分ける。

## 完了条件

- [ ] Mastra APIを非同期で呼ぶ処理担当を直接実行し、既存の `TextProcessorResult` を配信できる。
- [ ] 句読点までの本文と終端記号のない末尾を重複なく渡し、分割された `^N` を既存の表情処理で扱える。
- [ ] ツール・推論イベントを読み上げず、途中ステップを会話全体の完了と誤認しない。
- [ ] 正常終端と成功理由を確認した場合だけ `finalize()` する。HTTP失敗、不正イベント、異常終端、取消、終端前EOFで成功結果を返さない。
- [ ] WebSocket切断・送信失敗でHTTP読取りが取り消され、Mastraからllama-serverまで生成停止が伝わる。
- [ ] `session_id` に対応するthreadへ新しい発話だけを送り、表示用履歴をMemoryへ重複投入しない。

## 設計判断

- [既存処理担当](../../../sincromisor-server/text-processor/src/text_processor/TextProcessor/TextProcessorWorker.py) の接続・直列処理・取消構造を再利用し、同期スレッドのHTTP待機へ戻さない。
- WebSocketが処理タスク、処理タスクが非同期生成器とHTTP応答を所有する。受信失敗か送信失敗の一方で両タスクを終了待機する。
- API・イベント・thread対応は前提タスクの契約を使う。実HTTP形式とTypeScript内の型を同一と仮定しない。
- ユーザー向け本文だけを扱い、ツール入力・結果・推論は除外する。Gemmaの採用設定で推論が本文へ混ざらないことも確認する。
- 終端理由を確認し、エラー、制限による未完、承認待ち・中断を正常回答へ丸めない。承認・再開UIは作らない。
- 接続・無受信待ちは現行30秒を起点とし、MCP待ちとの関係を確認して根拠のある変更だけ行う。本文生成全体を一律30秒で打ち切らない。
- 会話全体は自動再試行しない。失敗後は既存どおりWebSocket処理を終了し、新しいセッションは中断threadを再利用しない。
- GoとのMessagePack、共通結果モデル、表情コード、`sincro` モードは維持する。
- このタスクは処理担当の追加と直接確認までとし、公開のバックエンド選択設定やDify互換層は追加しない。

## 変更範囲と文書

- `sincromisor-server/text-processor/src/text_processor/` のMastraクライアントと処理担当、必要最小限の公開インポート。
- [既存Difyテスト](../../../sincromisor-server/text-processor/tests/test_dify_stream.py) を参照し、共通契約をMastraイベントで確認するテスト。
- [共通結果モデル](../../../sincromisor-server/sincro-models/src/sincro_models/TextProcessorResult.py) の表情処理は再利用する。
- [TextProcessor設計](../../../documents/design/backend/services/text-processor.md) に完了・失敗規則を記載し、切替タスクまでは既定Difyと明示する。

## 確認方法

- 対象PythonのRuff・型確認、正常・EOF・エラー・取消・送信失敗のストリームテスト。
- 前提タスクの秘密情報を除いた実HTTPイベントで本文、途中ステップ、成功・異常終端を確認する。
- 実MastraとGemma 4 E2Bへ処理担当を直接接続し、複数ターンと切断を確認する。取消はPythonの終了だけでなく、Mastraとllama-serverの要求終了・稼働状態で確認する。
- MCPを模したツール待ちイベントでも本文を捏造せず待機・終了できることを確認する。実MCPとの全経路は切替タスクで確認する。

## 関連契約

- [音声パイプライン](../../../documents/design/contracts/audio-pipeline-websocket.md)
- [RTC契約](../../../documents/design/contracts/frontend-rtc.md)
- [Mastraストリームイベント](https://mastra.ai/reference/streaming/ChunkType)（2026-09-15確認。実HTTP形式は前提タスクの採用版に従う）
