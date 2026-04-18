# TASK-1006 Proper Noun Biasing 手動確認

## 目的

固有名詞補強の回帰確認を、単体テストだけでなく trace 観察込みで継続できるようにする。

## テスト実行方式

- Python テスト基盤は `unittest` を採用する。
- 依存追加は行わず、workspace 既定の `uv run python -m unittest` で実行する。

```sh
uv run python -m unittest discover -s sincromisor-server/speech-recognizer-nemo/tests -p 'test_*.py'
```

## 評価セット

- 代表文と負例は `documents/tasks/proper_noun_biasing/TASK-1006-evaluation-dataset.csv` を正本として扱う。
- 最低限、以下のカテゴリを毎回確認する。
  - 一意読み補正
  - 曖昧語保留
  - 文脈あり曖昧語
  - 固有名詞を含まない一般会話文
  - 部分一致しやすい短文

## trace 保存方式

- confirmed 結果で `voice_log_dir` が設定されている場合に、`SpeechRecognizerNemoWorker` が 2 種類の sidecar を保存する。
  - `<speech_id>_<timestamp>.json`
  - `<speech_id>_<timestamp>.trace.json`
- `.json` は下流へ返した最終結果、`.trace.json` は raw ASR result と補正判断の内訳である。
- trace の主な確認キー:
  - `raw_text`
  - `corrected_text`
  - `raw_result`
  - `corrected_result`
  - `matched_entries`
  - `deferred_entries`
  - `decode_path`
  - `decision_reason`
  - `context_biasing`
  - `nbest_reranking`

## 手順

1. `SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=true` を有効にし、辞書 CSV を設定する。
2. context biasing と N-best の確認時は、それぞれ対応する feature flag を有効にする。
3. confirmed 発話を 1 件ずつ流し、`TASK-1006-evaluation-dataset.csv` の期待値と最終表示テキストを比較する。
4. 同じ発話について `.trace.json` を開き、`raw_text` と `corrected_text` の差分、`decode_path`、`decision_reason` を確認する。
5. 曖昧語ケースでは `deferred_entries` の候補数、`context_hint`、`resolved_candidates` を確認する。
6. context biasing を有効にしたケースでは、`context_biasing.adopted` と `key_phrases` を確認する。
7. N-best を有効にしたケースでは、`nbest_reranking.ranked_candidates` と `selected_candidate` を確認する。

## 評価項目

- `false_positive_count`
  - 負例セットで、期待しない固有名詞置換が発生した件数。
- `non_dictionary_sentence_unchanged_rate`
  - 固有名詞を含まない一般会話文が無変化だった割合。
- `confirmed_latency_delta_ms`
  - 固有名詞補強 OFF 時と ON 時の confirmed 処理時間差分。

## 判定の目安

- `false_positive_count` は 0 を維持する。
- `non_dictionary_sentence_unchanged_rate` は 100% を目標にする。
- `confirmed_latency_delta_ms` は feature flag ごとの差分として記録し、増分傾向を比較できるようにする。
