# 廃止済みNue-ASR実装と依存定義の削除

## 背景 / 目的

[直前のDependabot対応](../task-261011143119-dependabot-remediation/task.md)で、旧Nue-ASRのTransformers固定に起因する11件を保留した。ユーザーから旧Nue-ASRを使わないため、関連実装・依存定義・参照を削除してコミットするよう依頼された。

## 完了条件

- [x] 旧サービスの実装、依存定義、専用検証スクリプトと音声素材を削除する。
- [x] 現行コード・設定・文書の参照を整理し、NeMoの起動定義と依存ロックを維持する。
- [x] 対象確認の結果と未実行事項を記録してコミットする。

## 変更内容

- `sincromisor-server/speech-recognizer/`の10ファイルを削除した。プロセス入口、認識・保存処理、引数定義、パッケージ公開、Python版指定、README、`pyproject.toml`を含む。
- `utils/test-nue/`の検証スクリプトと専用音声素材を削除した。現行のテストからこの素材への参照はない。
- ルート`pyproject.toml`から削除済み2ディレクトリの型検査除外を削除した。
- 設計索引、音声認識サービス設計、ログREADMEを現行NeMoの案内へ更新した。ログREADMEの認識結果モデルへの旧リンクも修正した。

旧サービスは既にworkspace・Compose起動対象から外れていたため、現行サービスの公開契約は変更しない。`uv.lock`のNeMo・Transformersと、S3バケット・Composeサービスの共通名`speech-recognizer`は現行NeMoでも使用するため維持する。

過去タスクと`documents/design/archive/`にある旧実装の説明・パスは当時の記録として残す。Compose設計の旧`nue`指定が非互換であるという説明も移行上の注意として維持する。

旧依存定義の削除は、直前に確認したDependabot #18、#19、#20、#27、#28、#29、#86、#143、#146、#210、#234への対応となる。GitHub上の警告状態は既定ブランチへの反映後に再評価される。直前の対応で残ったNeMoの制約と修正版未公開の依存は本タスクでは変更しない。

## 確認結果

- `git grep`で履歴を除く管理ファイルを確認し、旧パッケージのimport、旧ディレクトリ参照、`nue-asr`依存、専用検証スクリプトへの参照が残っていないことを確認した。
- `uv lock --check --offline`: 204パッケージの整合性確認成功。ロックファイルの差分なし。
- PythonのTOML解析で全workspaceの依存定義が存在すること、ロックに`speech-recognizer`・`nue-asr`・`deepspeed`がないこと、現行Transformersが5.17.0であることを確認した。
- 既存のYAMLライブラリーでCompose定義を解析し、音声認識がNeMoのDockerfileと`SpeechRecognizerNemoProcess.py`を参照し、両ファイルが存在することを確認した。
- 変更MarkdownのPrettier、`git diff --check`、タスク状態・索引検査: 成功。

未実行: `node --test scripts/tests/nemo-compose.test.mjs`はDocker CLIがなく`spawnSync docker ENOENT`で起動できなかった。上記の定義・参照先確認で補完した。GPUによる音声認識とDockerビルドは実施していない。現行NeMoの実装・依存・Compose設定は変更していない。
