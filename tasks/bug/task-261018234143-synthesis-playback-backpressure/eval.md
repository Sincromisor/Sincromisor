# 評価: task-261018234143-synthesis-playback-backpressure

## 判定

PASS

## 根拠

- 変更前の `outbound.go` を重ねた再現試験では、9件目で `speech queue is full` となることを独立に確認した。修正後の `TestSynthOutputBackpressureWaitsThenPlaysEveryRequest` は24要求を順番どおり再生し、テロップ、有限保持、キューの消費完了を確認する。
- `EnqueueChunk` は順序状態を値コピーして検証し、先読み制限による拒否時には状態を更新しない。再試行は世代ロックを解放して20ms間隔で行い、再試行時の世代検査と既存の破棄処理を通す。取消、出力終了、世代変更による解除の回帰試験も通過した。
- 未再生PCMは通常0.8秒未満に抑え、既存の要求件数・音声量の上限と単一区間・終端の検証を維持する。Coordinatorの5秒配送期限とPythonの30秒送信期限に対し、通常の一区間の待機は最大0.5秒程度となる。
- [独立接続試験](acceptance/processor_ping_backpressure_test.go) は本番のProcessorとSynthesizerを接続し、8要求の未完了枠と10件目の結果配送待機を作る。短いPong期限で旧切断を再現し、Pong期限を設けない場合は待機解除後に応答が戻ることを確認した。サーバー側も並行して読み取り、試験サーバーの停止による誤検知を避けた。
- TextProcessorの実Uvicorn試験は、旧設定での1011切断と、修正設定での周期Ping維持、遅延Pongの復帰、送受信継続の2ケースが通過した。設定値は本番入口から取得する。Pong期限で無応答接続を検知できなくなる制約は、[TextProcessor設計](../../../documents/design/backend/services/text-processor.md) に記録されている。
- 独立確認で `go test -race ./internal/media/output ./internal/rtc ./internal/pipeline/...` と上記接続試験、同対象の `go vet` が通過した。変更PythonのRuff検査・整形検査も通過した。
- 実装者の実Python/VOICEVOX試験はrace検査付きで通過した。253区間・1,205,760サンプル（25.12秒）を本番Sessionへ渡し、有声音を141ms後、終端を24,836ms後に確認し、末尾の消費完了、音声中止なし、セッションの継続も確認した。長い試験で露見した既存の入力準備不足は、ブラウザーから無音を送り入力準備を待つ修正で解消した。
- [RTC設計](../../../documents/design/backend/services/sincro-rtc.md) と [音声パイプライン契約](../../../documents/design/contracts/audio-pipeline-websocket.md) は先読み制限、再試行、世代・取消、Pongの扱いと同期している。外部メッセージ形式は変わらない。変更した処理と直接の補助処理のコメントを点検し、待機、上限、所有者、順序状態、終了の説明を確認した。コメント点検: PASS。

### 独立接続試験の再実行

リポジトリルートで次を実行する。試験をGoの重ね合わせ機能で既存の `client` パッケージへ追加し、本番ファイルと実装者の試験は変更しない。実行にはループバック接続の許可が必要となる。

```sh
python3 - <<'PY'
import json
from pathlib import Path

root = Path.cwd()
source = root / "tasks/bug/task-261018234143-synthesis-playback-backpressure/acceptance/processor_ping_backpressure_test.go"
virtual = root / "sincromisor-server/sincro-rtc/internal/pipeline/client/evaluation_processor_ping_test.go"
overlay = Path("/tmp/sincro-evaluation-overlay.json")
overlay.write_text(json.dumps({"Replace": {str(virtual): str(source)}}))
PY
GOCACHE=/tmp/sincro-evaluation-go-cache go -C sincromisor-server/sincro-rtc test -race -overlay /tmp/sincro-evaluation-overlay.json ./internal/media/output ./internal/rtc ./internal/pipeline/...
```

## 残課題

- なし
