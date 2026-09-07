# 共通初期化をNeMoモデル準備へ整理する

## 背景 / 目的

ユーザーはNue-ASR時代の共通初期化の整理を求めている。
`initialize.sh` は設定ファイルの権限変更、キャッシュ全体の所有者変更、後続で使わない `mc alias set`、
NeMoモデルの取得を行う。フロントとテキスト処理まで完了を待つ。
`frontend` のみでは `service-initializer` の依存先S3が対象外になり構成検査が失敗する。

## 完了条件

- [x] 認識コンテナの起動時、モデルキャッシュがない場合だけ自動取得する。準備済みなら通信せず既存キャッシュを読み、毎回の再ダウンロードと再帰的な権限変更を行わない。
- [x] フロントとテキスト処理からモデル準備・S3への不要な依存を外し、frontend構成の検査が成立する。
- [x] 初回取得に失敗した場合は原因を明示して起動失敗とし、途中取得を準備完了と誤認しない。既存の正常なモデルを削除・上書きしない。
- [x] 既存モデルキャッシュを削除せず再利用し、実際のNeMo読み込み経路が通常起動時に取得を要求しないことを確認する。
- [x] Dockerfile・Compose・サンプル設定・README・設計と配布対象を同期する。

## 設計判断 / 変更範囲

統合変更。NeMoの既存のキャッシュ優先読み込みと欠損時の自動取得を再利用し、手動の事前準備を必須にしない。独自の汎用初期化機構は作らない。
`Docker/service-initializer/`、`compose/initializer.yml`、依存するCompose、NeMoのモデル読み込みを対象にする。
モデルキャッシュは現在の `volumes/sincro-cache` とUID 1001を起点とし、取得先と読み込み先を揃える。
`configs/config.yml` の権限変更と `mc` が現行利用経路で不要なことを確認して削除する。認証情報のシェルトレースも残さない。
Consulは複数ホスト構成を維持し、S3データの移行・削除、SeaweedFS集約は行わない。
S3利用側の準備完了条件を追跡し、既存のバケット・認証初期化の競合をモデル準備から独立させる。

## 確認方法 / 文書同期

一時キャッシュで初回起動時の自動取得、準備済みでの再起動・コンテナ再作成、必要ファイル欠損と取得失敗を確認する。
取得後の同一モデルが再利用され、2回目以降の起動では取得処理が呼ばれないことを確認する。
モデルが揃った実環境ではHugging Faceへの取得通信を無効にして認識サービスが起動することを確認する。
full/frontend/backendの構成検査と、変更した初期化処理の失敗経路を確認する。
`README.md`、`documents/design/infrastructure/compose.md`、`storage.md`、
`image-publishing.md` と `scripts/publish-images.mjs` の対象自動抽出・検証を同期する。

## キャッシュ動作の調査結果

2026-09-07の追加確認とユーザー要求により、初回自動取得を維持し、毎回の再ダウンロードを防ぐ条件へ修正した。
認識サービスは `load_model()` からNeMoの `from_pretrained()` を呼ぶ。
稼働イメージのNeMoは `refresh_cache=False` を既定とし、`try_to_load_from_cache()` で
`reazonspeech-nemo-v2.nemo` が見つかれば取得APIを呼ばずに返す。見つからない場合だけ取得処理へ進む。
モデルの配置先は `/opt/sincromisor/.cache/huggingface/hub/` であり、
Composeはその親ディレクトリをホストの `volumes/sincro-cache` に永続化している。
キャッシュ内のモデルへのリンクの存在を確認した。今回モデル取得や認識サービスの再起動は実行していない。

一方、現在のinitializerは実行されるたび `hf download` を呼ぶ。コマンド実行とモデル本体の再取得は同義ではないが、
整理後は準備済み起動でこの呼び出し自体をなくす。
依存更新後の配布イメージでも同じキャッシュ優先動作を検証し、暗黙の強制取得やキャッシュ削除を導入しない。

## 実装と確認記録（2026-09-07）

統合変更として現在のワークツリーで実装した。共通initializerとその参照を削除し、
認識サービスの既存 `load_model()` → `from_pretrained()` をそのまま使う。
キャッシュ保存先は初回のみUID 1001で作成し、Composeの `create_host_path: false` で
未準備の保存先をroot所有で作らせない。モデルの手動取得は不要である。
認識と音声合成はモデル準備と独立して `s3-bootstrap` の正常終了を待つ。
ローカルの既存 `s3-bootstrap` は終了コード0だった。
旧 `mc alias set` はinitializer内だけの設定であり、バケット・認証準備に使われていない。
`configs/config.yml` は旧initializerだけがマウントし、現行サービスからの読み込み経路がないことを確認した。

