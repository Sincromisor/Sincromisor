# VOICEVOXを公式Engine 0.26.0とCore 0.17.1へ更新する

## 背景・目的

ローカルのセルフビルド版を最新リリースへ移行できるか確認し、既存の会話用逐次合成を維持して更新する。
2026-10-24に公式GitHub APIで確認した正式版はアプリ0.26.1、Engine 0.26.0、Core 0.17.1である。
Sincromisorが組み込む対象はEngineとCoreであり、アプリは含まない。

## 調査と採用方針

- Engine 0.26.0の固定SHAは `7ebc23342bd812f5a72816330f62f110ccca8bdc`。現行forkとPython依存・Core接続・音素配置は同じである。
- 上流には `/streaming_synthesis` があるが、現行クライアントが使う `max_segment_length` はない。無改修で置き換えると引数が無視され、固定0.3秒の合成へ戻る。
- 公式ソースを固定取得し、既存forkから段階拡大と入力検証の差分だけをローカルパッチとして移す。外部forkへの更新・公開を不要にし、パッチ不適合はビルド時に拒否する。
- Coreを0.17.1へ更新する。ONNX Runtime 1.23.2とVVM 0.17.0の `0.vvm` は維持し、公式リソースをEngineに合わせた0.26.0へ更新する。配布物のSHA-256と非root実行、同梱ライセンスを維持する。
- サービス名、Consul登録、ポート、利用側HTTP引数、WAV、口形、キャッシュ形式は変えない。稼働コンテナは開始時点で0件。ローカルの更新済みイメージを通常起動に使える状態にし、他ホストやGHCRへの反映は対象外とする。

## 完了条件

- [x] 上記の構成を固定ソースとチェックサムからビルドでき、Engine基点と独自差分を識別できる。
- [x] 段階拡大の既存回帰試験と入力拒否を確認する。
- [x] 実Coreで通常・固定長・段階拡大の合成が成功し、48kHzモノラルのWAVサイズと口形時間が一致する。十分な長さの入力では完了前にPCMを受信できる。
- [x] 非root起動、Composeの死活確認、Consul登録・終了時解除、VoiceSynthesizer利用側の接続を確認する。
- [x] 設計・ライセンス情報・ローカル起動選択を同期し、作成物と容量、未実行範囲を記録する。

## 変更範囲と確認方法

`Docker/voicevox/` の取得元・版・パッチとその回帰試験、合成サービス・Compose・公開・ログの設計を更新する。
Engineの対象試験、VoiceSynthesizerの対象pytest、実イメージでのHTTP合成とConsul連携、Compose構文、変更Markdown、タスク整合を確認する。
既存の未追跡 `volumes/proper-noun-dictionaries/` と保存領域は変更しない。

## 参照資料

2026-10-24参照。リリース区分・公開日時は公式APIで照合した。

