# APTのビルドキャッシュ保持と導入パッケージを適正化する

## 背景 / 目的

2026-10-18、HEAD `d9e4916b` を調査した。[RTC](../../../Docker/sincro-rtc/Dockerfile) はキャッシュマウントしたAPTの一覧を同じ命令内で削除している。
APTキャッシュを使う他のUbuntu系Dockerfileにも `docker-clean` 対策がなく、ダウンロード済みパッケージの保持は未確認である。多くの導入処理で `--no-install-recommends` も省略されている。
キャッシュの再利用を有効にし、実行に不要な推奨パッケージの導入を避ける。

## 完了条件

- [x] RTCでマウントされたAPT一覧の不要な削除をやめ、変更対象のAPTキャッシュがビルド間で再利用できる。
- [x] 基底イメージのAPT設定を確認し、自動削除がキャッシュを空にする場合に限って保持設定を変更する。APTの排他制御を維持する。
- [x] 対象のパッケージ導入を必要な依存に絞り、推奨パッケージが実行上必要なら明示する。
- [x] NeMoのTriton向けコンパイラー・Pythonヘッダー、MediaPipeの共有ライブラリ、FFmpeg・Opusなど既存の実行要件を満たす。

## 変更範囲・実装方針

対象は `Docker/{sincro-rtc,speech-extractor,speech-recognizer-nemo,text-processor,voice-synthesizer,voicevox}/Dockerfile` のAPT処理。
基底イメージが持つ `/etc/apt/apt.conf.d/docker-clean` などの設定とキャッシュマウント先を確認する。
既存の `sharing=locked` を維持し、キャッシュ外のパッケージ一覧を実行イメージへ残さない。
廃止済みMinIOやキャッシュ未使用のVectorへの横展開、基底OSの変更、ホストのキャッシュ削除・GC変更は含めない。

## 確認方法

- 変更した各イメージを対象にビルドし、追加・削減したOS依存の利用箇所を確認する。NeMoでは実行時コンパイラーとPythonヘッダーの存在・利用可能性を確認し、GPU依存部分の未実施範囲は明記する。
- 小さい対象のAPT段階を使い、保持設定とパッケージキャッシュの内容を確認する。命令を再実行する場合も対象段階だけに絞り、全体の `--no-cache` は使わない。
- RTCの一覧削除がなくなり、MediaPipeの既存初期化検査と利用するFFmpeg・Opusコマンドが成功することを確認する。

## 文書同期・実行上の制約

通信・保存契約は変更しない。APTキャッシュの方針を記述する場合は [Docker Compose管理ルール](../../../documents/rules/docker-compose.md) と整合させる。
ビルドと後片付けも同ルールに従い、不要なパッケージの削減量は実測した場合だけ記載する。

## 実装・確認結果

対象6イメージをdefaultビルダー（unix:///var/run/docker.sock、linux/amd64）でビルドし、すべて成功した。Ubuntu 24.04とCUDA 13.0.3のdocker-cleanによるdeb削除を実物で確認して解除し、sharing=lockedを維持した。推奨依存を無効化し、HTTPS用ca-certificatesとNeMo用libc6-devを明示した。MediaPipeは共有ライブラリを供給するlibglib2.0-0t64へ絞った。

別のAPT命令でcurlを再導入し、追加取得0 Bとdeb・一覧の保持を確認した。マウント外には空のlock以外の一覧・debがない。初回の非混入検査はlockも禁止して失敗したため、残存ファイルを特定して検査を修正した。MediaPipe分類器初期化、NeMo読み込み、Python.hを使ったgccコンパイル、FFmpeg・Opus、ConsulとVOICEVOX起動ファイルの存在を確認した。GPU推論は未実施。

検証入力はHEADのgit archiveに対象差分を反映した一時ディレクトリとし、実設定・未追跡生成物を含めていない。全ビルドは--output type=cacheonlyで実施し、新規イメージタグ・ID・永続コンテナは作成していない。キャッシュは後続タスクと通常ビルドで再利用し、既存GC（未使用60日、空き94.06GiB確保、上限375.3GiB）に従う。ホストのGC設定・既存資産は変更していない。コメント点検: PASS。

開始時のキャッシュ81.17GBから114.3GBへ約33.13GB増加し、空き容量は174GBから143GBとなった。新規イメージはなく、検証用コンテナは残っていない。
