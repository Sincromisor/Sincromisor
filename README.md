# Sincromisor

Webブラウザ上でかわいいキャラになっておしゃべりしたり、かわいいキャラとおしゃべりしたりできるよ!

![Sincromisor](documents/images/sincromisor.jpg)
![配信画面の例](documents/images/sincromisor-example.png)

## 必要なもの

- サーバー側
    - Linuxサーバー(x86_64)
    - NVIDIA GPUとCUDA 13対応ドライバー（580系以降）
        - シンクロモード: VRAM 4GB程度(NeMo)。
        - チャットモード: 追加で8GB程度、合計16GB以上のVRAMが必要(LLM用)
    - モデル・コンテナの初回取得に使うインターネット接続
    - [Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
    - [NVIDIA Driver(nvidia-open)](https://www.nvidia.com/en-us/drivers/)
    - [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- クライアント側
    - GPUがそこそこの性能のPC、スマートフォン、タブレット
    - マイク
    - カメラ
    - Webブラウザ
    - 好きなVRM-1.0モデル（同梱モデルも利用できます）

## 検証済み環境

- サーバー側(シンクロモード)
    - ubuntu 24.04
        - Core i5-12600K
        - RTX3060(12GB)
        - DDR4-3200 64GB

- サーバー側(チャットモード)
    - ubuntu 24.04
        - Core i5-14500
        - RTX4060Ti(16GB)
        - DDR5-5600 64GB

- クライアント側
    - Windows 11(Ryzen 2500U)
    - Pixel 6
    - iPad Air(gen3)

## とにかくローカル環境でサーバーを動かす

ソースコードを取得し、リポジトリのルートで起動します。

```sh
git clone https://github.com/Sincromisor/Sincromisor.git
cd Sincromisor
cp examples/compose.env .env
docker compose up
```

同梱の設定で会話に必要なサービスが起動します。
初回はコンテナイメージのビルドと会話・音声認識用モデルのダウンロードを自動で行います。
保存先とサービス間の接続設定も自動で準備され、次回からは保存済みのモデルを再利用します。

## クライアント側のつかいかた

1. サーバーを起動したPCのブラウザーで [http://localhost:8086/](http://localhost:8086/) を開きます。
2. `Simple Interface` を選びます。
3. マイク・カメラの利用を許可し、「開始する」を押してキャラクターに話しかけます。

起動前の設定で会話モードを切り替えられます。

- `chat`: キャラクターと会話します。
- `sincro`: あなたの発話をキャラクターの声で読み上げます。

`360deg Camera` は360度動画・カメラ、`Looking Glass` は [Looking Glass](https://lookingglassfactory.com/looking-glass-portrait) 向けの画面です。

## キャラクターを差し替える

キャラクターモデルは[VRM-1.0形式](https://vrm.dev/vrm1/)のものが利用できます。
最初の設定ダイアログで、利用したいVRMモデルを選択、またはドラッグ&ドロップしてください。
登録したVRMファイルは、ブラウザのキャッシュとして保持されます。サーバーにアップロードはされません。

デフォルトのモデルを差し替えたい時は、サーバーのファイル
`sincromisor-frontend/public/characters/default.vrm`を差し替えてください。

## 音声認識の固有名詞辞書を追加する

名前や作品名の読み方を辞書に登録できます。
[辞書の追加手順](documents/design/backend/services/speech-recognizer.md#辞書の追加手順)を参照してください。

## 会話の設定を変える

キャラクターの話し方や指示は、同梱の管理画面で編集できます。
[管理画面の使い方](documents/design/backend/services/agent-server.md#管理者認証とeditor)を参照してください。

## 別の端末から使う・処理を分散させる

LAN内の別端末からの利用や、複数サーバーへの分散配置にも対応しています。
[接続先と配置の設定](documents/design/infrastructure/compose.md#ブラウザの公開先)を参照してください。

## OBSで利用する場合

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

Google Chromeの設定を変えると、Chromium Embedded Framework側にも反映されます。
キャラクターの操作には、OBSの映像入力と別のカメラを選択してください。

- <chrome://settings/content/camera>
- [chrome://settings/content/microphone](chrome://settings/content/camera)

## 音声認識・合成をコマンドラインで使いたい

[SincromisorCLI](https://github.com/Sincromisor/SincromisorCLI)を用いると、
コマンドライン経由での音声認識・合成・テロップ用テキストの取得ができます。