- [Engine 0.26.0](https://github.com/VOICEVOX/voicevox_engine/releases/tag/0.26.0): ストリーミングAPIと公式ソースの基点。
- [Core 0.17.1](https://github.com/VOICEVOX/voicevox_core/releases/tag/0.17.1): 更新内容と配布物チェックサム。
- [アプリ0.26.1](https://github.com/VOICEVOX/voicevox/releases/tag/0.26.1): Engineとアプリの版の区別。
- [現行導入タスク](../task-261018200818-voicevox-streaming-engine/task.md): 段階拡大の根拠と従来構成。

## 再現手順

リポジトリルートでビルドする。通常のComposeビルドも同じDockerfileとパッチを入力にする。

```sh
docker buildx build --builder default -f Docker/voicevox/Dockerfile -t sincromisor-local/voicevox:task-261024000805 .
```

段階拡大の回帰試験は公式Engineを一時領域へ取得して行う。以下の `voicevox_test`は空のディレクトリを指定する。

```sh
voicevox_test=/tmp/voicevox-026-test
git clone --depth 1 --branch 0.26.0 https://github.com/VOICEVOX/voicevox_engine.git "$voicevox_test"
test "$(git -C "$voicevox_test" rev-parse HEAD)" = 7ebc23342bd812f5a72816330f62f110ccca8bdc
git -C "$voicevox_test" apply "$PWD/Docker/voicevox/streaming-ramp.patch"
cp Docker/voicevox/check_streaming_segments.py "$voicevox_test/test/unit/tts_pipeline/test_streaming_segments.py"
cp Docker/voicevox/check_streaming_ramp.py "$voicevox_test/test/e2e/single_api/tts_pipeline/test_streaming_ramp.py"
LDFLAGS='-Wl,--no-as-needed -lstdc++' uv sync --project "$voicevox_test" --frozen --group dev
(cd "$voicevox_test" && XDG_DATA_HOME="$voicevox_test/data" .venv/bin/python -m pytest -q test/unit/tts_pipeline/test_streaming_segments.py test/e2e/single_api/tts_pipeline/test_streaming_ramp.py test/e2e/single_api/tts_pipeline/test_streaming_synthesis.py)
```

実Coreの確認では既存の隔離Composeを基底にし、今回のイメージと検証スクリプトだけを上書きする。通常環境の設定・保存領域は使わない。

```sh
voicevox_base=tasks/infrastructure/task-261018200818-voicevox-streaming-engine/artifacts/compose.verify.yml
voicevox_upgrade=tasks/infrastructure/task-261024000805-voicevox-026-upgrade/artifacts/compose.verify.yml
docker compose --env-file examples/compose.env -p voicevox-task-261024000805 -f "$voicevox_base" -f "$voicevox_upgrade" --profile full up -d --no-build --pull never --wait sincro-voicevox
docker exec -i voicevox-task-261024000805-sincro-voicevox-1 /opt/voicevox_engine/.venv/bin/python - < tasks/infrastructure/task-261024000805-voicevox-026-upgrade/artifacts/image-check.py
docker compose --env-file examples/compose.env -p voicevox-task-261024000805 -f "$voicevox_base" -f "$voicevox_upgrade" --profile verify run --rm --no-deps --pull never verify
docker compose --env-file examples/compose.env -p voicevox-task-261024000805 -f "$voicevox_base" -f "$voicevox_upgrade" stop sincro-voicevox
docker exec voicevox-task-261024000805-consul-agent-synthesizer-1 consul catalog services
docker compose --env-file examples/compose.env -p voicevox-task-261024000805 -f "$voicevox_base" -f "$voicevox_upgrade" --profile full --profile verify down
```

終了値0とConsulの `SincroVoiceVox`解除を確認してから、専用Composeを終了する。最後の操作で検証用コンテナ・ネットワークとtmpfsの使い捨てConsul状態を片付ける。通常ボリュームは対象外である。

## 実装結果・確認結果

- 公式Engine 0.26.0、Core 0.17.1、公式リソース0.26.0からのビルドに成功した。Core・ONNX Runtime・VVMのSHA-256照合が通った。
- パッチSHA-256は `3dfbff49ffd8451cfe955b30dc64e62f21ac8142321b00a94c2115f000c5aa7a`。イメージの基点ラベル、識別ファイル、マニフェストに対応する情報を保持した。
- Engine 24テスト・2スナップショット、利用側の `test_voicevox_session.py`・`test_streaming_audio.py`・`test_streaming_mora_timing.py`の46テストが成功した。
- [実HTTP結果](artifacts/http-result.json): 通常・固定長・段階拡大とも48kHzモノラルPCM16、354,816サンプル、709,676 bytes。口形総長と一致した。段階拡大の先頭PCMは約0.196秒、全体約2.341秒。固定長は約0.186秒・3.956秒。単発の参考値で性能の合格基準ではない。
- 実際の `VoiceSynthesizer.generate_pcm`でもWAV検証を通り、休止長調整後のPCM 653,312 bytesと口形326,656サンプルが一致した。不正な段階拡大上限はHTTP 400で拒否した。
- [イメージ確認](artifacts/image-result.json): UID 10001、同梱ライセンス36件の本文、Core本体0.17.1、Consul passingを確認した。Compose healthy、停止後の終了値0、Consul登録解除も成功した。
- 公開処理の既存テスト5件が成功した。実公開は行っていない。
- 現行 `.env`と配布サンプルの `full` / `backend`でCompose構文を確認した。変更PythonのRuff検査・整形、設計索引からの導線、変更箇所のコメントを確認した。

## ローカル反映と復旧

Git管理外の `work/voicevox-upgrade-20261024/images.json`を作成し、既存 `.env`の `COMPOSE_FILE`末尾へ追加した。`sincro-voicevox`だけを `sincromisor-local/voicevox:task-261024000805`、`pull_policy: never`に上書きする。既存のファイル選択・プロファイル・他サービスは維持し、解決後のイメージ選択も確認した。
通常サービスは開始時から停止しているため起動せず、次回の通常Compose起動から更新イメージが使われる。
復旧時は `COMPOSE_FILE`末尾の `:work/voicevox-upgrade-20261024/images.json`だけを外すと、従来の `sincromisor-update/sincro-voicevox:20261018-streaming-88a169a6`へ戻る。旧イメージやキャッシュ・辞書は削除していない。

## 作成物と容量

接続先は `default`（ローカル `/var/run/docker.sock`）、ビルダーも `default`（Dockerドライバー、BuildKit v0.33.1）、Docker保存先は `/var/lib/docker`。既存VOICEVOX約1.51GBと空き127GBから今回の単一ビルドに余裕があると判断した。
開始時はイメージ107.6GB、キャッシュ128GB（private 64.77GB）、コンテナ0、ボリューム268件・1.244GB。
完了時はイメージ109GB、キャッシュ130.9GB（private 66.29GB）、空き123GB。キャッシュ増加は合計約2.9GB、private約1.52GB。

作成イメージは `sincromisor-local/voicevox:task-261024000805`、ID `sha256:da267af6ed556e977dae4ededf29f91e0781114596c4e79840c5c1bab4f51282`、1,509,178,910 bytes。
ローカルの通常起動用として保持し、次回のVOICEVOX更新で置換し復旧にも不要になった時点で参照を確認して削除する。作業前のタグは上書きしていない。
検証用の補助イメージは既存のConsulとVoiceSynthesizerを再利用し、専用Composeのコンテナ・ネットワークは削除済み。終了時のコンテナ0、タグなしイメージ0、ボリューム件数・容量も開始時と同じだった。
共有ビルドキャッシュは既存のGC（最大375.3GiB、最低空き94.06GiB、未使用60日等）に従って再利用・回収する。共有キャッシュや既存の復旧用イメージは削除していない。

未実行範囲と検証時の判断は [実装記録](impl.md) を参照する。
