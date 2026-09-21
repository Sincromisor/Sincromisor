# レビュー: task-260921212105-speech-synthesis-logs

## 判定

APPROVED

## 理由・申し送り

- 本文の現在の出力箇所は`VoiceSynthesizerWorker`の受信全体・`voice_text`・結果、`VoiceCacheManager`の要求とRedis/S3命中、`VoiceVox.response_validator()`の要求URLであり、タスクの対象と一致する。共通Python JSONL、Vectorの第三者出力除去、内容記録の共通契約に根拠があり、HTTP代役と既存機能の確認は音声品質評価を増やさない最小の確認である。
- `SINCRO_LOG_SYNTHESIS_ENABLED`は`VoiceSynthesizerProcessArgument`で厳密に`true` / `false`を検証し、未指定を有効として`compose/voice-synthesizer.yml`と設定例から渡す。`SINCRO_LOG_CONVERSATION_ENABLED`とは別の値としてワーカーへ渡し、片方を変えても他方の本文記録・音声生成・Redis/S3キャッシュを変えない。不正値を既定値へ丸めず起動時に拒否する。
- 有効時の構造付きイベントは、要求時に実際の`session_id`、`speech_id`、保持される`sequence_id`、本文、指定style ID、要求audio formatを持つ。生成後は実際に得たaudio format、話者・スタイル、`VoiceVoxQuery`へ反映済みの前後無音・pause条件、処理時間、Redis命中・S3命中・生成を別の結果区分で残す。音声バイナリ、`VoiceSynthesizerResult`全体、キャッシュkeyの本文由来部分はJSONLへ入れない。
- 無効時は`VoiceSynthesizerWorker`の`repr(tp_result)`、本文付きの要求・結果、`VoiceCacheManager`の`SynthRequest`各ログ、`VoiceVox`のURLを含む`ProtocolError`と、Redis/S3/HTTP例外の生文字列を出力元で止める。失敗・命中・所要時間などの運用イベントは本文なしの固定`event`、ID、cache source、失敗分類として残し、失敗を成功またはcache hitへ変換しない。S3 access key・secret key、Authorizationや要求ヘッダーも常に出力しない。
- `VoiceVox.audio_query()`と`accent_phrases()`は`text`をクエリに置き、VOICEVOX本体のアクセスログもそのURLを出し得る。固定VOICEVOX 0.25.2コンテナの実出力で確認し、公式のアクセスログ無効化または本文を含むURLの除去を使う。出力元で止められない場合はVectorで`text`とURLエンコード済み本文を中央投入前に除去し、Dockerの`local`原本に残り得ることを設計へ明記する。代替項目への本文複製はしない。
- 既存のWebSocket・msgpack、VOICEVOX要求、音声生成、Redis/S3への保存と保存済み内容は変更しない。接続入口の例外も本文のない共通JSONL経路に保ち、詳細ログを無効にしてもサービスの開始・接続・失敗の観測を失わない。

## 自律補完

- `AUTO_FIX`: キャッシュ結果は`redis_hit`、`s3_hit`、`generated`、失敗は`failed`として一意に記録する。現行のキャッシュ確認順と実行経路に根拠があり、追加のキャッシュ層や再試行は不要である。
- `AUTO_FIX`: 生成条件は入力値の再掲ではなく、`VoiceSynthesizer.generate()`が実際に使用したstyle、実際の出力形式、query filter反映後の条件を記録する。キャッシュ命中時は保存済み結果から取得できる範囲だけを記録し、推測で補わない。
- `AUTO_FIX`: VOICEVOXの本文付きアクセスログを出力元で無効化できない場合だけ、Vectorの既存除去経路を使う。中央に送らないこととDocker原本から消えることを混同しない共通契約による補完である。
