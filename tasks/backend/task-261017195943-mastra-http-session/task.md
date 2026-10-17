# Mastra向けHTTPセッションを会話接続内で再利用する

## 背景 / 目的

MastraClient._chatは発話ごとにaiohttp.ClientSessionを生成して閉じる。WebSocket接続内の連続発話で接続プールを再利用できるよう、HTTP応答とSessionの生存期間を分ける。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [mastra_client.py](../../../sincromisor-server/text-processor/src/text_processor/mastra_client.py)
- [mastra_worker.py](../../../sincromisor-server/text-processor/src/text_processor/mastra_worker.py)
- [TextProcessorWorker.py](../../../sincromisor-server/text-processor/src/text_processor/TextProcessor/TextProcessorWorker.py)
- [TextProcessorProcess.py](../../../sincromisor-server/text-processor/TextProcessorProcess.py)
- [test_mastra_stream.py](../../../sincromisor-server/text-processor/tests/test_mastra_stream.py)

## 設計判断

- 一つのMastraTextProcessorWorkerがWebSocket接続中のClientSessionを所有する。発話単位のHTTP応答だけを閉じ、communicate終了時に受信・生成処理を回収してからSessionを閉じる。
- Sessionは実行中のイベントループ上で生成する。基底Workerを変更する場合はPokeTextProcessorWorkerの同期経路を維持する。
- finishと[DONE]の検証、異常終端と途中EOFの拒否、生成器のaclosing、既存の接続・無受信タイムアウト、要求を再試行しない動作を維持する。
- URL・トークン・agent_idは既存の引数設定から渡す。threadは要求のsession_idから決定し、Session共有を会話履歴の共有へ広げない。

## 完了条件と確認方法

- [x] 2発話を同じWorkerで処理し、一つのSessionを利用する。HTTP/1.1持続接続を返すローカルサーバーで接続の再利用を確認する。
- [x] test_mastra_stream.pyの既存正常・異常終端・取消試験を通し、生成中の切断とcommunicate終了で応答・Sessionの解放を確認する。
- [x] 異なるWebSocket接続のthreadが混ざらず、Session生成前の失敗でも未初期化資源をcloseしようとして元の例外を隠さない。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

AgentServer側API、認証方式、SSE形式、会話履歴の設計、プロセス全体でのSession共有、SDK導入。

## 文書と契約

[text-processor.md](../../../documents/design/backend/services/text-processor.md)に変更後の所有者と処理の流れを反映する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [Sessionと接続プールの再利用](https://docs.aiohttp.org/en/stable/client_quickstart.html)。

## 実装・確認結果

MastraClientの接続プールをWorkerのcommunicateが所有し、受信・生成処理を回収してから閉じる。発話ごとの応答解放、SSE終端検証、30秒の接続・無受信上限は維持した。ロック済み検証イメージで既存試験を含む36試験、Ruff・整形・tyが成功した。ローカルHTTP/1.1の2発話で同一TCP接続の再利用、2会話のthreadとSessionの分離、切断・取消・生成前の初期化失敗を確認した。設計とコメントを点検し、通信契約の変更はない。
