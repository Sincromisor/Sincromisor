# 音声パイプラインのWebSocket契約

## 要約

- Goパイプライン調停器とSpeechExtractor / SpeechRecognizer / TextProcessor / VoiceSynthesizer間のWebSocket契約を定義する。
- 4系統のWebSocketはmsgpackバイナリを使い、調停器がキューで中継する。
- モデルの互換性を失う変更は、`sincro-models`と各送信処理 / receiver / 処理担当を同時に更新する。

## 生成側・利用側

- 生成側
    - Goパイプライン調停器: 音声フレーム、認識結果、応答テキスト
    - 下流サービス: 抽出 / 認識 / テキスト / 音声合成結果
- 利用側
    - SpeechExtractor、SpeechRecognizer、TextProcessor、VoiceSynthesizer、Goパイプライン調停器

## 互換性方針

- WebSocketパス、msgpackモデル、必須フィールドの変更は破壊的変更として扱う。
- `sincro-models`の変更は各サービスとGoパイプライン調停器を同時に確認する。
- TextProcessorのチャット / テロップ契約変更はフロントエンドRTC契約にも影響する。

## エンドポイント・チャネル

| サービス         | エンドポイント                                       | 用途                                              |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------- |
| SpeechExtractor  | `/api/v1/SpeechExtractor/extract?max_silence_ms=...` | 音声フレームから音声区間を抽出                    |
| SpeechRecognizer | `/api/v1/SpeechRecognizer/recognize`                 | 音声区間をテキストへ変換                          |
| TextProcessor    | `/api/v1/TextProcessor/{talk_mode}`                  | 認識テキストから応答テキスト / テロップ情報を生成 |
| VoiceSynthesizer | `/api/v1/VoiceSynthesizer/synthesize`                | 応答テキストを音声化                              |

## 送受信データ

- モデル送受信データはMessagePackバイナリフレームとする。
- SpeechExtractorの初期化後に送る未加工PCMだけはモデルを持たないバイナリフレームとする。
- TextProcessorの応答バイト列はGoで振り分け用のフィールドを復号した後も再符号化せず、
  同じバイト列をVoiceSynthesizerへ渡す。

### 通信方向

| 方向                                  | モデル                                | 用途                                                      |
| ------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| Go → SpeechExtractor                  | `SpeechExtractorInitializeRequest`    | セッションと入力PCM形式の初期化                           |
| Go → SpeechExtractor                  | モデルなしの未加工PCMバイナリフレーム | 連続音声入力                                              |
| SpeechExtractor → Go                  | `SpeechExtractorResult`               | 発話区間のPCMと確定状態                                   |
| Go → SpeechRecognizer                 | `SpeechExtractorResult`               | 認識対象の発話区間                                        |
| SpeechRecognizer → Go                 | `SpeechRecognizerResult`              | text/scoreタプルの列                                      |
| Go → TextProcessor                    | `TextProcessorRequest`                | 認識文とチャット履歴                                      |
| TextProcessor → Go → VoiceSynthesizer | `TextProcessorResult`                 | 振り分けフィールドを復号し、元バイト列を変更せずTTSへ転送 |
| VoiceSynthesizer → Go                 | `VoiceSynthesizerResult`              | 符号化済みの音声、モーラ時刻情報、音声形式                |

`SpeechRecognizerResult`、`TextProcessorResult`、`VoiceSynthesizerResult`はGo利用側専用である。
Goは音声認識処理結果から別モデルの `TextProcessorRequest`を生成するため、
`SpeechRecognizerResult`を再符号化しない。`TextProcessorResult`と
`VoiceSynthesizerResult`にもGo本番符号化APIを設けない。

### フィールドのスキーマ

表の `required, nullable`はキー自体が必須で、値にMessagePack `nil`を許すことを表す。
その他の必須フィールドは `nil`を許さない。文字列の空、リストの空、
バイナリの空はコーデック層で許可し、業務領域上の範囲や形式の妥当性は各クライアントが検証する。

