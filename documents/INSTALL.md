# Sincromisor実行環境のインストールとサーバーの起動

## 現在の導入手順

Docker Composeで起動します。必要な機器とソフトウェアは[READMEの「必要なもの」](../README.md#必要なもの)、取得・起動は[ローカル環境の手順](../README.md#ローカル環境でサーバーを動かす)を参照してください。

`examples/compose.env`をリポジトリのルートの`.env`へコピーすると、既定の`full,chat`で会話に必要なサービスが起動します。初回はイメージのビルドとモデル取得を行い、次回から保存済みモデルを再利用します。既存の`.env`は上書きせず、必要な設定を反映してください。

Linuxホストでは[ホストのjournal](design/infrastructure/logging.md#ホストのjournal)に従い、ログの保存と読み取りを設定してください。起動後は同じPCのブラウザーで`http://localhost:8086/`を開きます。

以前の`config.yml`、`install.sh`、`start-server.sh`を使う導入手順は廃止済みです。

## 別端末からの接続

ブラウザー向けHTTPとWebRTCのメディア通信は別経路です。シグナリングはHTTPの`config.json`・`offer`・`candidate`を使い、STUNはシグナリングの代わりにはなりません。

- 標準構成のHTTP公開先はTCP 8086です。LANの別端末でマイク・カメラを使う場合は、管理下のHTTPS終端とブラウザーが信頼する証明書を用意してください。
- メディア通信には`SINCRO_PION_MEDIA_UDP_PORT`のUDPポートを使います。既定値は3479です。
- 別端末から接続する場合は、`SINCRO_PION_PUBLIC_IPV4`をブラウザーから到達できるIPv4へ変更し、ファイアウォールやNATもその経路に合わせてください。

設定と公開範囲は[Compose設計](design/infrastructure/compose.md#ブラウザの公開先)、通信形式は[フロントエンドのRTC契約](design/contracts/frontend-rtc.md)を参照してください。

## 運用と開発環境

- [Composeのプロファイルと分散配置](design/infrastructure/compose.md): サービスを配置するホストと公開ポートを選びます。
- [ログの保存と検索](design/infrastructure/logging.md): 起動失敗や会話処理の状態を調べます。
- [保存領域](design/infrastructure/storage.md): モデル、認証情報、会話履歴とログを保持します。
- [WSL2の開発環境](../utils/setup-devenv/README.md): 開発用ツールの導入手順を参照できます。一括導入は未検証です。
