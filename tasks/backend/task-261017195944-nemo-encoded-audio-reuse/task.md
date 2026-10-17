# 確定音声の候補再試行でNeMoのエンコード結果を再利用する

## 背景 / 目的

確定音声では通常認識後に固有名詞補強とN-bestの再試行を行う場合がある。同じ音声を再びエンコードせず、先行タスクで分けたエンコード結果を一要求内で再利用する。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 先行タスク

- [task.md](../../../tasks/backend/task-261017195944-nemo-encode-decode-separation/task.md)（NeMo認識を前処理・エンコード・デコードへ分ける）

## 変更範囲

- [SpeechRecognizerNemo.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py)
- [SpeechRecognizerNemoWorker.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py)
- [test_speech_recognizer_nemo_worker.py](../../../sincromisor-server/speech-recognizer-nemo/tests/test_speech_recognizer_nemo_worker.py)

## 設計判断

- 一回のrecognizeがエンコード結果と有効長を所有し、通常認識と実際に必要になった再デコードだけへ渡す。別発話・別接続・暫定から確定への持越しはしない。
- 既存の補強機能の有効条件、曖昧候補がない場合の省略、補強採用後のN-best省略、候補順位付け、追跡記録を維持する。
- デコード設定の復元とGPUテンソルの参照解放を、成功・失敗・取消後の回収のいずれでも行う。共有モデルを同時実行しない。
- Workerの変更は通常結果から候補再試行へ同じエンコード結果を渡す範囲に絞り、辞書処理や保存処理の整理を混ぜない。

## 完了条件と確認方法

- [x] 再試行する条件を試験で作り、通常・補強・N-bestを通っても一要求のエンコードが1回であることを確認する。
- [x] 再試行しない場合、補強採用、補強不採用後のN-best、再デコード例外で従来の判断と設定復元を維持する。既存Worker試験を使う。
- [x] 先行タスクと同じ実モデル・固定音声で補強経路の変更前後を比較し、認識結果、候補順位、スコアを確認する。実行時間は参考として記録し、根拠のない改善率を合否条件にしない。
- [x] 文字列・候補順位の回帰や原因を説明できないスコア差があれば修正し、差を記録するだけで完了としない。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

暫定音声の差分推論、発話間キャッシュ、CUDA graphsの有効化、補強設定や辞書仕様の変更。

## 文書と契約

[speech-recognizer.md](../../../documents/design/backend/services/speech-recognizer.md)に変更後の所有者と処理の流れを反映する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [エンコーダー出力を受け取るrnnt_decoder_predictions_tensor](https://github.com/NVIDIA-NeMo/Speech/blob/v3.0.0/nemo/collections/asr/parts/submodules/rnnt_decoding.py)。

## 実装・確認結果

一回のrecognize内で通常・補強・N-bestへ同一のエンコード結果を渡し、再試行をデコードだけにした。内部入口transcribe_candidatesをdecode_candidatesへ置換し、辞書の採否・順位・追跡情報を維持した。設定は再デコードごとに復元し、要求内のテンソル参照は保存前に解放する。例外ログが保持するフレームからも参照を外す処理を、弱参照試験で再現した残留に対して追加した。通常・補強採用・補強不採用後のN-best・失敗・取消後の回収と再要求、既存Worker判断を含む19試験・7サブテストがPASS。Ruff・ty・整形はPASS（既存ファイル名N999と既存試験のSIM117を除外）。コメント点検: PASS（要求内所有、再利用範囲、例外のフレームと取消回収を点検）。

### 実モデル比較

[比較スクリプト](acceptance/compare_reuse.py)で、先行タスクと同じロック済みPython環境・RTX 5060 Ti・ReazonSpeechモデルを使用した。モデルは `reazon-research/reazonspeech-nemo-v2`、revision `33693408be76b7cba9fd4a7546a0a8772430211b`。入力は同梱 `sample02_f32le.raw`（SHA-256 `511ec18ce9b4b7fb9c3b1c47fc9d262fe98f37856a6eaf42829c6d7ed59cad09`）を既存通信と同じint16へ変換した。

旧経路の各回エンコードと、新経路の一回エンコードを照合し、通常1件・補強4件・N-best167件の文字列、順序、スコアが完全一致した。補強は `malsd_batch`、beam4、人工補強語「雪」「青空」、alpha1、CUDA graphs無効、N-bestは `alsd`、beam4を使用した。再利用後のテンソル参照解放と復元設定も一致した。NeMoは設定変更時に省略された既定フィールドを補完するため、復元の比較は旧経路の同じAPIによる補完後設定を基準とした。

エンコードは3回から1回。ウォームアップ後の単回参考時間は旧2.682秒、新1.943秒。短い固定音声の測定であり、本番負荷や一般的な改善率を示す値ではない。

再現時はリポジトリルートで次を実行する。モデル・ソースは読取専用で、ネットワークは使用しない。

```sh
docker run --rm --network none --gpus all \
  -e HF_HUB_OFFLINE=1 -e HF_HOME=/cache/huggingface \
  -v "$PWD/volumes/sincro-cache:/cache:ro" \
  -v "$PWD/sincromisor-server:/opt/sincromisor/sincromisor-server:ro" \
  -v "$PWD/tasks:/opt/sincromisor/tasks:ro" \
  --workdir /opt/sincromisor/sincromisor-server \
  --entrypoint /opt/sincromisor/.venv/bin/python sincro-deps-python:verify \
  /opt/sincromisor/tasks/backend/task-261017195944-nemo-encoded-audio-reuse/acceptance/compare_reuse.py
```

NeMoの非公開推論準備APIへの依存は先行タスクから継続する。ライブラリ更新時は同じ実モデル比較を行う。