| モデル                             | フィールド                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SpeechExtractorInitializeRequest` | `session_id: string`、`start_at: float`、`voice_sampling_rate: int64`、`voice_sample_bytes: int64`、`voice_channels: int64`                                                                                                      |
| `SpeechExtractorResult`            | `session_id: string`、`speech_id: int64`、`sequence_id: int64`、`start_at: float`、`confirmed: bool`、`voice: binary`、`voice_dtype: string`、`voice_sampling_rate: int64`、`voice_sample_bytes: int64`、`voice_channels: int64` |
| `SpeechRecognizerResult`           | `session_id: string`、`speech_id: int64`、`sequence_id: int64`、`start_at: float`、`confirmed: bool`、`result: list<[string, float]>`                                                                                            |
| `ChatMessage`                      | `speech_id: int64`、`message_id: string`、`message_type: string`、`speaker_id: string`、`speaker_name: string`、`expression_code: int64 \| nil`、`message: string`、`created_at: float`                                          |
| `ChatHistory`                      | `messages: list<ChatMessage>`                                                                                                                                                                                                    |
| `TextProcessorRequest`             | `session_id: string`、`sequence_id: int64`、`confirmed: bool`、`history: ChatHistory`、`request_message: ChatMessage`                                                                                                            |
| `TextProcessorResult`              | `session_id: string`、`sequence_id: int64`、`confirmed: bool`、`history: ChatHistory`、`request_message: ChatMessage`、`response_message: ChatMessage`、`end_of_response: bool`、`voice_text: string \| nil`                     |
| `VoiceSynthesizerResult`           | `speech_id: int64`、`message: string`、`query: map`、`mora_queue: list<Mora>`、`speaking_time: float`、`voice: binary`、`audio_format: string`。`Mora`は `vowel: string \| nil`、`length: float`、`text: string \| nil`を持つ    |

すべてのPython整数はGoの符号付き `int64`範囲で受理する。負の値は通信上の
表現として許可するが、`int64`を超える符号なし整数は拒否する。
`voice`はMessagePack文字列へ暗黙変換せずバイナリだけを受理する。

### 互換性確認用の固定データ

- 固定データ: `sincromisor-server/sincro-rtc/internal/pipeline/protocol/testdata/*.msgpack`
- 構成情報: `sincromisor-server/sincro-rtc/internal/pipeline/protocol/testdata/manifest.json`
- Python生成処理
  `sincromisor-server/sincro-rtc/internal/pipeline/protocol/testdata/generate_fixtures.py`
- Go生成側補助処理
  `sincromisor-server/sincro-rtc/internal/pipeline/protocol/testdata/generate_go_payloads.go`

固定データは現在の `sincro_models`クラスと `to_msgpack()`から固定ID、時刻、人工音声バイト
だけを使って生成する。生成処理の `--check`は一時ディレクトリへ再生成し、固定データと
構成情報のバイト差分を検出する。固定データを手編集しない。

### 復号時の検証

- 送受信データの最上位の値は文字列キーを持つ単一のマップとし、空送受信データ、最上位がマップでないデータ、
  文字列以外のキー、後続のオブジェクト・バイト列を拒否する。
- 通信上のすべてのフィールドでキーの存在を要求する。Pydantic既定をGoで補完しない。
- 入れ子のマップを含む未知キーは、Python生成側のフィールド追加に対する前方互換性
  のため無視する。
- 必須list/binaryの `nil`、フィールド型不正、バイナリフィールドのテキスト、
  音声認識処理タプルの要素数/型不正を拒否する。
- エラーはモデル名と `$`または `ProcessorResult.response_message.speech_id`のような
  固定フィールドパスを含め、音声、認識文、チャット本文の値を含めない。
- 復号結果のbinary/listと `TextProcessorResult`の未加工の送受信データはGo側が所有する
  防御的コピーとし、呼び出し元が入力スライスを変更しても結果を変えない。

## エラーの扱い

- 接続断、復号エラー、処理担当例外は該当スレッドの終了として扱う。
- Goパイプライン調停器は通信の異常を検知し、4接続を再作成する。
- ユーザーへ見せる必要があるエラーは `text_channel_queue`経由で `text_ch`へ中継できる。

### Goパイプライン調停器

`sincro-rtc/internal/pipeline/client`は、上表と同じ4エンドポイントへ
`github.com/coder/websocket`のバイナリメッセージだけで接続する。Extractorは接続直後に初期化MessagePackを
1件送り、その後は20 ms単位の16 kHzモノラルs16le未加工PCMだけを送る。他の3クライアントは
`internal/pipeline/protocol`の限定DTOを使い、TextProcessor応答は復号時に保持した元バイト列を
VoiceSynthesizerへ変更せず転送する。

各クライアントは1接続につき受信処理を1つ、同期書き込み処理を呼び出し元側に1つだけ持つ。読み書き送受信データにはサービス別の
有限上限を適用し、アプリケーションのテキストメッセージ、復号失敗、ping失敗、相手側終了を回復不能な失敗とする。
通常の送信がないことだけを理由に切断せず、10秒間隔のpingを5秒時間切れで確認する。接続・書き込みの本番既定は5秒、
終了接続交渉は2秒で打ち切って下位ソケットを強制終了する。これらの本番値はGoパッケージの
`DefaultConfig`をコード正本とし、テスト用設定では正数の範囲で短縮できる。

個別クライアントは再接続、再試行間隔、世代、4接続の一括再初期化を行わない。`Connect`へ渡したコンテキストまたは明示
`Close`が受信処理とpingを停止し、goroutine終了待機と結果・イベントチャネル終了まで完了させる。

`internal/pipeline`のCoordinatorは4クライアントをExtractor、Recognizer、Processor、Synthesizerの順で接続し、
全接続の`Activate`が成功した場合だけ同じ世代として公開する。途中失敗と公開前イベントは接続途中のクライアント一式を逆順に終了し、
世代を変えずに新しいクライアント一式で再試行する。`running`中の終了イベントは同時に1つだけ行う再初期化へ集約し、
ロック下で世代を先に進めてから旧コンテキスト、4クライアント、一時的なキュー / 処理中の状態を破棄する。
`Activate`へ渡すコールバッククロージャはクライアント一式公開時の世代を捕捉する。結果とイベントコールバック、
外部出力キューへの追加は捕捉値と現在値を再確認し、旧世代を次段へ渡さない。旧世代の結果を破棄したログは
サービス名とサービス別の累積破棄件数だけを持ち、認識文、音声、チャット本文、原因エラーを含めない。

ブラウザ入力は20 ms、16 kHz、モノラル、s16leの640-byteフレームだけを受ける。`running`以外では保存せず拒否し、
`running`中は25フレーム（500 ms）の上限付きのキューで最古の未送信フレームだけを破棄する。テキスト / 合成済みの出力は
各16件で順序を維持し、送信先の詰まりが5秒続いた場合は、通知せずに破棄するのではなく再初期化の理由にする。外部チャネルはセッション生存期間で
交換せず世代情報で包んだ値を返し、再初期化同期点でバッファ済み旧要素を排出する。PCM容量超過も
Coordinatorがキュー交換とは独立したセッション累積値として所有し、Extractorのサービス名と累積破棄件数だけを記録する。

確定チャット履歴だけをセッション状態に保持する。暫定認識、現在のユーザーメッセージ、
未完了処理器応答、未送信TTSは世代状態であり再初期化時に破棄する。Processorの中間結果は
要求履歴との完全一致、最終結果は要求履歴を接頭辞とする応答追加済み履歴との完全一致を
検証した場合だけ受理し、最終結果だけを確定履歴に反映する。
最後に受理したExtractorの発話IDと系列IDもセッション状態として保持する。系列IDは世代をまたいで
厳密な単調増加とし、新世代の最初の発話IDは直前世代より大きい値だけを受理する。
重複または逆行は通信規約失敗として、その結果が届いた現在世代を再初期化する。

再試行は1秒上限から始まる全待機範囲でのランダムな揺らぎで、試行5以降は上限が30秒となる。`Close`またはStartコンテキスト中断は
再試行待機処理、世代goroutine、クライアントを中断 / 終了待機し、全生成側終了後に外部チャネルを終了する。
通常経路ではこのCoordinatorがPionセッションに統合される。

## 時間切れ・再試行

- 受信側は時間切れ付きrecvで監視を継続する。
- 調停器は1秒起点、最大30秒程度の再試行間隔で4接続を再作成する。
- 過負荷時は低遅延を優先し、古いフレームの破棄を許容する。
- 移行中のGo個別クライアントは自動再試行しない。上位調停器が終了イベントを受け、4接続を同じ世代で
  作り直す責務を持つ。

## バージョン管理

- msgpackモデルに破壊的変更を入れる場合は、全下流サービスとGoパイプライン調停器を同一タスクで更新する。
- WebSocketパス変更はDocker Compose、Consulサービス名、代替処理設定も同時に確認する。

## 検証項目

| 観点          | 確認内容                                   |
| ------------- | ------------------------------------------ |
| Extractor     | 初期化要求と音声フレーム送信が成立する     |
| Recognizer    | 音声区間から確定 / 暫定結果が返る          |
| TextProcessor | `talk_mode`別パスで応答が返る              |
| Synthesizer   | 応答テキストから音声フレームが返る         |
| 再接続        | 1系統切断後に4接続を新世代で一括再作成する |

## 参照

- `documents/design/contracts/frontend-rtc.md`
- `documents/design/archive/legacy-flat/networking_websocket.md`
