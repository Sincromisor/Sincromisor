# VOICEVOXコンテナをストリーミング対応の独自ビルドへ置き換える

## 背景 / 目的

現行の `sincro-voicevox` はVOICEVOX ENGINE 0.25.2のCPU/x64配布物を展開して起動している。この配布物には `/streaming_synthesis` がない。
ユーザーは、別環境で検証した段階的な区間拡大に対応するEngineへ、SincromisorのVOICEVOXコンテナを置き換えることを求めている。

本タスクは独自ビルドの導入を行い、既存の通常合成経路を保ったままストリーミングAPIを利用可能にする。
現在のVoiceSynthesizerは `/synthesis` のWAV全体を受け取ってから形式変換・保存・返却を行うため、コンテナの置換だけで会話音声の再生開始が早くなるとは扱わない。

## 起票前に完了した準備

- [Sincromisor/voicevox_engine](https://github.com/Sincromisor/voicevox_engine) を `VOICEVOX/voicevox_engine` の公開forkとして作成した。
- 独自改修と検証用ビルド設定は、`sincromisor/streaming-synthesis` ブランチの [563a6889263a3b8caa6852497a2f83fa25d88801](https://github.com/Sincromisor/voicevox_engine/commit/563a6889263a3b8caa6852497a2f83fa25d88801) に保存した。上流基点は `14a699f8abd5fe9f9f34e28f3deb4a3c2021503b`。
- Engineは任意の `max_segment_length` を追加し、`segment_length=0.3&max_segment_length=2.4` で区間を0.3→0.6→1.2→2.4秒と拡大する。省略時は従来の固定長とし、WAVの形式とサンプル数を維持する。
- CPU・4スレッド、Core 0.17.0、VOICEVOX ONNX Runtime 1.23.2、VVM 0.17.0の `0.vvm` で検証済み。対象44テスト・13スナップショットが成功した。
- 約10.83秒の音声では、固定0.3秒の先頭受信0.195秒・完了4.98秒に対し、段階拡大は0.194秒・2.91秒だった。各3回の中央値であり、性能の合格値ではない。
- 長文では最大約0.54秒、2件同時要求では最大約0.17秒、再生開始を追加で遅らせる必要がある到着列も観測した。固定の拡大率だけで連続再生を保証できない。
- 「こんにちは。今日は、2026年 10月18日です。」の生成WAVはユーザーが問題なく生成されたことを確認した。音声ファイルは公開成果物に含めない。

測定条件と集計は [検証概要](artifacts/streaming-validation.json) に保存する。再測定はfork内の `tools/verify_ramped_streaming.py` を使う。
外部ソースの参照日は2026-10-18とし、上記コミットの実装・ビルド設定・検証コードを導入の基準とする。

## 完了条件（受け入れ条件）

- [x] `sincro-voicevox` をforkの固定コミットからビルドでき、別途配置した `~/projects/voicevox_engine` や未追跡ファイルを必要としない。
- [x] Core・推論ランタイム・モデル・リソースの取得版を固定し、実際のEngineコミットを追跡できる。検証用Dockerfileの上流基点を示すラベルや `/version` の `latest` 表示だけを独自版の識別に使わない。
- [x] 既存のサービス名 `sincro-voicevox`、Consul登録名 `SincroVoiceVox`、内部ポート50021、`full` / `backend` プロファイルを保ち、ComposeとConsulの死活確認が成功する。ホスト向けポートを追加しない。
- [x] 既存設定の話者・スタイルIDで `/audio_query` と `/synthesis` が成功し、キャッシュ未登録の入力を既存VoiceSynthesizer経路から合成・変換・返却できる。返却形式と口形用モーラ列の契約を変更しない。
- [x] `/streaming_synthesis` の固定長と段階拡大の両方が利用でき、十分な長さの入力では全体完了前に最初のPCMを受信できる。受信完了時のWAVと `Content-Length` が一致する。
- [x] 通常の終了操作でEngineと起動スクリプトが終了し、Consul登録を解除できる。起動コマンドの変更によって子プロセスを残さない。
- [x] Composeのローカルビルドと既存イメージ公開処理の入力形式を維持し、対象の設計文書・再現手順・確認結果を同期する。

## 設計判断

- Engineソースと独自差分はforkで管理する。`master` は上流追従用、`sincromisor/streaming-synthesis` は独自改修用とし、Sincromisorからは動くブランチ名ではなく完全なコミットSHAを参照する。追加修正が必要な場合はforkへコミットした後に参照SHAを更新する。
- 製品用ビルドの入口は既存の `Docker/voicevox/Dockerfile` とする。その中でforkの固定ソースを取得してビルドし、ComposeのコンテキストはSincromisorリポジトリ内に保つ。forkの `Dockerfile.streaming` は検証済みの組立て手順として参照する。
- 既存公開処理はGitコミットの展開先内にあるコンテキスト・Dockerfileを要求し、`context` / `dockerfile` / `args` を受け付ける。外部ディレクトリの参照、リモートComposeコンテキスト、サブモジュールの導入や公開処理の汎用化は不要とする。
- 対象は既存と同じ `linux/amd64`・CPUとする。検証済みのCore・ランタイム・VVM構成を基準とし、初期値のスタイルID `0` と実行環境で設定しているIDを確認する。`0.vvm` だけで必要なIDを提供できなければ、必要なモデルを同じ固定版から追加する。
- `SINCRO_VOICEVOX_HOST` / `SINCRO_VOICEVOX_PORT`、Consul接続先の供給元は既存の `.env` → Compose → 起動スクリプトとする。設定を新設・変更する場合だけ `examples/compose.env` と関係する利用側・設計を同期する。
- イメージ名と `pull_policy: build` は既存運用を維持する。Sincromisor公開元コミットのOCIラベルと、取得したEngineコミットの情報を区別する。

## スコープ境界

対象はVOICEVOXのビルド・起動・Consul登録・死活確認・既存利用側との結合確認である。起票時点ではSincromisorの稼働コンテナや設定を変更していない。

VoiceSynthesizerの逐次受信、再生バッファ、Redis/S3キャッシュ形式、WebSocket / MessagePack / WebRTC契約、フロントエンド再生は変更しない。
GPU対応、Core内部の推論改修、全イメージのGHCR公開、別ホストへの一斉反映、上流へのPRも対象外とする。

## 実装方針

1. [Compose管理ルール](../../../documents/rules/docker-compose.md) に従い、接続先・対象サービス・ビルダー・空き容量・既存イメージを確認する。実装時に共有環境を切り替える場合は、更新前のイメージIDと起動設定、復旧方法を先に保存する。
2. `Docker/voicevox/Dockerfile` の配布物展開を固定ソースのビルドへ置き換える。forkのビルド設定から、Python・uvの固定、ロックファイル、Core等の取得とチェックサム、辞書の事前取得、`libstdc++` の明示リンク、非rootで読める配置を引き継ぐ。ライセンス・モデルの利用規約等の同梱情報を失わない。
3. `Docker/voicevox/start-voicevox.sh` を新しい実行ファイルと配置へ合わせる。検証版は `/opt/voicevox/run` ではなく `/opt/voicevox_engine/.venv/bin/python run.py` を使い、Core・ランタイム・モデルのパスを渡す。Consulバイナリー・`service-register.sh` と、非rootユーザーが使うテンプレート配置・書込み先も整合させる。
4. `compose/voice-synthesizer.yml` の対象サービスだけを調整する。検証用イメージにはcurlがないため、死活確認は実際に同梱するコマンドでHTTP成功を判定する。`voice-synthesizer` の起動依存、内部ネットワーク、Consul登録を維持する。
5. 実モデルの合成と既存VoiceSynthesizerからの返却を確認し、結果をタスクへ記録する。既存キャッシュの削除で生成確認を代替せず、未登録の入力または確認用に隔離したキャッシュを使う。
6. 失敗時は診断情報を保存して対象サービスを旧構成へ復旧する。検証で作成したイメージ・コンテナ・キャッシュを追跡し、残す対象は理由と削除条件を記録する。旧検証環境は接続検証完了または中止時に保持の要否を整理する。

## テスト

- 対象Compose設定の `config --quiet`、対象イメージのビルド、起動、Compose / Consulの死活確認、終了・登録解除を確認する。無関係なサービスを再ビルド・再作成しない。
- forkの `tools/verify_streaming.py` と `tools/verify_ramped_streaming.py` を参考にした対象HTTP検証で、通常合成、固定区間、段階拡大のWAV完全性と先頭PCMの逐次受信を確認する。基準の実測値を再現することや、測定スクリプトの全負荷条件を再実行することは合格条件にしない。
- 既存VoiceSynthesizerのキャッシュ未登録入力が、実Engineへの要求、WAV変換、`VoiceSynthesizerResult` の返却まで成功することを一度確認する。
- 公開処理の入力がローカルコンテキスト・Dockerfile・引数の対応範囲に収まることを確認する。`node --test scripts/tests/publish-images.test.mjs` を実行し、変更後のComposeを対象に `scripts/image-publish-targets.mjs` の `targets` で `sincro-voicevox` が列挙されることを確認する。`plan` は現在のGitコミットを展開するため、未コミット変更の確認と混同しない。
- 文書は変更したMarkdownのPrettier確認、タスクは `tasks:check` と `tasks:index:check` を実行する。

## ドキュメント同期の要否

- [VoiceSynthesizer設計](../../../documents/design/backend/services/voice-synthesizer.md) の合成エンジン・取得版・参照コミット・ストリーミングAPIの提供範囲を更新する。既存利用側が通常合成を続けることを明記する。
- [Compose設計](../../../documents/design/infrastructure/compose.md)、[Consul設計](../../../documents/design/infrastructure/consul.md)、[イメージ公開設計](../../../documents/design/infrastructure/image-publishing.md) は、実際に配置・起動・ビルド条件を変更した箇所を同期する。
- Engineの追加クエリはforkのOpenAPIに反映済み。本タスクではSincromisorの外部通信契約を変えないため、WebRTC / MessagePack契約の改訂は行わない。

## 再現手順

リポジトリルートで実行する。通常のビルド・起動入口は `docker compose build sincro-voicevox` と
`docker compose up -d --no-deps --no-build --pull never sincro-voicevox` である。後者はConsulが稼働済みの場合に使う。

既存環境を切り替えずに確認する場合は、同梱の検証Composeを使う。製品のVOICEVOX定義を `extends` で読み、
Consulは専用の開発モード、Redis/S3は専用ネットワーク内のメモリー領域に分離する。ホストのポートは公開しない。
検証用のS3認証値は使い捨てであり、実環境の設定は取り込まない。

```sh
voicevox_verify=tasks/infrastructure/task-261018200818-voicevox-streaming-engine/artifacts/compose.verify.yml
docker compose --env-file examples/compose.env -f "$voicevox_verify" --profile full config --quiet
docker compose build sincro-voicevox
docker compose --env-file examples/compose.env -f "$voicevox_verify" --profile full up -d --no-build --wait sincro-voicevox redis s3
docker compose --env-file examples/compose.env -f "$voicevox_verify" exec -T sincro-voicevox /opt/voicevox_engine/.venv/bin/python - < tasks/infrastructure/task-261018200818-voicevox-streaming-engine/artifacts/http-check.py
SINCRO_VERIFY_SYNTHESIZER_IMAGE=ghcr.io/sincromisor/voice-synthesizer:latest docker compose --env-file examples/compose.env -f "$voicevox_verify" --profile verify run --rm --no-deps verify
docker compose --env-file examples/compose.env -f "$voicevox_verify" stop sincro-voicevox
docker compose --env-file examples/compose.env -f "$voicevox_verify" exec -T consul-agent-synthesizer consul catalog services
```

利用側確認には既にビルド済みのVoiceSynthesizerイメージを指定する。`verify`は現在の利用側ソースを読取専用でマウントし、
キャッシュ未登録入力、実合成、Opus変換、MessagePack往復、Redis/S3保存を確認する。音声ファイルは保存しない。
停止後のConsul一覧には `SincroVoiceVox`がないこと、Engineコンテナの終了値が0であることを確認する。
検証終了時の `docker compose --env-file examples/compose.env -f "$voicevox_verify" --profile full --profile verify down`
で専用コンテナとネットワークを片付ける。tmpfsの検証キャッシュは失われる。通常環境の保存領域は対象にしない。

公開入力は `scripts/image-publish-targets.mjs`の `targets()`へ作業ディレクトリとCLI実行関数を渡し、
`sincro-voicevox`がローカルコンテキストと `Docker/voicevox/Dockerfile`で列挙されることを確認する。
`node --test scripts/tests/publish-images.test.mjs`も実行する。GHCRへの送信はこのタスクの確認には含めない。

## 実装結果・確認結果

2026-10-18、現在ワークツリーで実装し、独立レビュー・終了処理評価を実施した。
Sincromisor本体は開始時から停止していたため、本番切替や他ホスト反映は行わず、専用Composeで結合確認した。

- Engine固定コミットからのComposeビルドが成功した。ローカルの別リポジトリや未追跡ファイルをビルド入力に使っていない。
- Python 3.14.6、uv 0.13.1、forkのロック、Core 0.17.0、VOICEVOX ONNX Runtime 1.23.2、VVM 0.17.0の `0.vvm`、リソース0.25.2の固定コミットを採用した。Core・ランタイム・VVMのSHA-256照合が成功した。
- `ENGINE_REVISION`、Engine専用ラベル、`/engine_manifest`に独自SHAを保持した。`/version`の `latest`は識別に使わない。
- 非rootで起動し、EngineのLICENSE/LGPL、モデルのpolicy、Core・ランタイムの同梱文書を保持した。実際のPython依存30件と追加の同梱情報6件からライセンス一覧を生成し、全件本文あり・ダミーなしを確認した。
- 現行 `.env`、配布サンプルの `full` / `backend`、検証Composeの `config --quiet`が成功した。サービス名・ポート・プロファイル・ホスト非公開を維持し、Compose healthyとConsul passingを確認した。
- 実設定と初期値はともにスタイルID `0`であり、`0.vvm`で提供できた。提供IDは `0, 1, 2, 3, 4, 5, 6, 7, 8, 10`。通常合成、固定0.3秒、0.3→2.4秒の段階拡大を確認した。
- [HTTP実測](artifacts/http-result.json): 3経路とも414,764 bytes、207,360 frames、24kHz・mono・PCM16で、WAV完全性とContent-Lengthが一致した。固定長は先頭PCM 0.172秒・全体3.951秒、段階拡大は0.165秒・2.447秒であった。性能の合格値としては使わない。
- [利用側結果](artifacts/integration-result.json): 専用Redis/S3で未登録を確認して既存VoiceCacheManagerを呼び、実Engine合成、Opus変換、MessagePack往復、モーラ列の保持、Redis/S3保存が成功した。利用側イメージは既存の `sincromisor-update/voice-synthesizer:20261018-9f351157`を利用し、現在のVoiceSynthesizerソースを読取専用マウントした。
- 通常停止は10秒の猶予内で終了コード0となり、Engine終了ログとConsul解除を確認した。[終了処理試験](artifacts/lifecycle-check.py)ではTERM、INT、Engine異常終了、登録失敗、登録応答待ち中の停止、自然タイムアウトを確認した。各終了値、解除、子プロセス残存なしを照合する。
- `node --test scripts/tests/publish-images.test.mjs`は5件成功した。現在Composeの `targets()`に `sincro-voicevox`がローカルcontext/Dockerfileで列挙された。最初のサンドボックス下の子プロセス制限は、同じ読取試験を権限付きで再実行して解消した。
- タスク状態を `done / PASS`へ更新し、`tasks:check`と `tasks:index:check`が成功した。
- Bash構文、追加PythonのRuff、ライセンス生成と終了試験の型確認、変更MarkdownのPrettier、設計索引からの導線、コメントを点検した。公開通信契約とフロントコードに変更はない。

確認中に判明した不具合は同じタスク内で修正した。依存ライセンスのダミーを実配布物から生成する処理へ置き換え、
Pythonの本文配置を実イメージに合わせた。Consul応答待ち中の終了停滞には3秒＋強制終了猶予1秒の制限を付けて、
異常系を再確認した。検証スクリプトではMinIO起動コマンド、読取専用ソースの権限、バケット再実行時の扱いを修正した。

### 作成物と後片付け

接続先はDocker `default`のローカルUnixソケット、ビルダーも `default`（docker driver）。
開始時はイメージ105.4GB、ビルドキャッシュ142.3GB（private 82.69GB）、Docker保存先の空き116GBだった。
既存のCPU検証イメージは約1.25GBで、新ビルドの取得・展開を含めて空き容量内に収まると判断した。

最終イメージ `ghcr.io/sincromisor/voicevox:latest`、
`sha256:33f0ddca6222a26c5ee45615c2cfa6672b332346494c282e004b92f55b68729b`（約1.51GB）は通常開発用として保持する。
次回のVOICEVOX更新時に置き換え、参照がなくなった版は削除する。GHCRには送信していない。

中間のマニフェストIDは `8e77e6db5b73`、`bcd9f882f54b`、`935b7febe794`、`32869ae3cef4`で、
同一タグの更新後に独立したイメージとして残っていないことを確認した。最終的なタグなしイメージもなかった。
検証用 `voicevox-task-261018200818`のコンテナ、ネットワーク、一時Consul匿名領域は削除した。
今後の再現手順ではConsulもtmpfsに置き、匿名領域を作らない。

置換元の `voicevox-streaming-validation-engine-1`と専用ネットワーク、
`local/voicevox-engine:streaming-14a699f`（`sha256:343511707e99f363fefb363310ab155642028c5b7d1665ef3dbcb782e46a381e`）は、
接続確認完了後に参照とマウントなしを確認して削除した。旧ソースや既存の復旧用Sincromisorイメージは残している。
検証用に新規取得した補助イメージはない。音声ファイルを保存せず、非公開の診断ログだけを `work/private-artifacts/`に残した。

完了時はコンテナ0、イメージ105.7GB、ビルドキャッシュ146.5GB（private 86.89GB、開始比約4.2GB増）、空き112GB。
ビルドキャッシュは既存のGC設定（最大375.3GiB・最低空き94.06GiB、未使用60日等）に従って再利用・回収する。
共有キャッシュの削除や設定変更、既存ボリュームの一括整理は行っていない。

GPU、全スタイルモデル、会話再生の逐次化、他ホスト反映、GHCR公開は対象外で未実行。
会話サービス本体は停止したままであり、今回のイメージでの通常起動は上記の再現手順に従う。
