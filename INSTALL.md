# Sincromisor実行環境のインストール

## 依存パッケージのインストール
Sincromisorの実行に必要なパッケージをインストールします。

```sh
$ sudo apt install curl xz-utils git opus-tools
```

## Sincromisorの準備

メインのプログラムとなるSincromisorのインストールを行います。
インストール先は変更しても構いません。適宜読み替えてください。
またこの作業は、Sincromisorの動作専用のユーザーアカウントを別途作成し実行することをお勧めします。

```sh
$ sudo useradd -s /usr/sbin/nologin -d /opt/sincromisor -m sincromisor
$ sudo -u sincromisor git clone https://github.com/Phenomer/Sincromisor /opt/sincromisor
```

`./install.sh`を実行すると、必要なファイルと、rye(python)とnodejs、依存ライブラリがインストールされます。

```sh
$ cd /opt/sincromisor
$ sudo -u sincromisor ./install.sh
```

## VOICEVOX Engineの準備

下記WebサイトからVOICEVOXを動かしたい環境向けのバイナリをダウンとロードし、実行してください。
一般にGPU版のほうがレスポンスタイムが早くなることが多いですが、NVIDIAのGPU、もしくはWindowsとDirectML対応のGPUが必要となります。

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

## Nginxの準備
リバースプロキシサーバーとしてnginxを利用する場合、[nginx.confの例](examples/nginx.conf)を参考にしてください。
クライアントとサーバー間のWebRTCの通信については、最初のSDP offerのやり取り以外はnginxを介さない点に注意してください。
