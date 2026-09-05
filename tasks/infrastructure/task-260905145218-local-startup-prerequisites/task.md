# ローカル起動手順と会話モードの前提を同期

## 背景 / 目的

2026-09-05、HEAD `1801836a8f75691d08e691471a681ccd50eb7c73` の起動案内と設定を照合した。READMEの「サンプルをそのままコピー」「http://localhostへアクセス」「Dify設定をconfigs/.envへ記入」という案内が、現在のComposeと一致しない。後続の動作確認が設定不備で止まることを防ぐ。

根拠は既存の起動構成と、ローカル／オンプレミスでサービスを提供するユーザー要求である。DifyとLLMも管理下の環境へ配置し、外部サービスのAPIを利用する案内は追加しない。

## 起票時に確認した不整合

- `examples/compose.env` の `SINCRO_PION_PUBLIC_IPV4` は例示値 `203.0.113.10` で、ブラウザから到達できるホストのIPv4への置換が必要である。
- `compose/frontend.yml` はホスト `8086` をコンテナ `80`、ホスト `8443` をコンテナ `443` へ公開しており、READMEのポートを省略したURLと異なる。`configs/Caddyfile` は `:80` のみで、443の公開だけではHTTPSは提供されない。
- Dify設定はルートの `.env` から `compose/text-processor.yml` の環境変数を経由してPython設定へ渡る。READMEの `configs/.env` 指定はこの経路と一致しない。
- Dify URLの例 `127.0.0.1` は、text-processorコンテナ内から別コンテナ・ホストのDifyへ接続するアドレスにはならない。
- サンプルのDify設定は空だが、フロント既定値は `chat` で、TextProcessorのchat入口はDify未設定時に失敗する。
- サンプルは公開STUNを指定するが、Go設定はSTUNの空指定を許可する。閉じたLANでの提供と外部STUNが必要な構成を混同させない。

## 完了条件（受け入れ条件）

- [x] READMEから、イメージ・モデルなどの事前準備、設定のコピーと必須編集、Compose起動、ブラウザURL、最初のモード選択までを順にたどれる。取得を要する準備とサービス実行時の条件を区別し、完全オフライン導入を検証済みと断定しない。
- [x] `sincro` はDify設定不要、`chat` はオンプレミスDifyとLLMの設定が必要であることを明記する。現在の既定値 `chat` を維持し、初回にDifyなしで試す場合は開始前に `sincro` を選ぶ手順を示す。
- [x] `.env` の位置、Difyへのコンテナ視点の到達先、ブラウザへの広告IPv4、公開ポートを実装・Composeと一致させる。広告IPv4は閉じたLANでは到達可能なLANアドレスを用いることを説明し、公開インターネット上のIPを必須条件としない。
- [x] 同一PCのlocalhost利用と別端末からのLAN利用について、実際の公開URLとマイク・カメラに必要なブラウザの安全な接続条件、現在のCaddy設定ではHTTPS・証明書が未設定であることを説明する。LANでの利用には管理下のHTTPS終端とブラウザが信頼する証明書を別途準備する必要があると記し、ポート公開だけでHTTPSが使えるとは案内しない。HTTPのLANアドレスだけでマイク・カメラが必ず使えるとは案内しない。
- [x] STUN空指定を含む既存のオンプレミス構成を説明する。外部STUN依存やTURN非対応など、現在の接続制約を正本へリンクし、新たなネットワーク機能の実装は行わない。
- [x] README、Compose設計、サンプル設定の説明を同期し、隔離したサンプル設定によるCompose展開と対象文書の整形・リンク確認を実施する。

## 設計判断と範囲

通常の文書・設定コメント修正として扱う。サービスの起動方式、公開ポート、既定会話モード、環境変数名、認証方式は変えない。IPの自動判定、Difyの自動配備、外部API、TURN追加、GPUモデルの交換、UI改修は対象外である。

対象:

- [利用案内](../../../README.md)
- [サンプル設定](../../../examples/compose.env)のコメント
- [Compose設計](../../../documents/design/infrastructure/compose.md)

確認先:

- [フロント公開ポート](../../../compose/frontend.yml)、[RTC設定](../../../compose/sincro-rtc.yml)、[Dify設定の受け渡し](../../../compose/text-processor.yml)、[Caddy設定](../../../configs/Caddyfile)
- [Go設定検証](../../../sincromisor-server/sincro-rtc/internal/config/config.go)
- [会話既定値](../../../sincromisor-frontend/src/app/settings/sincroAppSettingsDefaults.ts)、[TextProcessor入口](../../../sincromisor-server/text-processor/TextProcessorProcess.py)
- [RTC運用方針](../../../documents/migration/pion/rollout-and-operations.md)

## 確認方法

一時ディレクトリにサンプルをコピーし、架空の到達先とダミーのDify設定で `docker compose --env-file <一時ファイル> --profile full config` を実行する。STUN空指定が引数へ反映されることと、Dify設定・公開ポートを確認する。既存 `.env` の読み取りや上書き、実トークンの表示、コンテナ再作成は行わない。

環境変数の供給元から消費先をコード照合し、変更MarkdownだけをPrettierで確認する。実GPU・実Dify・実カメラでの起動試験は必須にせず、実施していない範囲を記録する。Composeツールが利用できなければその理由と代替の設定照合結果を残す。

## 実施結果

通常の文書・設定コメント修正として、READMEの準備・設定編集・起動・公開URL・開始前のモード選択、Compose設計、サンプルコメントを同期した。初期化処理の `hf download` とモデル保存先、Python設定の供給元・消費先、GoのSTUN空指定、フロント既定値 `chat`、CaddyのHTTPのみの待受をコードと照合した。サンプルの設定値・公開ポート・会話既定値は維持した。

確認では一時ディレクトリへ `compose.yml` と `compose/*.yml` だけをコピーし、サンプル設定を `sample.env` として配置した。広告IPv4を `192.0.2.10`、STUNを空、Dify URLを `http://dify.invalid/v1`、キーを `app-dummy-test` へ差し替え、検証プロセスに継承する `SINCRO_` / `COMPOSE_` 環境変数を除外した。そのディレクトリで `docker compose --env-file <sample.envの絶対パス> --profile full config --format json` を実行し、次を確認して合格した。

- RTC引数の広告IPv4と空のSTUN。
- TextProcessorへのダミーDify URL・キーの受け渡し。
- フロントの `8086:80/tcp`、`8443:443/tcp`、`8443:443/udp` とRTCの `3478:3478/udp`。
- 変更した文書の相対リンク、サンプルの設定値と既定会話モードの維持、Prettierの整形確認。

文書点検: PASS。設定コメントも点検済み。本番コードの変更はなく、実GPU・実Dify・実カメラでの起動試験、HTTPS終端の配備、完全オフライン起動は未実行。既存 `.env` の読み取り・上書き、Dockerデーモンへの接続、コンテナ再作成は行っていない。タスク索引検査は合格し、`tasks:check` は変更範囲外の `task-260904005741-fix-face-landmarker-timestamp` の `review.md`・`impl.md`・`eval.md` 欠落のみで失敗した。
