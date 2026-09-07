# インフラ: 保存領域

## 要約

- 保存領域は Redis と SeaweedFS を中心に、サービス間の一時状態やファイル保存を支える。
- MinIO は通常導線から外し、SeaweedFS を正本とする。
- 保存領域変更は Docker Compose、環境変数、利用サービスを同時に確認する。

## 対象範囲

- 対象:
    - Redis
    - SeaweedFS
    - 保存領域関連環境変数 / Docker Compose
- 非対象:
    - 各サービスの業務ロジック
    - 旧 MinIO 運用

## 責務

- Redis:
    - 軽量な一時状態やキャッシュ用途を担う。
- SeaweedFS:
    - 音声、ログ、評価成果物などのファイル保存用途を担う。

## モデルキャッシュ

認識サービスのNeMoは `load_model()` → `from_pretrained()` でモデルを解決する。
`refresh_cache=False` の既定動作により、Hugging Faceのキャッシュ内の
`reazon-research/reazonspeech-nemo-v2` の `reazonspeech-nemo-v2.nemo` を先に調べ、
見つかった場合は取得APIを呼ばない。見つからない場合だけNeMoとHugging Faceの取得処理へ進む。
取得失敗や壊れたモデルの読み込みは例外で起動失敗となり、サービス登録より前に停止する。
途中取得の `.incomplete` ファイルを正常なモデルとして扱わず、独自の完了印やキャッシュ削除は行わない。

保存先はホストの `volumes/sincro-cache`、コンテナ内は `/opt/sincromisor/.cache` であり、
モデルはその下の `huggingface/hub/` にある。実行ユーザーはUID 1001である。
初回のみ[READMEの起動手順](../../../README.md#とにかくローカル環境でサーバーを動かす)で空の保存先を作る。
Composeは保存先がない場合に起動を拒否し、root所有のディレクトリを自動作成しない。
既存の正常なキャッシュはそのまま再利用し、毎回の再帰的な所有者変更やモデル取得コマンドを実行しない。
既存キャッシュに権限不整合がある場合は管理者が対象を確認して必要箇所だけ修正する。

S3のバケット・認証準備は `s3-bootstrap` が担い、認識と音声合成がその正常終了を待つ。
モデルキャッシュとは別の保存領域であり、旧initializerの `mc alias set` はこの準備に使われていなかった。
旧initializerだけがマウントしていた `configs/config.yml` の権限変更も現行サービスには不要である。

## 変更時の確認

- 保存領域エンドポイントや認証情報を変える場合は `examples/compose.env` と Docker Compose を同時更新する。
- 保存オブジェクトのスキーマやパスを変える場合は利用サービスの受信処理 / 書き込み処理を同時更新する。
- MinIO 前提の記述が残っていないか確認する。

## 参照

- `documents/design/infrastructure/compose.md`
- `documents/design/archive/legacy-flat/backend_storage.md`
