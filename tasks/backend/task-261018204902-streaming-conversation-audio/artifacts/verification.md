# 逐次再生の実結合確認

## 構成と結果

固定版VOICEVOX Engine、実VoiceSynthesizerProcess、GoのSynthesizerクライアント、Session出力、Pion同士のWebRTC接続を使った。
上流の認識・LLMは固定要求へ置き換え、ブラウザー側に相当するPionでOpusを復号し、振幅500を超えた最初のフレームを観測した。
音声や実際の会話は保存せず、検証文は `make-live-request.py`で生成した。

- 実音声: 48kHzモノラル、1,205,760サンプル、25.12秒、終端込み253メッセージ。
- 最初の有声音: 要求送信から739ms。
- PythonでのHTTP EOFとWAV検証完了: 最初の有声音より6,226ms後。
- WebSocket終端受信: 要求送信から6,999ms。
- 終端までの順序・総サンプル数・モーラ範囲の検証: PASS。
- 数値証跡: [live-result.json](live-result.json)。Goの `time.Now`とPythonの `time.time_ns`は同一Linuxホストの時計を使う。

HTTP EOFはPythonがレスポンスを受信・検証し終えた観測点であり、Engine内部の生成終了時刻そのものではない。
キャッシュ保存後の終端時刻だけに依存せず、保存前のHTTP EOFと比較した。
実ブラウザーでの聴取・描画は未実施。Pion実通信とフロントの口形復帰の決定的試験で変更箇所を確認した。

初回確認では、生クエリ秒数を足したモーラ列が実PCM末尾を超えた。
固定Engineの音素単位の93.75fps丸めに合わせた会話用メタデータへ修正し、隔離キャッシュを空にして再確認した。
末尾だけを無条件に切り詰める対応は行っていない。

## 再現手順

リポジトリルートから実行する。合成サービスのイメージには既存のPython依存が必要で、実装ソースは読取専用マウントで渡す。
`SINCRO_STREAMING_SOURCE`は確認対象の絶対パス、`SINCRO_VERIFY_SYNTHESIZER_IMAGE`はローカルにある合成サービスイメージを指定する。
今回使用したイメージは `sincromisor-update/voice-synthesizer:20261018-9f351157`。

```sh
export SINCRO_STREAMING_SOURCE=/path/to/checkout/sincromisor-server
export SINCRO_VERIFY_SYNTHESIZER_IMAGE=sincromisor-update/voice-synthesizer:20261018-9f351157
docker compose --env-file examples/compose.env -f tasks/backend/task-261018204902-streaming-conversation-audio/artifacts/compose.verify.yml --profile full up -d --wait
```

専用S3の `voice-synthesizer`バケットを作成する。認証情報はCompose内の使い捨て検証値だけを使う。
`make-live-request.py /tmp/streaming-live-request.msgpack`を、確認対象の `sincro_models`が読み込まれるPython環境で実行する。
検証用 `synthesizer`コンテナのIPを調べ、Goモジュールのルートで次を実行する。

```sh
SINCRO_STREAMING_VERIFY_ENDPOINT=<container-ip>:8005 \
SINCRO_STREAMING_VERIFY_REQUEST=/tmp/streaming-live-request.msgpack \
go test ./internal/rtc -run '^TestLiveStreamingSynthesis$' -count=1 -v
```

未登録音声の早期再生を確認する試験なので、再実行時はこの専用環境の検証エントリーだけを削除する。
Pythonログの `synthesis_engine_complete.completed_unix_ns`とGoの `first_audio_unix_ns`を比較する。
キャッシュ命中時の再生・破損・取消はPythonとGoの対象試験で別途確認する。

## 作成物と後片付け

専用Composeプロジェクト `streaming-task-261018204902`に6コンテナと1ネットワークを作成した。
Redis・S3・Consulの保存先はtmpfs、ホスト公開ポートなし。新規イメージのビルド・取得はない。
実行前の空き容量は111GiB、Dockerイメージ105.7GB、ビルドキャッシュ146.5GBだった。
検証後はこのComposeだけを `down`し、コンテナとネットワークが残っていないことを確認した。
登録専用コンテナが作った匿名ボリューム1個（参照0・容量0B）も回収し、Composeへtmpfs指定を追加した。
ユーザーの辞書・本体環境・既存イメージは維持した。終了時の空き容量は111GiB、Dockerイメージ105.7GB・ビルドキャッシュ146.5GBで増加はない。
