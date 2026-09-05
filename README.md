# Sincromisor

Webブラウザ上でかわいいキャラになっておしゃべりしたり、かわいいキャラとおしゃべりしたりできるよ!

![Sincromisor](documents/images/sincromisor.jpg)
![配信画面の例](documents/images/sincromisor-example.png)

## 必要なもの

- サーバー側
    - Linuxサーバー(x86_64)
    - Transformersが動作するNVIDIA GPU
        - シンクロモード: VRAM 4GB(nemo)、8GB(nue)。
        - チャットモード: 追加で8GB程度、合計16GB以上のVRAMが必要(Dify用)
    - [Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
    - [NVIDIA Driver(nvidia-open)](https://www.nvidia.com/en-us/drivers/)
    - [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- クライアント側
    - GPUがそこそこの性能のPC、スマートフォン、タブレット
    - マイク
    - カメラ
    - Webブラウザ
    - かわいいVRM-1.0モデル

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

ローカル／オンプレミスでの提供を前提とする。まずNVIDIA DriverとNVIDIA Container Toolkitを準備し、コンテナ内の `nvidia-smi` でGPUを確認する。

1. ソースコードを取得し、リポジトリのルートへ移動する。

```sh
git clone https://github.com/Sincromisor/Sincromisor.git
cd Sincromisor
```

2. 設定サンプルをルートの `.env` へコピーする。

```sh
cp examples/compose.env .env
chmod 600 .env
```

3. 起動前に `.env` を編集する。サンプルのままでは広告IPv4が例示値のため接続できない。

- `SINCRO_PION_PUBLIC_IPV4`: ブラウザから到達できるサーバーホストのIPv4へ置き換える。閉じたLANではホストのLANアドレスを使い、インターネット上の公開IPは必須ではない。`203.0.113.10` は説明用の値である。
- `SINCRO_PION_STUN`: サンプルは外部STUNを指定している。閉じたLANで直接UDP通信ができる構成では `SINCRO_PION_STUN=` と空にできる。STUNの有無にかかわらず、広告IPv4とメディアUDPポートへの到達性が必要である。
- `SINCRO_COMPOSE_NETWORK_SUBNET`: 既存のDockerネットワークやLANと重複する場合は未使用の範囲へ変更する。
- Difyなしで最初に試す場合、Dify設定2項目は空のままでよい。ブラウザで開始前に `sincro` を選ぶ。既定の `chat` を使う場合は、先に[チャットモードの設定](#チャットモードを利用する)を行う。

4. コンテナイメージ・モデルの取得を準備する。設定したレジストリから取得する場合は次を実行する。

```sh
docker compose --profile full pull
```

ソースからイメージを作る場合は `docker compose --profile full build` を使う。取得元のイメージやビルド時の依存パッケージ、音声認識モデルには取得先への通信が必要になる。初期化処理は起動時に `hf download` で選択した音声認識モデルを取得し、`volumes/sincro-cache` に保存する。チャット用LLMのモデルとDifyも管理下の環境へ事前に配置する。

サービス実行時に外部サービスのAPIを使わない構成と、導入時に何も取得しない完全オフライン構成は区別する。キャッシュがあっても初期化処理は取得コマンドを実行するため、完全オフライン導入・起動を検証済みとはしていない。

5. 全サービスを起動する。

```sh
docker compose --profile full up -d
```

ネットワークの制約と設定の受け渡しは[Compose設計](documents/design/infrastructure/compose.md)を参照する。

## クライアント側のつかいかた

サーバーと同じPCのブラウザでは [http://localhost:8086](http://localhost:8086) を開く。別端末のLAN利用ではHTTPの公開先は `http://<サーバーのLANアドレス>:8086` だが、マイク・カメラの利用にはブラウザが安全な接続と認める条件が必要である。通常のブラウザでは同じPCの `localhost` はHTTPでも対象となり、利用許可を与えて使える。

LANの別端末から使う場合は、管理下のHTTPS終端とブラウザが信頼する証明書を別途準備し、そのHTTPSのURLを開く。現在の `configs/Caddyfile` は `:80` のHTTPだけを提供する。Composeは `8086:80` と `8443:443` を公開するが、HTTPS・証明書は未設定であり、`8443` の公開だけでHTTPSは使えない。HTTPのLANアドレスではマイク・カメラを利用できるとは限らない。

通常利用ではトップページから次の導線を使います。

- `Simple Interface (VRM 1.0)`: 通常会話の正規導線
- `360deg Camera (VRM 1.0)`: 360 動画/カメラ向けの 実験用の導線
- `Looking Glass (VRM 1.0 / Three.js)`: [Looking Glass](https://lookingglassfactory.com/looking-glass-portrait) 向けの 実験用の導線

`Simple Interface (VRM 1.0)` の起動前設定で、Dify未設定なら会話モードを `sincro`（シンクロモード）へ変更してから「開始する」を押す。`sincro` は認識文を変換して読み上げ、Difyを使わない。初回の既定値は `chat` のため、設定を空にしただけではチャットは動作しない。

`sincromisor-frontend/package.json` では、`npm run build` が `tsc -p tsconfig.modern.json && vite build` に対応しており、通常ビルドでは `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm`、`motion-debug`、`pose-landmarker-spike` の6ページを出力します。実験用ページも通常ビルドに含まれ、分類と公開URLは[ページ構成](documents/design/frontend/pages.md)を参照してください。

Babylon.js ベースの旧ページ（`simple`、`glass`、`character`、`character-glass`、`area360`、`single`、`double`）と関連する旧実装は削除済みです。通常の開発・確認は `sincromisor-frontend` で `npm run build` を使ってください。

## キャラクターを差し替える

キャラクターモデルは[VRM-1.0形式](https://vrm.dev/vrm1/)のものが利用できます。
最初の設定ダイアログで、利用したいVRMモデルを選択、またはドラッグ&ドロップしてください。
登録したVRMファイルは、ブラウザのキャッシュとして保持されます。サーバーにアップロードはされません。

デフォルトのモデルを差し替えたい時は、サーバーのファイル
`sincromisor-frontend/public/characters/default.vrm`を差し替えてください。

## 音声認識の固有名詞辞書を追加する

音声認識の固有名詞辞書は `speech-recognizer` コンテナに
読み込ませます。固有名詞補強は `SINCRO_RECOGNIZER_MODEL=nemo` を前提にしています。

1. 辞書配置用ディレクトリを作成します。

```sh
$ mkdir -p volumes/proper-noun-dictionaries
```

2. UTF-8 の CSV で辞書ファイルを作成します。
   最低限 `surface` と `yomi` が必要です。運用上は
   `surface,yomi,priority,category,enabled,ambiguous` の構成を推奨します。
   **ヘッダが適切に記述されていないとエラーになります。注意してください。**

```csv
surface,yomi,priority,category,enabled,ambiguous
Sincromisor,しんくろみそーる,200,product,true,false
ピカチュウ,ぴかちゅう,100,pokemon,true,false
タブンネ,たぶんね,100,pokemon,true,true
たぶんね,たぶんね,10,common,true,true
```

3. 作成した CSV を `volumes/proper-noun-dictionaries/` 配下へ置きます。
   たとえば `volumes/proper-noun-dictionaries/proper_nouns.csv` のようなパスにします。

    `speech-recognizer` コンテナは非rootユーザーで動作するため、権限が厳しすぎると
    辞書を読めません。配置後に次のスクリプトで権限を整えておくのを推奨します。

```sh
$ ./utils/setup/proper_noun_dictionary.sh
```

このスクリプトは `volumes/proper-noun-dictionaries/` 配下を
`directory=755`、`file=644` にそろえます。あわせて `.csv` の先頭行を確認し、
`surface,yomi,priority,category,enabled,ambiguous` ヘッダが無ければ自動で補います。
個別パスを指定することもできます。

```sh
$ ./utils/setup/proper_noun_dictionary.sh volumes/proper-noun-dictionaries/proper_nouns.csv
```

4. ルートの `.env` を更新します。

```dotenv
SINCRO_RECOGNIZER_MODEL=nemo
SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=true
SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH=/opt/sincromisor/proper-noun-dictionaries/proper_nouns.csv
```

必要に応じて、confirmed 時の補強を強めたい場合は以下も有効化できます。

```dotenv
SINCRO_RECOGNIZER_PROPER_NOUN_CONTEXT_BIASING_ENABLE=true
SINCRO_RECOGNIZER_PROPER_NOUN_NBEST_ENABLE=true
```

5. `speech-recognizer` コンテナを再作成して反映します。

```sh
$ docker compose --profile full up -d speech-recognizer
```

6. ログを確認し、辞書がロードされていることを確認します。

```sh
$ docker compose logs speech-recognizer
```

`Proper noun dictionary loaded:` が出力されれば、辞書ファイルのマウントと読み込みは成功です。
反映されない場合は、CSV のヘッダ、`.env` の `SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH`、
`volumes/proper-noun-dictionaries` 配下のファイル配置、ディレクトリ/ファイル権限
（`755/644`）を見直してください。

## チャットモードを利用する

`chat` は管理下の環境に配置したDifyとLLMを使う。Dify上でローカルLLMへ接続するチャットボットを作り、そのアプリのAPIキーを発行する。DifyとLLMの配備はSincromisorのComposeには含まれない。

リポジトリのルートの `.env` に、`text-processor` コンテナから到達できるDifyのAPI URLとキーを設定する。値は `compose/text-processor.yml` の環境変数を経由してPython設定へ渡る。

```dotenv
SINCRO_PROCESSOR_DIFY_URL=http://192.168.1.20/v1
SINCRO_PROCESSOR_DIFY_TOKEN=app-xxxxxxxxxxxxxxxxxxxxxxxx
```

上記は例示であり、Difyを配置したホストのLANアドレスや、共有Dockerネットワークで解決できるサービス名へ置き換える。ポートが異なる場合はURLへ含める。`127.0.0.1` は `text-processor` コンテナ自身を指すため、別コンテナやホスト上のDifyの接続先には使えない。

設定後はリポジトリのルートでコンテナを再作成して反映する。

```sh
docker compose --profile full up -d text-processor
```

ブラウザの起動前設定で `chat` を選び、開始する。Difyと接続先LLMも管理下で動かし、外部サービスのAPI認証を前提にしない。

### チャットモードの表情連動を使う場合（Dify/LLM設定が必須）

チャットモードでは、LLM応答の先頭2文字に `^N`（感情コード）を付けると、
フロントエンドがそれを表情ヒントとして解釈し、VRMの目/眉の表情を切り替えます。

この機能は **Dify側のプロンプト設定が必須** です。設定されていない場合、応答本文は表示されますが表情は変化しません。

- 感情コード（応答先頭に1回だけ出力）
    - `^0` = 標準（neutral）
    - `^1` = 楽しい（relaxed）
    - `^2` = 悲しい（sad）
    - `^3` = 怒り（angry）
    - `^4` = 喜び（happy）
    - `^5` = 驚き（surprised）

- 出力例

```txt
^4それはいいですね。すぐに試してみましょう。
```

- Dify/LLMへの指示例（そのまま利用可）

```txt
重要: 各応答の先頭に、感情コードを必ず1回だけ付けてください。
形式は半角2文字で ^N です（N は 0〜5）。

感情コード対応:
^0 = 標準（neutral）
^1 = 楽しい（relaxed）
^2 = 悲しい（sad）
^3 = 怒り（angry）
^4 = 喜び（happy）
^5 = 驚き（surprised）

出力ルール:
- 応答の先頭は必ず ^N で開始する
- ^N の直後に本文を続ける（改行しない）
- 感情コードは先頭の1回だけ出力する
- 本文中では ^0〜^5 を感情指定として使わない
- 感情が不明な場合は ^0 を使う
```

注意:

- `^N` はサーバー側で自動的に除去されるため、通常はチャット表示や音声合成には含まれません。
- `text-processor` / `sincro-rtc` のどちらか片方だけ更新すると、表情コードが `text_ch` へ伝搬しない場合があります。通信仕様変更を含むため、関連コンテナを合わせて再デプロイしてください。

## 処理を分散させる

VRAM不足などで全てのワーカーコンテナを同じホスト内で動作させることができない場合や、
ユーザー数の増加によりひとつのホストで全ての要求を捌ききれない場合は、
各ワーカーを異なるホスト上で動作させることができます。

## OBSで利用する場合

### カメラ・マイクの利用許可

デフォルトではブラウザソースのカメラ・マイク利用許可ダイアログの操作ができません。
そのため、コマンドラインで自動的に許可するようにする必要があります。
そのままではデバッグコンソールなども利用できないため、ついでにリモートデバッグポートも開けておくと便利です。

```bat
cd "C:\Program Files\obs-studio\bin\64bit"
obs64.exe --enable-media-stream ^
          --use-fake-ui-for-media-stream ^
          --auto-accept-camera-and-microphone-capture ^
          --autoplay-policy=no-user-gesture-required ^
          --remote-debugging-port=9222
```

### キャラクターの制御に利用するカメラ・マイクの設定

Google Chromeの設定を変えると、Chromium Embedded Framework側にも反映されます。
カメラについては、OBSで利用するカメラやキャプチャーボードと重複すると動作しなくなるので注意してください。

- <chrome://settings/content/camera>
- [chrome://settings/content/microphone](chrome://settings/content/camera)

## 音声認識・合成をコマンドラインで使いたい

[SincromisorCLI](https://github.com/Sincromisor/SincromisorCLI)を用いると、
コマンドライン経由での音声認識・合成・テロップ用テキストの取得ができます。
