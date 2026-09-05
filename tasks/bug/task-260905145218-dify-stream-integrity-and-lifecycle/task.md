# Dify応答の欠落と通信待機・異常終了を修正

## 背景 / 目的

2026-09-05、HEAD `1801836a8f75691d08e691471a681ccd50eb7c73` の `DifyTextProcessorWorker` を確認した。応答の欠落はチャット表示、音声合成、確定履歴へ伝播し、会話品質改善の前提を壊す。異常終了を成功と扱う経路と、非同期通信内の同期待機も同じ応答処理で解消する。

根拠は再現済みの欠落、既存の応答・履歴契約、共有イベントループを停止させない実行上の制約である。Difyと接続先LLMはローカル／オンプレミス配置を前提とし、外部サービスのAPIは利用しない。

## 起票時の確認と再現

対象ファイルの `__dify_client_thread` をそのまま実行し、`dify_client.chat()` のみを固定応答の生成器へ置換した。応答は `event=message`、`conversation_id=test` とし、生成中に待ち行列を消費しない条件で確認した。

| `answer` の入力                          | 待ち行列の実出力 | 問題                                   |
| ---------------------------------------- | ---------------- | -------------------------------------- |
| `こんにちは`                             | 空               | 句読点のない文末が送られない           |
| `こんにちは。よろしくね`                 | `こんにちは。`   | 最後の文字列が欠落する                 |
| `0。1。2。3。4。5。6。7。8。9。10。11。` | `2。`から`11。`  | `deque(maxlen=10)`が未送信文を破棄する |

実Dify通信での発生頻度は未測定である。コード上では、空の待ち行列を `continue` で確認し続け、`communicate()` が同期生成器を非同期処理内で直接進める。HTTPには時間切れ指定がなく、生成側の例外は `finally: event.set()` の後に消費側へ渡らず、消費側が `finalize()` を呼べる。`ping` のように本文・会話IDを持たないイベントも一律に `conversation_id` へアクセスする。

## 完了条件（受け入れ条件）

- [x] 正常な応答の全本文を、順序を保って一度ずつチャット本文と音声合成入力へ渡す。上記3入力、複数受信片へ分割した本文で欠落・重複がない。
- [x] 既存の先頭感情コード `^N` の除去と表情伝達を維持し、正常応答だけを一度確定する。共有 `TextProcessorResult` の本文・音声・履歴を確認する。
- [x] 本文を持たない通知で本文・会話IDを捏造しない。HTTP失敗、Difyのエラー通知、読み取り失敗を呼び出し元へ伝え、失敗した応答を正常完了として確定しない。
- [x] 応答待ち中に空の待ち行列を回り続けず、同じイベントループの別処理が進む。単に同期的な待ち行列取得へ置換してイベントループを塞がない。
- [x] 接続・読み取り待ちに有限の時間切れを設ける。WebSocket切断、送信失敗、処理の取り消しでもHTTP応答と開始済みの処理を解放し、未送信データや終了通知の待機で後始末が停止しない。
- [x] ローカルの模擬HTTP配信を実 `DifyClient` で読み、正常終了、途中の停止、接続終了後の資源解放を確認する。実Dify、GPU、利用者の音声、外部API認証情報を検証の前提にしない。

## 設計判断と変更範囲

高リスク変更として仕様の独立レビューと実装時の独立評価を行う。応答の生成側、消費側、WebSocket処理の生存期間を扱うためである。

入力はGoパイプラインの `TextProcessorRequest` と管理者が設定したDifyのHTTP応答、出力は既存 `TextProcessorResult` のMessagePackである。既存のエンドポイント・送受信フィールド・Go側の失敗時再接続契約は維持する。生成失敗はPython側の例外と既存WebSocket終了経路に伝え、新しいエラーメッセージ形式を追加しない。自動再試行による応答の二重生成も追加しない。

WebSocketの要求処理がHTTP応答処理の生存期間を所有する。正常終了、異常終了、消費中断のいずれでも所有した処理を終了させる。実装方式は既存依存関係と標準ライブラリを優先し、専用の汎用処理基盤を作らない。時間切れ値は用途と理由を記録し、テストでは短い値へ差し替え可能にする。公開設定が必要になった場合だけ設定クラス・Compose・サンプルを同時更新する。

主な確認・変更先:

- [Dify応答処理](../../../sincromisor-server/text-processor/src/text_processor/TextProcessor/DifyTextProcessorWorker.py)
- [Dify HTTPクライアント](../../../sincromisor-server/text-processor/src/text_processor/Dify/DifyClient.py)
- [共有WebSocket処理](../../../sincromisor-server/text-processor/src/text_processor/TextProcessor/TextProcessorWorker.py)
- [サービス入口](../../../sincromisor-server/text-processor/TextProcessorProcess.py)
- [共有応答モデル](../../../sincromisor-server/sincro-models/src/sincro_models/TextProcessorResult.py)
- `sincromisor-server/text-processor/tests/` に対象を絞った回帰テストを追加する。

共有処理を変更する場合は `PokeTextProcessorWorker` と通常の `TextProcessorWorker` も確認し、`sincro` の文変換を維持する。モデル交換、音声割り込み機能、会話履歴の再設計、全体の非同期化は対象外とする。

## 検証・文書同期

上記の固定入力と、同時に動く最小の非同期処理、ローカル模擬HTTPを使った回帰テストを残す。待ち時間の性能競争や長時間負荷試験は要求しない。終了確認にはテスト側にも期限を設け、失敗時に試験自体が停止しないようにする。

対象PythonのRuff・型確認・テストを実施する。共有モデルを変更した場合は既存の `sincromisor-server/sincro-models/tests/test_go_pipeline_protocol_compat.py` も実施する。高リスク経路の全体確認は [タスク管理](../../README.md) に従い、今回と無関係な既存不整合は分けて報告する。

[TextProcessor設計](../../../documents/design/backend/services/text-processor.md)へ正常終了、失敗伝達、時間切れ、所有する資源の説明を同期し、[音声パイプライン契約](../../../documents/design/contracts/audio-pipeline-websocket.md)と矛盾しないことを確認する。再現手順・確認結果・未実行確認はタスク記録に残す。

## 実施結果

高リスク経路で仕様の独立レビュー、専用作業ツリーでの実装、独立評価を実施し、最終実装 `6aa30ad6` はPASS。再現入力を含む模擬HTTP回帰10件とGo/PythonのMessagePack互換1件が合格した。取消・送信失敗・次要求後切断では、イベントループの終了前にHTTPの接続終了と子処理の回収を確認した。対象のRuff・整形・型検査、変更MarkdownのPrettier、全体ゲートの静的検査・ビルド・テストが合格。Ruffの既存ファイル名規約N999は除外した。文書点検・コメント点検: PASS。

実Dify・GPU・利用者音声は未実行。タスク全体検査は既存の `task-260904005741-fix-face-landmarker-timestamp` の記録3件欠落で失敗し、今回の変更範囲の不整合はない。索引は他タスクの未コミット差分を巻き込まないよう `tasks:index` で生成し、今回のカテゴリだけを完了コミットに含める。
