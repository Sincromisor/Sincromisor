# バックエンドサービス: VoiceSynthesizer

## 要約

- VoiceSynthesizerはTextProcessorの応答テキストを音声フレームへ変換する下流サービスである。
- 出力音声はGoパイプライン調停器とPion RTCを通じてWebRTC音声トラックでフロントへ返る。
- WebSocket / msgpack契約は `contracts/audio-pipeline-websocket.md`を正本とする。

## 合成エンジン

Composeは公式 [VOICEVOX ENGINE 0.26.0](https://github.com/VOICEVOX/voicevox_engine/releases/tag/0.26.0) の
`7ebc23342bd812f5a72816330f62f110ccca8bdc`を固定取得し、Linux CPU/x64用にビルドする。
公式版にない段階拡大は `Docker/voicevox/streaming-ramp.patch`で追加し、適用不整合はビルド時に拒否する。
2026-10-24に公式リリース・ソースを確認し、既存の逐次合成契約を維持する範囲で採用した。
ビルド入口は `Docker/voicevox/Dockerfile`で、外部のローカル作業コピーは不要である。

| 構成要素                     | 固定版                                              |
| ---------------------------- | --------------------------------------------------- |
| Python / uv                  | 3.14.9 / 0.13.5、公式Engineの `uv.lock`で依存を固定 |
| Core / VOICEVOX ONNX Runtime | 0.17.1 / 1.23.2、配布物のSHA-256を検証              |
| モデル                       | VVM 0.17.0の `0.vvm`、SHA-256を検証                 |
| 公式リソース                 | 0.26.0の `37c265375e05313486ebf2024b1679d6952a53d8` |

`0.vvm`で既定のスタイルID `0`を提供する。他のモデルのスタイルを使う場合は、同じ固定版の
モデルとチェックサムをDockerfileへ追加してから切り替える。
Engine、Core、ランタイムのライセンス、Python依存の同梱情報、公式リソースの利用規約を最終イメージに保持する。
辞書はビルド時に取得し、UID 10001の非rootユーザーで起動する。

実際に取得したEngineのSHAは `/opt/voicevox_engine/ENGINE_REVISION`と
`dev.sincromisor.voicevox.engine.revision`ラベルで確認する。
イメージ内の `engine_manifest.json`の版には `0.26.0+sincromisor.`に続けて同じSHAとパッチSHA-256の先頭12桁を含める。
パッチの完全なSHA-256は `/opt/voicevox_engine/STREAMING_PATCH_SHA256`に保持する。上流由来の `/version`は `latest`を返し、HTTPの `/engine_manifest`には版の項目がないため識別には使わない。
`/core_versions`も話者メタ情報由来の `0.17.0`を返す。Core実体の版は共有ライブラリーの `voicevox_get_version()`で `0.17.1`と確認する。
Sincromisor公開元を示す `org.opencontainers.image.revision`とは区別する。

`/streaming_synthesis`は固定長の `segment_length`と、段階拡大用の任意の `max_segment_length`を提供する。
例えば `0.3`と `2.4`の指定では区間を0.3→0.6→1.2→2.4秒に拡大する。
通常の会話では `/audio_query`から得たクエリを48kHzモノラルへ設定し、`/streaming_synthesis`を段階拡大で受信する。
WAVの形式・宣言サイズ・受信サイズを検証し、生PCMを区間ごとにWebSocketへ送る。全体のOpus変換・保存を待たず、
Goが順次バッファへ載せて20msごとにOpus符号化する。区間モデルは [音声パイプライン契約](../../contracts/audio-pipeline-websocket.md#合成音声の区間転送) を正本とする。
完全音声を要求する既存の `get_voice`と `/synthesis`による生成も、キャッシュ・診断用の経路として保持する。

ビルド・HTTP・利用側の再現手順と移行判断は [更新タスク](../../../../tasks/infrastructure/task-261024000805-voicevox-026-upgrade/task.md) に記録する。
上流が同等の段階拡大を提供した場合は、引数・入力拒否・波形連続性の回帰試験を確認してパッチを除去する。

## 対象範囲

- 対象
    - VoiceSynthesizerサービス境界
    - 応答テキストから音声フレームへの変換
    - Goパイプライン調停器への結果返却
- 非対象
    - フロント側再生UI
    - TextProcessorの応答生成

## 責務

- TextProcessorの出力を受け取る。
- 音声合成バックエンドを呼び出す。
- `VoiceSynthesizerChunk`の列としてGoパイプライン調停器へ返す。

### 口形用モーラ列の生成

`VoiceSynthesizer`はクエリ取得、句末休止長の調整、逐次WAV生成を調停する。完全音声用の経路では音声形式の変換も行う。
[streaming_mora_timing.py](../../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/streaming_mora_timing.py) は、
固定Engineと同じ音素フレーム位置から会話用の口形列を作る。前後の無音、休止長と倍率、速度を反映し、
子音と母音をそれぞれ93.75fpsで偶数丸めしてからモーラへまとめる。48kHz出力では1フレームが512サンプルとなる。
疑問文末尾の同母音延長は最後のモーラへ加え、文字を二度表示しない。区間境界やWAV完成後の時間伸縮には依存しない。

完全音声用の [mora_timing.py](../../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/mora_timing.py) は、
既存のクエリ秒数による列を維持する。どちらもクエリを変更せず、休止と前後無音には口形・表示文字を付けない。
Engineの音素配置を変更する場合は、会話用の丸め・速度・疑問文補正と実WAVのサンプル数を同時に確認する。

## 運用ログ

共通JSONLを使い、`SINCRO_LOG_SYNTHESIS_ENABLED`（既定`true`）で本文と生成条件の詳細を切り替える。
生成・Redis・S3の取得元と要求・結果を区別し、WebSocketで保持する会話・発話・シーケンスIDを記録する。
この設定が無効でも、本文を含めずに成功・失敗を記録する。HTTP失敗は状態コードだけを保持し、URLや例外値は記録しない。
キャッシュ保存・返却音声・MessagePack契約は設定に依存しない。
VOICEVOXの中央ログの除去とDocker原本の扱いは[ログ設計](../../infrastructure/logging.md#音声生成)を参照する。

## 変更時の確認

- 音声フレームモデルを変える場合はGoパイプライン調停器とWebSocket契約を同時に更新する。
- 音声合成の提供元や設定を変える場合はDocker Compose環境変数と機密情報の取り扱いを確認する。
- テロップ / 口形同期との関係を変える場合はフロントエンドのキャラクター動作とRTC契約を確認する。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/backend/services/text-processor.md`
- `documents/design/archive/legacy-flat/backend_voice_synthesizer.md`

本文ログ設定によらず、`synthesis_processing`は開始と取得元付きの結果・`duration_ms`を残す。`synthesis_operation`はクエリ作成（`audio_query`）、WAV生成と時刻整形（`synthesis`）、音声変換（`encode`）の結果・所要時間・安全な原因を記録する。

`voice_cache_operation`は読取（復号込み）または書込全体の`duration_ms`を持つ。Redis/S3の読取・復号・書込を区別し、キー不存在と権限拒否・接続失敗・破損を分ける。会話・発話IDを付け、キー・本文・音声・例外文字列は記録しない。S3読取の生成への代替、保存失敗時の継続、破損キャッシュの例外伝播は従来どおりとする。opusenc/fdkaacの非ゼロ終了・起動不能は共有 `audio_command_failure`で記録する。診断はstderrの先頭64 KiBを固定語彙へ置換し、原文を出さない。コマンドの実行回数や既存の出力取得方法は変えない。

## HTTP接続の所有と待機上限

接続ごとのVoiceVoxがRequestsのSessionを所有し、連続要求で接続プールを再利用する。APIごとの応答はその場で解放し、WebSocket終了時にWorker、VoiceCacheManager、VoiceSynthesizerの順で終了を伝えてSessionを閉じる。Sessionは他のクライアント生成が成功した後、初期化の最後に作る。

HTTPは接続5秒・読取り30秒とし、自動再試行は行わない。HTTP非成功は本文・URLを含めないProtocolErrorで伝え、タイムアウトは既存の生成失敗経路へ伝播する。

## 逐次生成・キャッシュ・接続終了

Workerは一要求ずつ処理し、同期イテレーターから次のPCM区間を得る処理だけを `asyncio.to_thread`へ渡す。
次区間を先読みする無制限のキューは作らず、WebSocket送信を待ってから次の読取へ進む。
送受信と要求・区間IDの管理は接続のイベントループが所有する。

HTTP応答は同期イテレーターが所有し、正常完了、受信失敗、取消後の回収で閉じる。
親取消は実行中の同期I/Oを直接止めないため、取消を記録し、進行中の読取を回収してからイテレーターとSessionを閉じる。
HTTP接続5秒・読取30秒の既存上限を維持し、WebSocket送信にも30秒の上限を設ける。
切断や不正なWAVでは正常終端を送らず、Goの世代更新で未送信区間とモーラを破棄する。

逐次生成用のキャッシュは `streaming-pcm-v1`で既存キーと区別し、48kHzモノラルの完全WAVとクエリ・モーラを
既存の `VoiceSynthesizerResult`形式で保持する。旧Opus等のエントリーは削除しない。
要求全体120秒の上限内で蓄積し、Content-LengthとWAVサイズの整合、正常EOFと取消されていないことを確認してから保存する。
途中失敗では保存しない。命中した完成WAVも同じPCM区間へ切り出すため、Goの再生経路は生成時と共通である。

ProcessはWorkerの終了後にcloseを呼び、合成用Session、S3、Redisを逆順に解放する。
構築途中の失敗でも取得済みクライアントを閉じる。Redisの接続5秒・読取30秒、S3の既存接続・読取上限、
完全音声経路の外部変換30秒上限は維持する。これらは処理全体の一律期限ではなく各I/Oの待機制限である。

## 受信抑制と接続監視

Processは `uvicorn.run` の `ws` に [BackpressureWebSocketProtocol](../../../../sincromisor-server/voice-synthesizer/src/voice_synthesizer/backpressure_websocket.py) を指定する。UvicornのSansIOが要求の滞留で受信を停止した間は、Ping送信予約とPong待機を回収する。要求キューが空になって受信を再開したら、停止前の待機を引き継がず新しいPingで監視を始め直す。遅れて届くPongは現在のPingのペイロードと一致しなければ無視する。

受信可能な間は採用中Uvicornの既定値（Ping間隔20秒、Pong期限20秒）で監視し、無応答を1011で切断する。タイマーと待機状態は各接続が所有し、同じイベントループの単調時計を使う。通常のClose、接続断、サーバー停止で回収し、終了時の受信再開では監視を再開しない。合成中にキューが滞留している間は相手の無応答も判定しないが、合成I/Oには上記の待機上限がある。

この補正は受信抑制と生存確認の連動に限る。逐次合成、取消時の同期処理回収、Uvicornのメッセージ容量制限と受信抑制を維持する。上流が同じ競合を修正し、実ワーカーの滞留・監視再開とタイマー境界の回帰試験を通った段階で補正を置き換えられる。
