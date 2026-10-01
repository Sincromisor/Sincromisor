# インフラ: 保存領域

## 要約

- 保存領域はRedisとSeaweedFSを中心に、サービス間の一時状態やファイル保存を支える。
- MinIOは通常導線から外し、SeaweedFSを正本とする。
- 保存領域を変更する場合はDocker Compose、環境変数、利用サービスを同時に確認する。

## 対象範囲

- 対象
    - Redis
    - SeaweedFS
    - 保存領域関連環境変数 / Docker Compose
- 非対象
    - 各サービスの業務ロジック
    - 旧MinIO運用

## 責務

- Redis
    - 軽量な一時状態やキャッシュ用途を担う。
- SeaweedFS
    - 音声、ログ、評価成果物などのファイル保存用途を担う。

## モデルキャッシュ

認識サービスのNeMoは `load_model()` → `from_pretrained()`でモデルを解決する。
`refresh_cache=False`の既定動作により、Hugging Faceのキャッシュ内の
`reazon-research/reazonspeech-nemo-v2`の `reazonspeech-nemo-v2.nemo`を先に調べ、
見つかった場合は取得APIを呼ばない。見つからない場合だけNeMoとHugging Faceの取得処理へ進む。
取得失敗や壊れたモデルの読み込みは例外で起動失敗となり、サービス登録より前に停止する。
取得途中の `.incomplete`ファイルを正常なモデルとして扱わず、独自の完了印やキャッシュ削除は行わない。

保存先はホストの `volumes/sincro-cache`、コンテナ内は `/opt/sincromisor/.cache`であり、
モデルはその下の `huggingface/hub/`にある。実行ユーザーはUID 1001である。
`service-initializer`がComposeの作成した保存先の所有者をUID 1001へ設定してから認識を起動する。
root以外が所有する既存キャッシュと配下のファイルの所有者・権限は変更しない。
モデルの再帰的な所有者変更やキャッシュ削除は行わない。

S3のバケット・認証準備は `s3-bootstrap`が担い、認識と音声合成がその正常終了を待つ。

## S3の認証と保存データ

`SINCRO_S3_SECRET_KEY`が空欄の場合は、`s3-credential-initializer`が
暗号学的乱数32バイトの16進表記をS3専用の `s3-auth`ボリュームの `/auth/secret`へ保存する。
再作成時も同じ値を再利用し、AgentServer用トークンとは別のボリュームにする。
初期化処理・音声認識・音声合成だけに `/run/sincromisor-s3-auth`として読み取り専用で渡す。
`with-s3-secret.sh`が明示値を優先し、空欄なら保存値を既存の環境変数へ読み込む。

`s3-bootstrap`は選択されたキーを `s3.configure`で該当利用者の同じアクセスキーへ反映する。
従来の `ALLOW_SECRET_ROTATION=0`による不一致拒否は廃止し、起動設定を正とする。
別の利用者や保存済みオブジェクトは削除しない。
キーを含む設定JSONをログへ出さず、対象バケットへの署名付き要求の成功と、
不正キーに対する403応答を確認してから正常終了する。
この確認に失敗すれば音声認識・音声合成の起動も止める。

### S3キーの変更

ルート `.env`の `SINCRO_S3_SECRET_KEY`を変更し、`docker compose down` →
`docker compose up -d`でS3と利用サービスを再作成する。変更を許可する別フラグは不要である。
手動キーは英数字と `_ . , / + = -`を使える。空白・改行などコマンドの解釈を変える文字は起動前に拒否する。
キーを空欄へ戻した場合は、`s3-auth`に保存済みの自動生成値へ戻る。
分散配置ではS3と利用サービスの全ホストに同じ明示値を設定して再作成する。
ホストごとの自動生成値は共有されないため、分散配置の共通キーには使わない。

キーは接続の認証に使う。キー変更に伴う保存済みオブジェクトの再暗号化は行わない。
標準Composeは本体を `sincro-s3-data`、管理情報を `sincro-s3-master-data`、
ファイル管理情報と認証設定を `sincro-s3-filer-data`へ保存する。
`down`後も名前付きボリュームを保持する。`down -v`は保存データを削除するため変更手順に使わない。

### 以前の匿名ボリュームの引継ぎ

以前の構成はMasterとFilerの `/data`に名前を指定していなかった。
`down`でコンテナを削除すると、その匿名ボリュームは次回起動時に自動で再利用されない。
既存データを引き継ぐ場合は、再作成前に元の `/data`のボリューム名を確認し、
停止状態で新しい名前付きボリュームへ内容をコピーするか、管理用の追加Composeで元のボリュームを明示して使う。
コンテナ削除済みで対応が不明な場合は、匿名ボリュームを推測で選んだり削除したりしない。
本体とFilerのファイル管理情報を揃えて引き継ぐため、バックアップには3領域を含める。

## チャット用GGUF

