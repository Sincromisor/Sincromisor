# Sincromisor

Webブラウザ上でかわいいキャラになっておしゃべりしたり、かわいいキャラとおしゃべりしたりできるよ!

![Sincromisor](documents/images/sincromisor.jpg)
![配信画面の例](documents/images/sincromisor-example.png)

## 必要なもの

* サーバー側
  * Linuxサーバー(x86_64)
  * Transformersが動作するNVIDIA GPU
    * シンクロモード: VRAM 4GB(nemo)、8GB(nue)。
    * チャットモード: 追加で8GB程度、合計16GB以上のVRAMが必要(Dify用)
  * [Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
  * [NVIDIA Driver(nvidia-open)](https://www.nvidia.com/en-us/drivers/)
  * [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
* クライアント側
  * GPUがそこそこの性能のPC、スマートフォン、タブレット
  * マイク
  * カメラ
  * Webブラウザ
  * かわいいVRM-1.0モデル

## 検証済み環境

* サーバー側(シンクロモード)
  * ubuntu 24.04
    * Core i5-12600K
    * RTX3060(12GB)
    * DDR4-3200 64GB

* サーバー側(チャットモード)
  * ubuntu 24.04
    * Core i5-14500
    * RTX4060Ti(16GB)
    * DDR5-5600 64GB

* クライアント側
  * Windows 11(Ryzen 2500U)
  * Pixel 6
  * iPad Air(gen3)

## とにかくローカル環境でサーバーを動かす

最初に、NVIDIA DriverとContainer Toolkitが正常に動作し、
コンテナ内で`nvidia-smi`コマンドでGPUの状態を見れるところまでをがんばってください。

Sincromisorのシンクロモードは、[docker compose](https://docs.docker.com/compose/)を用いると、比較的簡単に実行できます。

まずはソースコードを入手します。

```sh
$ git clone https://github.com/Sincromisor/Sincromisor.git
$ cd Sincromisor
```

設定ファイル`.env`を、`examples/compose.env`を参考に作成します。
とりあえず動かしたいだけであれば、そのままコピーする形でかまいません。

```sh
$ cp examples/compose.env .env
$ chmod 600 .env
```

`docker compose up`で実行します。
`--profile full`を指定すると、必要なコンテナ全てが実行されます。

```sh
$ docker compose --profile full up -d
```

## クライアント側のつかいかた

サーバーを実行したら、[http://localhost](http://localhost) にアクセスします。

通常利用ではトップページから次の導線を使います。

* `Simple Interface (VRM 1.0)`: 通常会話の正規導線
* `360deg Camera (VRM 1.0)`: 360 動画/カメラ向けの experimental 導線
* `Looking Glass (VRM 1.0 / Three.js)`: [Looking Glass](https://lookingglassfactory.com/looking-glass-portrait) 向けの experimental 導線

`sincromisor-frontend/package.json` では、`npm run build` が `tsc -p tsconfig.modern.json && vite build` に対応しており、通常ビルドでは `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm` を出力します。

Babylon.js ベースの旧ページ（`simple`、`glass`、`character`、`character-glass`、`area360`、`single`、`double`）と関連する legacy 実装は削除済みです。通常の開発・確認は `sincromisor-frontend` で `npm run build` を使ってください。

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

チャットモードで利用したい時は、別途[Dify](https://dify.ai/jp)が必要となります。
また、Dify上でローカルLLMを利用したい場合は、[Ollama](https://ollama.com/)や
[fake-openai-server](https://github.com/Sincromisor/fake-openai-server)などが必要となります。

Difyでてきとうにチャットボットを作成したら、そのURLとAPIキーを`configs/.env`ファイルに記入し、コンテナを再起動してください。

```sh
SINCRO_PROCESSOR_DIFY_URL=http://127.0.0.1/v1
SINCRO_PROCESSOR_DIFY_TOKEN=app-W3Ef43iyPCBVfz47UDwGTHKU
```

### チャットモードの表情連動を使う場合（Dify/LLM設定が必須）

チャットモードでは、LLM応答の先頭2文字に `^N`（感情コード）を付けると、
フロントエンドがそれを表情ヒントとして解釈し、VRMの目/眉の表情を切り替えます。

この機能は **Dify側のプロンプト設定が必須** です。設定されていない場合、応答本文は表示されますが表情は変化しません。

* 感情コード（応答先頭に1回だけ出力）
  * `^0` = 標準（neutral）
  * `^1` = 楽しい（relaxed）
  * `^2` = 悲しい（sad）
  * `^3` = 怒り（angry）
  * `^4` = 喜び（happy）
  * `^5` = 驚き（surprised）

* 出力例

```txt
^4それはいいですね。すぐに試してみましょう。
```

* Dify/LLMへの指示例（そのまま利用可）

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
* `^N` はサーバー側で自動的に除去されるため、通常はチャット表示や音声合成には含まれません。
* `text-processor` / `sincro-rtc` のどちらか片方だけ更新すると、表情コードが `text_ch` へ伝搬しない場合があります。通信仕様変更を含むため、関連コンテナを合わせて再デプロイしてください。

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

* <chrome://settings/content/camera>
* [chrome://settings/content/microphone](chrome://settings/content/camera)

## 音声認識・合成をコマンドラインで使いたい

[SincromisorCLI](https://github.com/Sincromisor/SincromisorCLI)を用いると、
コマンドライン経由での音声認識・合成・テロップ用テキストの取得ができます。
