# 音声区間抽出サービス

## 目的

受信PCMから発話区間を組み立て、認識へ差分音声と終端確定を渡す。現在の責務と動作は[SpeechExtractor設計](../../documents/design/backend/services/speech-extractor.md)を参照する。

## 発話終端の比較評価

利用許可済みの16kHz・モノラル・符号付き16ビットPCM WAVと、同じWAVへの事前注釈を用意する。小声、息継ぎ、言いよどみ、短い応答、無音閾値前後の間を含める。録音と注釈は非公開領域で管理し、実行前に録音を聞いて注釈を確定し、実行結果へ合わせて変更しない。

注釈JSONは次の形とする。位置は入力WAV先頭から数えたサンプル数、`speech`は実際に声のある半開区間の列、`endpoint_sample`は応答してよい終端である。同じ発話内の区間間隔は、まだ話し途中の間として扱う。発話・区間は時刻順に並べ、重複させない。無音のみの録音では`turns`を空配列にし、誤った確定を確認する。

```json
{
    "recording_id": "sample-01",
    "audio_sha256": "WAV全体のSHA-256を小文字64桁で記入する",
    "turns": [
        {
            "speech": [
                { "start": 8000, "end": 24000 },
                { "start": 48000, "end": 64000 }
            ],
            "endpoint_sample": 64000
        }
    ]
}
```

リポジトリルートで評価用依存を導入し、`sincromisor-server/`から実行する。モデルの事前配置はサービスの導入手順に従う。

```sh
uv sync --locked --group speech-extractor --group endpoint-evaluation
cd sincromisor-server
uv run --no-sync python -m speech_extractor.endpoint_evaluation \
    /path/to/sample.wav /path/to/annotations.json \
    --max-silence-ms 1000 --output /path/to/report.json
```

`--max-silence-ms`はchatの比較では`1000`、sincroでは`600`とする。旧方式は基点のYAMNet・200ms・最上位Speechスコア0.6超・先行500msを再現し、新方式は本番と共通のSileroと発話状態処理を使う。入力末尾のモデル単位未満の端数は処理済みサンプル数との差で示す。末尾に無音を自動追加しないため、無音不足で確定しない発話も未確定として残る。

比較結果は途中確定数、話し途中の間での確定数、未確定発話数、送信PCMから計算した語頭・語尾・全体の欠落サンプル数、応答可能終端から確定までの音声上の時間を示す。未確定の遅延は`null`であり、0msの成功ではない。`compute_ms`は時間を圧縮した逐次実行の処理時間であり、通信・本番の待ち行列・非同期推論中の発話再開を含まない。これらはサービスの並行処理試験で別に確認する。

モデルと入力・注釈のハッシュを記録する。集計に録音本文や保存先を出さなくても、公開前に[成果物の公開範囲](../../tasks/README.md#公開成果物と非公開検証原本)を確認する。指定した話し途中の例で新たな途中確定や欠落が増える候補は、速度だけ改善しても採用しない。録音未入手や人工音声の動作確認を、日本語実音声での品質改善と扱わない。端末の通信量・電力への影響は、このCLIの測定対象に含まれない。
