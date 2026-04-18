# speech-recognizer-nemo

音声認識サービスです。

## Proper Noun Biasing のテスト実行

`speech-recognizer-nemo` では、固有名詞補強まわりの単体テストを `unittest` ベースで管理します。現時点では pytest 専用機能を前提にせず、workspace 標準の `uv run python -m unittest` を採用します。

```sh
uv run python -m unittest discover -s sincromisor-server/speech-recognizer-nemo/tests -p 'test_*.py'
```

個別実行例:

```sh
uv run python -m unittest sincromisor-server/speech-recognizer-nemo/tests/test_proper_noun_dictionary.py
uv run python -m unittest sincromisor-server/speech-recognizer-nemo/tests/test_recognizer_post_processor.py
uv run python -m unittest sincromisor-server/speech-recognizer-nemo/tests/test_speech_recognizer_nemo_worker.py
```

## Proper Noun Biasing の trace 確認

- confirmed 結果を `voice_log_dir` 付きで出力すると、`<session>/<speech_id>_<timestamp>.json` と同じ並びで `.trace.json` が保存されます。
- `.json` には下流へ返した最終 `SpeechRecognizerResult`、`.trace.json` には `raw_result`、`corrected_result`、`deferred_entries`、`context_biasing`、`nbest_reranking` などのデバッグ情報が入ります。
- 手動評価セットと確認観点は `documents/tasks/proper_noun_biasing/TASK-1006-evaluation-dataset.csv` と `documents/tasks/proper_noun_biasing/TASK-1006-manual-verification.md` を参照してください。