確認コマンド:

```sh
node --test scripts/tests/nemo-compose.test.mjs scripts/tests/publish-images.test.mjs
ruff check tasks/infrastructure/task-260907221335-nemo-model-preparation/artifacts/check_model_cache.py
ruff format --check tasks/infrastructure/task-260907221335-nemo-model-preparation/artifacts/check_model_cache.py
```

構成の回帰検証は `full` / `frontend` / `backend` の依存とキャッシュ設定を確認する。
公開スクリプトはComposeの `build` を自動抽出するためコード変更は不要で、initializerは対象から外れる。
README、Dockerfile、Compose、設定例、保存領域・Compose・公開文書を同期し、設計索引の既存導線を確認した。

NeMoの実関数の検証は、イメージ内で
`/opt/sincromisor/.venv/bin/python /checks/check_model_cache.py` を実行する。
`artifacts/` を `/checks` へ読み取り専用でマウントし、`--network none` を指定する。
実際のHugging Faceキャッシュ探索と取得APIの模擬を組み合わせ、初回、再利用、必要ファイル欠損、
途中ファイル、取得失敗、正常キャッシュの保持を確認する。
稼働イメージと現行ロックの新イメージの双方で `MODEL_CACHE_BRANCHES_PASS` を確認した。

稼働イメージのロックと現行ロックが異なるため、コミット `7567b659` の一時展開に
変更したDockerfile（実行命令の差はなく説明コメントのみ）を重ねて検証用イメージをビルドした。
未追跡ファイル、運用中の設定、キャッシュはビルドへ含めていない。
`docker buildx build --load --platform linux/amd64 -f Docker/speech-recognizer-nemo/Dockerfile -t sincromisor-nemo-check:task-260907221335 .` はPASS。
検証イメージのIDは `sha256:87f959a2d4f12b4063d17ac92a5e6f96d30cd804d790c4b7b6f3de9cf72ce3bc`。

空の一時キャッシュへ `load_model(device="cpu")` で実モデルを自動取得し、
`INITIAL_MODEL_LOAD_PASS EncDecRNNTBPEModel` を確認した。
既存キャッシュの読み取り専用マウントと `--network none` による実モデル読み込みもPASS。
これはGPU推論品質の評価ではなく、モデル取得・再利用と起動の確認である。

認識サービスの再現確認では、専用Consulを `--network none` で起動し、認識コンテナを
`--network container:<専用Consul>` で同じ通信遮断空間へ置く。Consulへの接続先と認識の広告先は
`127.0.0.1`、Consulのポートは8500とし、ホストへのポート公開は行わない。
`HF_HUB_OFFLINE=1`、`HF_DATASETS_OFFLINE=1` と既存キャッシュの読み取り専用マウントを使う。
`MPLCONFIGDIR=/tmp/matplotlib`、`UV_CACHE_DIR=/tmp/uv` は検証時だけ指定する。
uvは `--no-sync` でも一時ロックを書き込むため、全キャッシュを読み取り専用にした最初の確認は
終了コード2になった。一時領域を分けた再確認で解消し、実運用の読み書き可能なマウントは変更していない。

モデルなし・通信不可の実認識プロセスは、終了コード1と
`huggingface_hub.errors.OfflineModeIsEnabled` を返し、取得先のモデル名を含む原因を表示した。
モデル読み込みに失敗した状態を準備完了とは扱わなかった。

未実施事項と範囲:

- GPUでの音声推論・会話確認は今回のモデル準備検証の対象外で、月次反映タスクで稼働反映後に主要経路を確認する。
- GHCR公開と稼働ホストの再作成は月次反映タスクへ残す。検証用イメージのビルド成功を配布・稼働反映成功とは扱わない。
- S3の待機は既存 `s3-bootstrap` の終了コードを用いる。既存スクリプトにはバケット一覧・作成の一部エラーを継続する箇所があり、終了コード0だけで全S3操作を保証するものではない。今回の変更はモデル準備との依存分離と実行順序に限定し、認証更新・保存領域の変更は行っていない。

最終確認: 通信遮断・既存モデル読み取り専用の認識コンテナは、起動、再起動、再作成の各回で
`GET /api/v1/SpeechRecognizer/statuses` がHTTP 200と
`{"worker_type":"SpeechRecognizer","sessions":0}` を返した。
実コンテナの `Config.Cmd` は `uv run --no-sync speech-recognizer-nemo/SpeechRecognizerNemoProcess.py`。
モデルを変更できない条件でも起動でき、取得APIを呼ばないことは実依存の分岐検証でも確認した。
文書点検・コメント点検はPASS。検証専用のコンテナと一時キャッシュは終了後に削除する。
