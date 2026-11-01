# 実装時の判断と確認

## 判断

未送信保留は既存出力キューと同じ16発話、PCM合計1MiB、単一要求はメタデータ用4KiBを除くPCMまでとした。MessagePack全体の1MiB検査は認識クライアントでも維持する。上限は待機や欠落で隠さず既存の世代再初期化へ渡す。

認識送信を世代内の専用処理へ分離し、応答の照合受理で起こす。表示・文章処理の待機中でも次の要求を送れる。Extractor全入力の単調性検査と、実送信した最大1件の照合を分けた。

## 確認

- `GOCACHE=/tmp/sincro-go-cache go test -race ./internal/pipeline/...`: PASS。遅い認識器で6差分が3要求になり、全PCM・発話ごとの確定・順序が一致した。追いつく場合の各暫定、未送信結果・重複結果の拒否、表示待ちとの分離、件数・バイト上限、取消・再接続・上限超過・送信失敗の回収も確認した。
- 実Python受信処理へ通常5差分と結合3差分を渡す `test_receive_buffer.py`: 2件PASS。同じ入力を変更前 `749889b1` のProcessへ渡す一時試験も2件PASS。変更前の個別送信・変更後の結合送信と旧/新Recognizerは同じ最終PCMを扱い、通番の欠番を許容する。通信モデルの移行は不要である。
- 採用NeMoで同梱 `sample01.wav`を16kHzへ変換し、200msごとの累積25要求と先頭後の残差を結合した2要求を比較した。確定認識の本文と最終PCMのSHA-256が一致した。[集計](artifacts/recognition-comparison.json)には各更新・確定の実行時間を残した。

NeMo比較の最初の要求はGPU準備込み18.95秒で、後続とは条件が異なる。時間の改善率は算出しない。準備後の旧暫定は約382〜652ms、旧確定763ms、結合後の確定814msであり、要求数の削減と単一推論の時間は別に評価する。Goの `pending_ms`、Recognizerの `queue_wait_ms` / `execution_ms`、表示の更新間隔を区別する。固定音声の分割比較は会話全体の遅延や聴感の測定ではない。

実モデル比較はルートの採用Python環境で、変更対象の `speech-recognizer-nemo/src`、`sincro-models/src`、`sincro-config/src`を `PYTHONPATH`へ指定して再実行できる。

```sh
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 python tasks/performance/task-261101110037-recognizer-partial-coalescing/artifacts/compare_recognition.py sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/sample01.wav
```

固定音声のSHA-256は集計に記録した。会話本文・音声原本の追加添付は行っていない。固有名詞補正の確定条件とTextProcessorへの確定後だけの転送は維持した。
