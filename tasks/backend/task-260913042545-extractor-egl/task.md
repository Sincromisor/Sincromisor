# 音声区間抽出コンテナの共有ライブラリ不足を修正

## 背景 / 目的

音声区間抽出の `latest` が `libEGL` 不足で起動できないとの報告を調査し、コンテナを修正して動作を確認する。

## 完了条件

- [x] 手元の `latest` の起動失敗を再現し、不足依存を特定する。
- [x] Dockerfileに必要な共有ライブラリと分類器初期化の検査を追加する。
- [x] 修正イメージをビルドし、HTTP状態応答とWebSocket経由の音声区間抽出を確認する。

## 変更範囲・判断

変更対象は `Docker/speech-extractor/Dockerfile`。MediaPipeの音声分類器もEGL/GLESにリンクするため、GPUを使わない場合も `libegl1` と `libgles2` を導入する。`import` だけでは遅延ロードされる共有ライブラリの不足を検出できないため、ビルド中に既存の `SpeechExtractorWorker.setup_model()` を実行し、分類器を閉じる。

再ビルド時に先行する `apt-get update` のレイヤーだけがキャッシュされ、apt一覧のキャッシュマウントが空だとパッケージを取得できないことも再現した。同じ導入処理内で一覧を更新する。

通信契約・設定・音声区間判定は変更しないため、設計文書の同期は不要。公開レジストリへの配布と稼働中環境の切り替えは含めない。

## 調査・確認結果

- 手元の `ghcr.io/sincromisor/speech-extractor:latest`（イメージID `5f6121b08fa8`）を `--network none` で起動すると、`SpeechExtractorWorker.setup_model()` 内のMediaPipe共有ライブラリ読み込みで `OSError: libEGL.so.1`、終了コード1を再現した。
- 同イメージのMediaPipe共有ライブラリを `ldd` で調べ、`libEGL.so.1` と `libGLESv2.so.2` の両方が `not found` と確認した。
- `docker build -f Docker/speech-extractor/Dockerfile -t sincromisor-extractor:egl-check .` が成功し、ビルド内のYAMNet分類器初期化・終了も成功した。
- 専用の内部ネットワークと一時Consulを使い、修正イメージを既定のCMDで起動した。Consul登録成功、`/api/v1/SpeechExtractor/statuses` のHTTP 200と `worker_type=SpeechExtractor`、`sessions=0` を確認した。
- コンテナ内のWebSocketクライアントから初期化要求を送り、既存の `sincro-rtc/internal/gate3/testdata/gate3-input.wav`（16 kHz、16 bit、モノラル）と2秒の無音を6,400バイトずつ送信した。15秒の受信制限内に抽出結果6件を受信し、セッションID一致、連番、非空音声、最終結果の `confirmed=True` をassertで確認した。
- 修正イメージの `ldd` でEGL/GLESが解決され、`not found` がないことを確認した。検証用コンテナとネットワークは終了・削除した。
- コメント点検: PASS。GPU未使用でも依存が必要な理由と、importだけでは不十分な検査理由を記載した。
- 公開済み `latest` の更新と稼働中環境の切り替えは未実施。ローカル検証用タグ `sincromisor-extractor:egl-check` を作成した。