`llama-model-initializer`がGemma 4 E2Bの指示調整済みテキストモデルを自動取得し、
Git管理外の `volumes/llama-models`に保存する。保存先はComposeが作成する。
取得元は [ggml-org/gemma-4-E2B-it-GGUF](https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/tree/b4243c156154b6dca9324415f8c7ccc098b4aed1)、
固定リビジョンは `b4243c156154b6dca9324415f8c7ccc098b4aed1`、ファイルは `gemma-4-E2B-it-Q4_0.gguf`、量子化はQ4_0である（2026-09-15確認）。
画像・音声入力と投機的デコードの追加ファイルは使わない。

`SINCRO_LLAMA_MODEL_DIR`を `/models`へ読み取り専用でマウントする。
相対パスは `compose/`を基準とし、別の保存先には絶対パスを使う。
初期化コンテナだけに保存先の書込みを許可する。
取得中は `.part`に保存し、SHA-256が
`8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52`
と一致した場合だけ最終ファイル名へ変更する。
既存モデルも同じ値で検証し、通信失敗や不一致では初期化を失敗させてllama-serverの起動を止める。
不一致の既存ファイルは上書きしない。途中の `.part`は次回起動で再取得する。
管理者が `SINCRO_LLAMA_MODEL_FILE`に別名を指定した場合は、配置済みの空でないファイルを使う。
保存先を維持すれば、コンテナ再作成でも同じモデルを外部取得なしで読み込む。

## サービス間の認証

`service-initializer`が暗号学的乱数32バイトを16進表記にしたトークンを生成し、
`service-auth`名前付きボリュームの `/auth/token`へ保存する。
一時ファイルから改名して確定し、既存トークンは再生成しない。
AgentServerとTextProcessorだけに `/run/sincromisor-auth`として読み取り専用で渡す。
両サービスのUIDが異なるためファイルは0444とし、ホストや他サービスへはマウントしない。
管理者が明示した環境変数を優先し、未指定時だけこのファイルを使う。
トークンをログやGitへ出力しない。

## Mastraの設定と会話

`agent-data`名前付きボリュームをagent-serverの `/data`へ割り当てる。
UID 1000のnodeユーザーが権限700の領域に単一libSQL `mastra.db`を置き、Editor設定と会話履歴を保存する。
管理者だけがバックアップを扱い、秘密を含む設定や会話をGitや公開検証資料へ保存しない。
コンテナの再作成ではボリュームを維持し、初期指示で公開済み設定を上書きしない。
詳細な認証・thread分離は[AgentServer](../backend/services/agent-server.md)を参照する。

## 変更時の確認

- 保存領域エンドポイントや認証情報を変える場合は `examples/compose.env`とDocker Composeを同時更新する。
- 保存オブジェクトのスキーマやパスを変える場合は利用サービスの受信処理 / 書き込み処理を同時更新する。
- MinIO前提の記述が残っていないか確認する。

## ログ基盤

中央の保存・公開先・Consul登録は[ログの保存と検索](logging.md)を参照する。

`victoria-logs-data`は中央保存、`vector-data`は送信待ち・確定cursor・原本消失marker、`observer-data`は配送の前回観測を保持する。Dockerログ原本はホストの永続journalであり、Composeのボリュームではない。各ホストの管理者がjournal容量・空き容量・レート制限を管理する。原本とバッファを同時に失う物理故障には別ホスト保管が必要になる。

中央は停止中にファイル一式を保存する。次のコマンドは既存ファイルを上書きせず、失敗時も実行前に稼働していた中央を再起動する。停止中のサービス出力は各ホストのjournalとVectorバッファが保持する。

```sh
sh scripts/logging/backup.sh /backup/sincromisor-logs.tar --env-file .env -f compose.yml
```

バックアップは中央ボリューム外に置き、ホスト故障にも備えるなら別ホストへ転送する。会話を含み得るため管理者だけが読める保存先・転送路を使う。

復元確認は稼働中ボリュームを上書きせず、新しい名前付きボリュームと管理下にある同じバージョンの中央イメージを使う。以下の`logs-restore-check`と`logs-restore-data`は未使用名とし、必要なら別名にする。

```sh
docker volume create logs-restore-data
docker run --rm -i --network none -v logs-restore-data:/restore \
  --entrypoint /busybox ghcr.io/sincromisor/victoria-logs:v1.52.0 \
  tar -C /restore -xf - < /backup/sincromisor-logs.tar
docker run -d --name logs-restore-check --network none \
  -v logs-restore-data:/victoria-logs-data \
  ghcr.io/sincromisor/victoria-logs:v1.52.0 -storageDataPath=/victoria-logs-data
docker exec logs-restore-check /busybox wget -qO- \
  'http://127.0.0.1:9428/select/logsql/query?query=*&limit=10'
```

利用するレジストリを変更している場合はイメージ名も合わせる。検索を確認してから本番の停止・ボリューム切替を管理者が行う。バックアップ後に中央だけへ受理されたログは復元先にはない。既にACK済みのイベントをVectorが必ず再送するわけではないため、復元時にはバックアップ時刻から障害までの区間を欠落の可能性として記録する。

## 参照

- `documents/design/infrastructure/compose.md`
- `documents/design/archive/legacy-flat/backend_storage.md`
