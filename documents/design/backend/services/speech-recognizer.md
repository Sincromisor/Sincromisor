# バックエンドサービス: SpeechRecognizer

## 要約

- SpeechRecognizerは抽出済み音声区間をテキストへ変換する下流サービスである。
- NeMoで音声を認識する。コンテナの `SINCRO_RECOGNIZER_MODEL`は `nemo`のみ受け付ける。
- 固有名詞補強は取り組み計画と辞書契約に分離する。

コンテナはCUDA 13.0系を使う。ホスト側の条件は[Compose設計](../../infrastructure/compose.md#nemoのgpu基盤)を参照する。

## 対象範囲

- 対象
    - SpeechRecognizerサービス境界
    - NeMo音声認識処理の認識結果
    - 確定 / 暫定の扱い
    - 固有名詞補強との接続点
- 非対象
    - 音声抽出
    - TextProcessorの応答生成

## 責務

- Goパイプライン調停器から音声区間を受け取る。
- 音声区間を暫定 / 確定結果へ変換する。
- 必要に応じて確定結果に後処理を適用する。
- 結果をTextProcessorへ渡せるmsgpackモデルとして返す。

## 差分音声の受信

Goは接続あたり未応答要求を1件とし、応答待ちの間の同一発話の未送信PCMだけを順序どおり結合する。結合要求は末尾の通番・確定状態・`start_at`を持ち、送信済み音声を再送しない。Recognizerは通番の連続性を要求せず、受けた差分を発話ごとに累積するため、従来の個別差分と結合差分の両方を処理できる。確定時の累積PCMと補正条件は同じである。

Goの `recognition_request_sent`は送信要求数、代表した抽出入力数、最初の未送信差分から送信開始までの `pending_ms`を本文なしで記録する。これはRecognizer内部の `queue_wait_ms`、`execution_ms`と別の区間であり、表示更新間隔や確定待ちの比較ではGo側の保留も含める。

## 固有名詞認識の補強

- 辞書仕様
    - `documents/design/contracts/proper-noun-dictionary.md`
- 導入計画
    - `documents/design/initiatives/proper-noun-biasing.md`
- 基本方針
    - 暫定の低遅延経路を保つ。
    - 確定時の読み一致補正、文脈による認識候補の補強、上位N候補の再順位付けは実装済みである。辞書と各機能の設定に応じて適用する。
    - 未補正の音声認識結果と補正の追跡記録はデバッグ可能に残す。

## 変更時の確認

- `SpeechRecognizerResult`を変える場合はWebSocket契約とTextProcessorを同時に確認する。
- 辞書列を変える場合は固有名詞辞書の契約を更新する。
- 確定専用の重い処理を入れる場合は遅延と代替処理を確認する。

## 辞書の追加手順

CSVの作成・配置・設定・読込み確認は[固有名詞辞書の利用ガイド](../../../guides/proper-noun-dictionary.md)を参照する。列と補正の仕様は[辞書契約](../../contracts/proper-noun-dictionary.md)に定める。

## 運用ログ

認識の運用ログは`recognition_result`へ本文と会話・発話・シーケンスID、確定状態を記録する。`SINCRO_LOG_CONVERSATION_ENABLED=false`では本文イベントを出さず、処理時間と結果だけを残す。補正追跡の運用ログへの重複出力はしない。認識音声・結果ファイルとS3保存はこの設定の対象外である。
書式・例外情報・設定反映は[ログ基盤](../../infrastructure/logging.md#pythonのjsonl出力)を参照する。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/contracts/proper-noun-dictionary.md`
- `documents/design/initiatives/proper-noun-biasing.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_biasing.md`

## 共有モデルの実行と終了

`recognition_execution`は実行した要求ごとに、専用スレッドへの投入から開始までの `queue_wait_ms`と、推論・補正の `execution_ms`を記録する。時刻差は単調時計で測り、会話・発話・通番と確定状態、成功・失敗だけを添える。保存分離前の `execution_ms`にはローカル保存・S3保存が含まれていたため、過去ログと同じ意味の値として比較しない。`recognition_processing.query_time`も推論・補正の秒数であり、WebSocketの受信待ちや送信時間は含まない。

未開始で取り消された要求は実行記録を出さない。開始済み要求の実行結果は、呼出元が取消済みでも回収後に記録するため、`outcome=success`はブラウザーへの配送成功を意味しない。本文・音声・保存先・例外の自由文は追加しない。

サービス所有の単一ThreadPoolExecutorでWorkerを生成し、複数接続の認識・候補再試行を直列実行する。接続は完了を非同期に待ち、その間も状態確認を受け付ける。未開始の取消要求は実行しない。実行中の取消はモデル設定の復元と入力参照の解放まで回収する。全接続の終了後、同じスレッドでWorkerを解放して実行スレッドを閉じる。

S3は接続5秒・読取り30秒・1試行、認識と合成で共有する外部符号化は30秒を上限とする。符号化の時間切れは子プロセスを回収して伝播する。GPU推論の強制停止や自動再試行は追加しない。

## 認識記録の保存

確定時のローカルJSON・補正追跡・音声とS3のJSON・音声を、モデルから独立した保存サービスへ引き渡す。`RecognitionStorage`は受理前に件数・音声バイト数を予約し、その後にCPU音声・認識結果・補正情報を所有コピーする。保存専用の単一スレッドとS3クライアントをサービスが所有し、接続切断後も受理済みの保存を続ける。GPUテンソルや接続固有クライアントは渡さない。

予約中・待機中・実行中を合計して32件、PCM 64MiBまでとする。満杯時は枠が空くまで非同期に待つため、当該結果の返却は遅れるが、共有モデルは他接続の推論を実行できる。枠予約前の取消は未保存として診断し、予約後のコピー・投入失敗では枠を解放する。単独で64MiBを超える音声は永久待機せず、`audio_exceeds_capacity`として保存失敗を明示し認識結果を返す。上限を超える音声の分割保存は行わない。

受理後は保存完了を待たずに認識結果を返す。保存先、キー、JSONの形式、ローカルのOpus優先・未配置時のWAV、S3のOpus未配置時の音声保存省略を維持する。Opusが必要な場合は一度だけ圧縮し、両保存先で同じ生成物を使う。保存例外は独立した `recognition_storage`診断にし、認識成功の条件から外す。従来のローカル保存例外が認識要求も失敗させていた動作から変わる。

保存の受渡し待ちは `recognition_storage.stage=handoff`の `elapsed_ms`、専用スレッドの待ちは `stage=execution`の `queue_wait_ms`、保存実行は同イベントの `elapsed_ms`で区別する。保存先ごとの成功・失敗は既存の `peer=local/s3`のイベントで確認する。正常終了では新規受付を止め、受理済みジョブを回収した後にS3クライアントと保存実行器を閉じる。強制終了時の永続化保証は追加しない。

## 認識の段階

SpeechRecognizerNemoは、16kHz音声の正規化と前後0.5秒の余白追加、特徴量前処理・エンコード、候補のデコードを分ける。encodeが返すテンソルと有効長をdecodeへ渡し、音声からのtranscribe / transcribe_with_scoreは結果形式を維持する。入力のdtype・最小長・バッチ化、dither・pad_to・eval・凍結状態の準備と復元は採用NeMoの処理を使い、推論はtorch.inference_mode内で実行する。

NeMoの非公開の準備・入力処理・復元メソッドに依存するため、NeMo更新時には一括transcribeとの実モデル比較が必要である。ライブラリ内部の処理は複製しない。

一回のWorker.recognizeがエンコード結果と有効長を所有し、通常認識のdecode_with_scoreと必要な補強・N-bestのdecode_candidatesへ同じ値を渡す。再試行はデコードだけを行い、補強採用後のN-best省略や候補の順位付けは維持する。内部のtranscribe_candidatesはdecode_candidatesへ置換し、呼出元もエンコード済み入力へ揃えた。WebSocket契約は変更しない。

各再デコードは設定をfinallyで復元し、Workerは通常認識と全再試行の終了後、保存処理より前にテンソル参照を解放する。参照はWorkerのフィールドや結果・追跡情報へ保持せず、別発話・別接続・暫定から確定への持越しを行わない。取消は共有実行器がWorkerの終了まで回収するため、設定復元と要求内参照の解放を飛ばさない。失敗をログやFutureが保持してもGPUテンソルを残さないよう、完了した例外フレームの局所変数と呼出元のエンコード参照を解放する。例外の型・メッセージ・行情報は維持する。
