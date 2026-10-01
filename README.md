# Sincromisor

Webブラウザーで、かわいいキャラクターになっておしゃべりしたり、キャラクターと会話したりできます。

![Sincromisor](documents/images/sincromisor.jpg)
![配信画面の例](documents/images/sincromisor-example.png)

## 必要なもの

### サーバー側

x86_64のLinuxサーバーと、NVIDIA GPU、CUDA 13対応ドライバー（580系以降）が必要です。
使用するモードに応じて、次のVRAM容量を確保してください。

| モード         | 必要なVRAM                               |
| -------------- | ---------------------------------------- |
| シンクロモード | NeMo用に4GB程度                          |
| チャットモード | LLM用に追加で8GB程度。合計16GB以上が必要 |

[Docker Engine](https://docs.docker.com/engine/install/ubuntu/)、[NVIDIA Driver（nvidia-open）](https://www.nvidia.com/en-us/drivers/)、[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)をインストールしてください。
モデルやコンテナを初めて取得するときは、インターネット接続も必要です。

### クライアント側

ある程度のGPU性能を備えたPC、スマートフォン、タブレットで利用できます。
マイク、カメラ、Webブラウザーを用意してください。
キャラクターには好きなVRM 1.0モデルを使えるほか、同梱モデルも利用できます。

## 検証済み環境

### サーバー側

| 項目     | シンクロモード   | チャットモード      |
| -------- | ---------------- | ------------------- |
| OS       | Ubuntu 24.04     | Ubuntu 24.04        |
| CPU      | Core i5-12600K   | Core i5-14500       |
| GPU      | RTX 3060（12GB） | RTX 4060 Ti（16GB） |
| メモリー | DDR4-3200 64GB   | DDR5-5600 64GB      |

### クライアント側

Windows 11搭載PC（Ryzen 2500U）、Pixel 6、iPad Air（第3世代）で検証済みです。

## ローカル環境でサーバーを動かす

ソースコードを取得し、リポジトリのルートでサーバーを起動します。

```sh
git clone https://github.com/Sincromisor/Sincromisor.git
cd Sincromisor
cp examples/compose.env .env
docker compose up
```

Linuxホストでは[journalの保存と読み取りの設定](documents/design/infrastructure/logging.md#ホストのjournal)を行ってください。
ログの原本を読み取れない場合、ログ収集の監視結果は異常となります。

同梱の設定で会話に必要なサービスが起動します。
初回はコンテナイメージのビルドと会話・音声認識用モデルのダウンロードを自動で行います。
保存先とサービス間の接続設定も自動で準備され、次回からは保存済みのモデルを再利用します。

## ログを検索する

通常の起動時には、VictoriaLogsと各ホストのログ収集も起動します。
ログは[ローカルのログ検索画面](http://127.0.0.1:9428/select/vmui/)で検索できます。

対話本文と音声生成の詳細は、既定で記録されます。
記録の有無は、`.env`の`SINCRO_LOG_CONVERSATION_ENABLED`と`SINCRO_LOG_SYNTHESIS_ENABLED`でそれぞれ切り替えられます。
設定を反映するには、対象サービスを再作成してください。

詳しくは[ログの保存・検索と記録の切り替え](documents/design/infrastructure/logging.md)を参照してください。
[停止中のログの回収](documents/design/infrastructure/logging.md#原本バッファ復旧)と[バックアップ・復元](documents/design/infrastructure/storage.md#ログ基盤)の手順も記載しています。

## クライアント側の使い方

1. サーバーを起動したPCのブラウザーで[http://localhost:8086/](http://localhost:8086/)を開きます。
2. `Simple Interface`を選びます。
3. マイク・カメラの利用を許可し、「開始する」を押してキャラクターに話しかけます。

起動前の設定で会話モードを切り替えられます。

- `chat`: キャラクターと会話します。
- `sincro`: あなたの発話をキャラクターの声で読み上げます。

`360deg Camera`は360度動画・カメラ向けの画面です。
`Looking Glass`は[Looking Glass](https://lookingglassfactory.com/looking-glass-portrait)向けの画面です。

## キャラクターを差し替える

キャラクターには[VRM 1.0形式](https://vrm.dev/vrm1/)のモデルを利用できます。
最初の設定ダイアログで、利用したいVRMモデルを選択するか、ドラッグ＆ドロップしてください。
登録したVRMファイルは、ブラウザーのキャッシュに保存されます。サーバーにはアップロードされません。

既定のモデルを変更するには、サーバー上の`sincromisor-frontend/public/characters/default.vrm`を差し替えてください。

## 音声認識の固有名詞辞書を追加する

名前や作品名の読み方を辞書に登録できます。
[辞書の追加手順](documents/design/backend/services/speech-recognizer.md#辞書の追加手順)を参照してください。

## 会話の設定を変える

キャラクターの話し方や指示は、同梱の管理画面で編集できます。
[管理画面の使い方](documents/design/backend/services/agent-server.md#管理者認証とeditor)を参照してください。

## 別の端末から使う・処理を分散させる

LAN内の別の端末から利用したり、複数のサーバーに処理を分散させたりすることもできます。
[接続先と配置の設定](documents/design/infrastructure/compose.md#ブラウザの公開先)を参照してください。

## OBSで利用する

### カメラ・マイクの利用許可

次のオプションを指定してOBSを起動すると、ブラウザーソースでマイク・カメラを利用できます。

```bat
cd "C:\Program Files\obs-studio\bin\64bit"
obs64.exe --enable-media-stream ^
          --use-fake-ui-for-media-stream ^
          --auto-accept-camera-and-microphone-capture ^
          --autoplay-policy=no-user-gesture-required
```

### キャラクターの制御に利用するカメラ・マイクの設定

Google Chromeの設定を変えると、Chromium Embedded Frameworkにも反映されます。
キャラクターの操作には、OBSの映像入力とは別のカメラを選択してください。

- <chrome://settings/content/camera>
- [chrome://settings/content/microphone](chrome://settings/content/camera)

## 音声認識・合成をコマンドラインで使う

[SincromisorCLI](https://github.com/Sincromisor/SincromisorCLI)を使うと、コマンドラインから音声認識・音声合成を実行できます。
テロップ用のテキストも取得できます。
