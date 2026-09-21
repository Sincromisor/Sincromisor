# PythonのJSONLログと対話内容の記録切替を実装する

## 背景と目的

音声処理4サービスは共通の`SincromisorLoggerConfig`を使うが、テキスト形式で辞書・モデルの文字列表現にIDや本文が埋もれている。
[共通仕様](../task-260921212053-victorialogs-foundation/task.md#共通仕様)に合わせ、JSONL出力とデフォルトで有効な対話内容ログを実装する。

## 変更範囲と方針

- `sincromisor-server/sincro-config/src/sincro_config/SincromisorLoggerConfig.py`と既存の引数・環境設定を利用し、標準`logging`と`json`で共通形式を作る。
- `speech-extractor`、現行の`speech-recognizer-nemo`、`text-processor`、`voice-synthesizer`の入口へ適用する。音声生成の詳細は後続タスクで整備する。
- 通常ログ、Uvicorn、例外を1イベント1行にし、時刻・レベル・ロガー名・例外情報・構造付き属性を保持する。
- 繰返し設定でハンドラーが重複しないよう、現在の浅いコピーによる共有状態も変更範囲で解消する。
- `SINCRO_LOG_CONVERSATION_ENABLED`を設定クラス・`examples/compose.env`・必要なComposeへ渡す。未指定・`true`で有効、`false`で無効、不正値は起動失敗とする。
- 認識結果、新規入力、応答断片と確定結果を構造化し、`event`と保持している会話・発話・シーケンスID、確定状態を付ける。
- NeMoから共通認識ワーカーまでの呼出し、`TextProcessorWorker.py`、`PokeTextProcessorWorker.py`、`mastra_worker.py`を追い、`chat`と`sincro`の両方を対象にする。
- 要求・応答全体の`repr`や累積履歴の反復出力に頼らず、新規入力と生成本文を追える最小のイベントを残す。取消・生成失敗を正常完了としない。
- 無効時は認識・対話内容のイベントを止め、一般の処理結果・失敗は本文なしで残す。レベルだけで切り替えず、例外・第三者ロガーの本文出力も確認する。

## 完了条件

- [ ] Python4サービスの通常ログ・例外がJSONLとして読め、IDを構造付き項目として取り出せる。
- [ ] 未指定・有効時に人工的な認識結果・入力・応答が残り、無効時は対象本文を標準出力・標準エラー・指定時の運用ログファイルへ出さない。
- [ ] 一般の成功・失敗ログは無効時も残り、音声処理・会話結果が設定で変わらない。
- [ ] 応答断片と確定結果を区別でき、取消・失敗を確定扱いしない。
- [ ] 不正値を拒否し、設定がComposeから届く。認証情報をログへ含めない。

## 確認方法

実際のフォーマッターとハンドラーで日本語・改行・例外・ID・繰返し設定を確認する小さなテストを残す。
認識とTextProcessorの既存テストへ人工的な本文による切替と確定・取消の確認を追加する。GPU推論を単体確認の必須にしない。
Ruff、対象テスト、Compose設定を確認する。中央送信は[結合確認](../task-260921212106-distributed-logging-acceptance/task.md)で扱う。

## 対象外と文書同期

音声生成の内容制御は[別タスク](../task-260921212105-speech-synthesis-logs/task.md)で行う。
認識音声・結果ファイルとS3保存、Mastraの機能用履歴、通信形式は変更しない。
`documents/design/infrastructure/logging.md`、`backend/services/speech-recognizer.md`、`backend/services/text-processor.md`と設定サンプルを同期する。
テキストからJSONLへの運用ログ形式変更と既存`--log-file`への影響を記載する。

## 実装と確認の記録

- 共通設定を毎回独立に生成し、JSONL・構造付き属性・例外の型と位置・必要時だけのファイルハンドラーを実装した。4入口のUvicorn上書きと手作りtracebackを止めた。
- 認識結果と新規入力・送信済み断片・確定結果は出力元で切り替える。Pokeの重複出力とNeMo補正traceの運用ログ出力を除いた。一般の処理結果は本文なしで維持する。
- 実ハンドラーの日本語・改行・例外・認証属性・再設定・ファイル出力と設定値、Poke／Mastraの公開WebSocket経路で有効・無効・成功・送信失敗・取消を確認した。既存HTTPストリーム試験を含め41件PASS。ローカル待受には実行環境の権限拡張を使用した。
- 既存NeMoイメージへ変更ソースを読取専用で渡し、ネットワーク・GPUなし、人工認識モデルで既存補正試験と本文切替11件PASS。機能結果が一致することを確認した。
- コメント点検: 共通フォーマッター・設定、4サービス入口、認識ワーカー、共通対話ワーカー・Pokeの変更理解範囲を点検した。
- Composeの4サービスで既定値の伝達を確認。変更PythonのRuff診断は基点からの増加なし（既存の命名・保存時刻・テスト形式の診断は対象外）。共通設定と対話ワーカーのty、変更範囲の整形、タスク整合、差分検査はPASS。
