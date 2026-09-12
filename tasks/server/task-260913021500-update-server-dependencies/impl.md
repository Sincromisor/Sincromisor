# 依存更新の判断と確認結果

## 調査範囲

2026-09-13に稼働対象の直接依存を [PyPI公式メタデータ](https://pypi.org/) と `go list -m -u all` で照合した。表の更新前・採用版は宣言下限ではなくロックの実解決版を示す。Pythonの表は採用版が調査時点の最新安定版で、変更のない行も確認済み。ビルド依存Hatchlingは無制約のまま最新1.32.0を利用可能。

## Pythonの直接依存

| ライブラリ                                                               | 更新前          | 採用版          |
| ------------------------------------------------------------------------ | --------------- | --------------- |
| [aiohttp](https://pypi.org/project/aiohttp/)                             | 3.14.3          | 3.14.3          |
| [boto3](https://pypi.org/project/boto3/)                                 | 1.42.44         | 1.43.93         |
| [fastapi](https://pypi.org/project/fastapi/)                             | 0.139.0         | 0.141.1         |
| [httpx2](https://pypi.org/project/httpx2/)                               | 2.5.0           | 2.12.0          |
| [mediapipe](https://pypi.org/project/mediapipe/)                         | 0.10.32         | 1.0.1           |
| [msgpack](https://pypi.org/project/msgpack/)                             | 1.2.1           | 1.2.2           |
| [nemo-toolkit](https://pypi.org/project/nemo-toolkit/)                   | 3.0.0           | 3.0.0           |
| [numpy](https://pypi.org/project/numpy/)                                 | 2.5.3           | 2.5.3           |
| [onnx](https://pypi.org/project/onnx/)                                   | 1.22.0          | 1.22.0          |
| [py-consul](https://pypi.org/project/py-consul/)                         | 1.7.1           | 1.7.1           |
| [pydantic](https://pypi.org/project/pydantic/)                           | 2.12.5          | 2.13.5          |
| [pytest](https://pypi.org/project/pytest/)                               | 9.1.1           | 9.1.1           |
| [python-dotenv](https://pypi.org/project/python-dotenv/)                 | 1.2.2           | 1.2.3           |
| [python-ulid](https://pypi.org/project/python-ulid/)                     | 3.1.0           | 4.0.1           |
| [pyyaml](https://pypi.org/project/pyyaml/)                               | 6.0.3           | 6.0.3           |
| [reazonspeech-nemo-asr](https://pypi.org/project/reazonspeech-nemo-asr/) | 3.0.0           | 3.0.0           |
| [redis](https://pypi.org/project/redis/)                                 | 7.1.0           | 8.1.0           |
| [requests](https://pypi.org/project/requests/)                           | 2.33.1          | 2.34.2          |
| [ruff](https://pypi.org/project/ruff/)                                   | 0.16.0          | 0.16.7          |
| [setproctitle](https://pypi.org/project/setproctitle/)                   | 1.3.7           | 1.3.7           |
| [setuptools](https://pypi.org/project/setuptools/)                       | 84.0.0          | 84.0.0          |
| [sudachidict-full](https://pypi.org/project/sudachidict-full/)           | 20260116        | 20260723        |
| [sudachipy](https://pypi.org/project/sudachipy/)                         | 0.6.11          | 0.6.11          |
| [ty](https://pypi.org/project/ty/)                                       | 0.0.37          | 0.0.80          |
| [types-psutil](https://pypi.org/project/types-psutil/)                   | 7.2.2.20260130  | 7.2.2.20260906  |
| [types-pyyaml](https://pypi.org/project/types-pyyaml/)                   | 6.0.12.20250915 | 6.0.12.20260906 |
| [types-requests](https://pypi.org/project/types-requests/)               | 2.32.4.20260107 | 2.33.0.20260906 |
| [uvicorn](https://pypi.org/project/uvicorn/)                             | 0.40.0          | 0.52.4          |
| [websockets](https://pypi.org/project/websockets/)                       | 16.0            | 17.1            |

ReazonSpeechはGitの `5a120830` から `2d4d4762` へ更新。NeMo 3.0.0は最新のまま、推移依存のTransformers 4.53.3→5.17.0、librosa 0.11.0→1.0.0、Torch 2.13.0→2.14.0、datasets 4.5.0→5.0.1、pandas 2.3.3→3.0.5、protobuf 5.29.6→7.36.1なども解決した。

[MediaPipeの変更履歴](https://github.com/google-ai-edge/mediapipe/releases)、[redis-pyの変更履歴](https://github.com/redis/redis-py/releases)、[python-ulidの変更履歴](https://github.com/mdomke/python-ulid/releases)、[websocketsの変更履歴](https://websockets.readthedocs.io/en/stable/project/changelog.html)を確認した。AudioClassifier、ULID生成、Redisのバイナリ保存を実行し、既存の利用方法を維持できることを確認した。

## Goの直接依存

| ライブラリ                            | 更新前  | 採用版  |
| ------------------------------------- | ------- | ------- |
| `github.com/coder/websocket`          | v1.8.15 | v1.8.15 |
| `github.com/google/uuid`              | v1.6.0  | v1.6.0  |
| `github.com/oklog/ulid/v2`            | v2.1.1  | v2.1.2  |
| `github.com/pion/interceptor`         | v0.1.45 | v0.1.48 |
| `github.com/pion/mediadevices`        | v0.10.0 | v0.10.0 |
| `github.com/pion/opus`                | v0.1.0  | v0.1.0  |
| `github.com/pion/rtcp`                | v1.2.17 | v1.2.17 |
| `github.com/pion/rtp`                 | v1.10.4 | v1.10.5 |
| `github.com/pion/webrtc/v4`           | v4.2.17 | v4.2.20 |
| `github.com/prometheus/client_golang` | v1.23.2 | v1.24.1 |
| `github.com/vmihailenco/msgpack/v5`   | v5.4.1  | v5.4.1  |

[Pionの変更履歴](https://github.com/pion/webrtc/releases)も確認し、全11直接依存について次のメジャーのモジュールパスもGo公式プロキシで照会した。RTP v2.0.0は2021年の既存タグとして見つかったが、最新版WebRTC v4.2.20の依存と `TrackRemote.ReadRTP()` の戻り値はRTP v1の `*rtp.Packet` であり、サービスの `RTPReader` 契約にも渡すため、RTPはv1.10.5を採用する。その他10依存の次メジャーは公開版なし（404）。推移依存のSTUNはv3からv4へ移行した。Pion、Prometheus、golang.org/x群などの互換更新を適用した。

## 保留と既存問題

- 旧 `speech-recognizer` はComposeが受け付けないNue実装で、Python 3.12とNumPy 1.26.4、Transformers 4.51.3に固定され、現行共通パッケージのPython 3.14と不整合。再稼働は今回の更新範囲に含めない。専用依存のaccelerate 1.15.0、deepspeed 0.19.6も確認したが旧環境の宣言を変更しない。Torch、librosa、sentencepiece、Transformersの最新は稼働NeMo側で採用した。
- `aistore 1.26.0` は [PyPIの依存宣言](https://pypi.org/pypi/aistore/1.26.0/json)で `xxhash==3.5.0` を要求する。無指定の全更新はaistoreを1.25.0へ下げてxxhash4.0.1を選ぶため、`uv lock --upgrade-package aistore==1.26.0` でaistore最新版を優先し、xxhash4を保留した。永続的な独自制約は追加しない。
- `uv pip check` は変更前から存在する `nv-one-logger-pytorch-lightning-integration 2.3.1` のPython要件 `<3.14` と現行Python 3.14.7の不一致を報告する。[PyPI最新版](https://pypi.org/project/nv-one-logger-pytorch-lightning-integration/)も2.3.1。NeMoと当該ライブラリは更新前後で同一版で、モデル読込とGPU推論は成功した。上流メタデータの不整合を隠す上書きは追加しない。
- Goの `TestRealManagerRejectsMalformedNonNullCandidate` はICE候補収集が2秒でタイムアウトする。変更前HEADのgo.mod/go.sumを `/tmp/sincro-deps-before.mod` / `.sum` に取り出し、`go test -modfile=/tmp/sincro-deps-before.mod -run 'TestRealManager(AcceptsLegacyInitialOffer|RejectsMalformedNonNullCandidate)$' -count=2 ./internal/signaling` でも同一失敗を再現した。更新後の `go test -p 1 ./...` はこの1件以外が通る。初回並列実行ではほか2件も候補収集で時間切れとなったが逐次実行で通った。既存の実環境依存として、時間制限やテストを変更しない。
- Ruffは変更ファイルの既存モジュール名N999、未変更の例外処理RUF010 / TRY201を報告する。後者2件はHEADから抽出した旧ソースでも同じ新Ruffで再現し、前者のファイル名も変更していない。変更箇所の整形・型検査は通る。

## 実行結果

- `uv lock --check`、`uv sync --locked --group dev --group full`: 成功。
- `.venv/bin/python -m pytest sincromisor-server -q`: 28件成功。ローカルHTTPソケットが必要なため権限付きで実行。
- `.venv/bin/ty check .`: 成功。更新したtyが検出した `SpeechExtractorWorker.classifier` 代入時の重複型注釈だけを削除した。クラス本体の型注釈を維持し、モデル初期化のコメントを点検した。
- Ruff整形確認: 変更Pythonファイルが成功。静的検査の既存指摘は上記のとおり。
- MediaPipe: `sincromisor-server/` を作業ディレクトリに `SpeechExtractorWorker.setup_model()` を実行し、既存YAMNetへ16kHz・float32・1秒の無音を `AudioData.create_from_array` で渡して分類結果が空でないことを確認、classifierをcloseした。
- FastAPI / uvicorn / websockets: ローカルuvicornの既定自動実装へwebsockets17のクライアントから接続し、バイナリの往復一致と正常終了を確認。
- python-ulid: `ChatMessage` を生成し、`message_id` が26文字であることを確認。
- Redis: ローカル既存Redis8イメージの永続化なし一時コンテナを使用。hiredis有効の既定 `Redis` でゼロ・非UTF-8を含むbytesのset/get一致とTTLを確認。コンテナは停止・削除済み。
- NeMo: `HF_HOME=volumes/sincro-cache/huggingface`、`HF_HUB_OFFLINE=1` で既存モデルを読み込み、RTX 5060 Ti上で本番 `SpeechRecognizerNemo.transcribe()` に1秒無音を渡して結果を取得。外部モデル取得なし。
- `go vet ./...`、`go mod verify`: 成功。Goテストの既存失敗は上記のとおり。

本番Composeの再構築・再起動、ブラウザーからの全会話、実発話の認識精度比較は未実行。通信契約・保存形式・設定値は変更していないため設計文書の同期は不要。
