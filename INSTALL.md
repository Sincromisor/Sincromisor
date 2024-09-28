# Sincromisor実行環境のインストールとサーバーの起動

## ポート開放

リバースプロキシ用に、HTTP(TCP/80)とHTTPS(TCP/443)が空いていればOKです。
WebRTCのシグナリングは別途STUNを介しておこなわれるため、
外向きの通信が遮断されていなければだいたい大丈夫です。

プロトコル単位でのフィルタリングがおこなわれている環境、
多段NAT下の環境などでは、うまく動作しない可能性が高くなります。

## 依存パッケージのインストール

Sincromisorの実行に必要なパッケージをインストールします。

```sh
$ sudo apt install curl xz-utils git opus-tools fdkaac libgl1 libglib2.0-bin libaio-dev
```

これらに加え、`cuda-toolkit`が必要です。
自身の環境に合わせて導入をおこなってください。

## Sincromisorの準備

メインのプログラムとなるSincromisorのインストールを行います。
インストール先は変更しても構いません。適宜読み替えてください。
またこの作業は、Sincromisorの動作専用のユーザーアカウントを別途作成し実行することをお勧めします。

```sh
$ sudo useradd -s /usr/sbin/nologin -m sincromisor
$ sudo mkdir -p /opt/sincromisor
$ sudo chown sincromisor:sincromisor /opt/sincromisor
```

### ソースコードの取得

```sh
$ sudo -u sincromisor git clone https://github.com/Phenomer/Sincromisor /opt/sincromisor
```

### 設定ファイルの作成

[`examples/config.yml`](examples/config.yml)を元に、設定ファイルを作成します。
すべてを1台のサーバー上で動作させる場合は、`ServerName:`を変更すればOKです。

```sh
$ cd /opt/sincromisor
$ sudo -u sincromisor cp examples/config.yml config.yml
```

複数のサーバーを用いて分散させたい時は、次の手順が必要です。

* すべてのサーバーのconfig.ymlの`host`、`port`、`url`を構成に合わせて書き換える
  * `host`、`port`: 動作するWorkerが待ち受けるIPアドレスとポート
  * `url`: Workerにアクセスする際に用いられるURL
* サーバーごとに、動作させたいWorkerの`launch`を`true`にする
  * そのサーバーで動かしたくないWorkerの`launch`を`false`にする

### 必要なアセット群や依存ライブラリのインストール、ビルド

`./install.sh`を実行すると、動作に必要なアセットと、uv(python)、nodejs、依存ライブラリがインストールされます。

```sh
$ cd /opt/sincromisor
$ sudo -u sincromisor ./install.sh
```

## VOICEVOX Engineの準備

下記WebサイトからVOICEVOXを動かしたい環境向けのバイナリをダウンとロードし、実行してください。
一般にGPU版のほうがレスポンスタイムが早くなることが多いですが、
NVIDIAのGPU、もしくはWindowsとDirectML対応のGPUが必要となります。

* [VOICEVOX Engine](https://github.com/VOICEVOX/voicevox_engine)

```sh
$ ./run --host 0.0.0.0 --port 50021
```

systemdのserviceとして起動したい場合は、`examples/voicevox.service`を参考にしてみてください。

## Redisの準備

aptからinstallしたものが利用できます。
詳細は
[公式マニュアル](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/install-redis-on-linux/)
などを参照してください。

```sh
$ sudo apt install redis
```

redisには合成した音声のキャッシュが蓄積されます。よく参照されるものだけがメモリ上に残るよう、
`maxmemory`と`maxmemory-policy`を下記のように設定しておくとよいと思われます。

```conf
bind 0.0.0.0
maxmemory 2gb
maxmemory-policy allkeys-lru
```

maxmemoryのサイズは、環境に合わせて適宜変更してください。

## リバースプロキシの準備

静的コンテンツ(`/opt/sincromisor/sincromisor-client/dist`)を配布するためのHTTPサーバーと、
WebRTCのOfferを受け取るサーバーへのリバースプロキシを兼ねる、リバースプロキシサーバーが必要です。

クライアントとサーバー間のWebRTCの通信については、
最初のシグナリング(SDP offerとanswerのやり取り)以外はリバースプロキシを介さない点に注意してください。

### Caddyの場合

[Caddyfileの例](examples/Caddyfile.rproxy)を参考にしてください。
インターネット側からアクセスできるようになっていれば、
証明書はCaddyとLet's Encryptによって自動的に取得されます。
詳細は[Caddyのドキュメント](https://caddyserver.com/docs/)を参照してください。

### Nginxの場合

[nginx.confの例](examples/nginx.conf)を参考にしてください。証明書は別途用意してください。

## Sincromisorサーバーの起動

`./start-server.sh`を実行します。

初回実行時に音声認識ワーカー内でモデルの取得とライブラリのビルドが行われます。
環境によって、利用できるようになるまで数分～数十分の時間がかかる可能性があります。
ビルド状況は`sincromisor-server/log/Launcher.log`などで参照できます。

## systemdのサービスユニット

[examples/sincromisor.service](examples/sincromisor.service)を参考にしてください。
