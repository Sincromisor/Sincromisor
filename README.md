# Sincromisor

Webブラウザ上でかわいいキャラになっておしゃべりできるよ!

## 必要なもの

* サーバー側
  * Transformersが動作するNVIDIA GPU
  * VRAM 8GBは必須、12GB以上推奨
  * VOICEVOXとそれが動作する環境
  * Redisとそれが動作する環境
  * HTTPS証明書が利用できるドメイン
* クライアント側
  * GPUがそこそこの性能のPC、スマートフォン、タブレット
  * マイク
  * カメラ

## 検証済み環境

* サーバー側
  * ubuntu 22.04
    * Core i5-12600K
    * RTX3060(12GB)
    * DDR4-3200 64GB

* クライアント側
  * Windows 11(Ryzen 2500U)
  * Pixel 6
  * iPad Air(gen3)

## インストールとサーバーの起動

* [Sincromisor実行環境のインストールとサーバーの起動](INSTALL.md)を参照してください。

## クライアント側のつかいかた

サーバーを実行したら、`https://サーバー名:8001` にアクセスするだけです。
リバースプロキシサーバーを建てている場合、そちらの設定に従ってアクセスしてください。

## ログについて

* [ログについて](src/log/README.md)を参照してください。

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

Chromeの設定を変えると、Chromium Embedded Framework側にも反映されるってBing AIが言ってました。
カメラについては、OBSで利用するカメラやキャプチャーボードと重複すると動作しなくなるので注意してください。

* <chrome://settings/content/camera>
* [chrome://settings/content/microphone](chrome://settings/content/camera)
