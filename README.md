Sincromisor
===============
Webブラウザ上でかわいいキャラになっておしゃべりできるよ!


# 必要なもの
- Transformersが動作するGPU
    - VRAM 8GBは必須
- VOICEVOXとそれが動作する環境
- PCで利用できるマイク
- PCで利用できるカメラ

## 検証済み環境
- Windows 11(WSL ubuntu 22.04)
    - Core i5-12600K
    - RTX3060(12GB)
    - DDR4-3200 64GB


# キャラクターの制御に利用するカメラ・マイクの設定
Chromeの設定を変えると、Chromium Embedded Framework側にも反映されるってBing AIが言ってました。
カメラについては、OBSで利用するカメラやキャプチャーボードと重複すると動作しなくなるので注意してください。

- [chrome://settings/content/camera](chrome://settings/content/camera)
- [chrome://settings/content/microphone](chrome://settings/content/camera)


# OBSで利用する場合
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
