# TASK-1001 辞書ロード基盤と設定追加

- 作成日: 2026-04-12
- ステータス: Done
- 優先度: High

## 目的

固有名詞辞書 CSV を安全にロードし、recognizer から参照できる基盤を追加する。

## 関連設計

- `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
- `documents/design/backend_speech_recognizer_proper_noun_dictionary.md`

## スコープ

- 固有名詞辞書ローダの追加
- `surface,yomi,priority,category,enabled,ambiguous` のロード対応
- `normalized_yomi -> entries` 索引の生成
- recognizer 用の環境変数と起動引数の追加
- 無効行、重複行、曖昧語衝突のバリデーションとログ出力

## 非対象

- 実際のテキスト補正ロジック
- context biasing
- N-best 再ランキング

## 実装タスク

1. `speech-recognizer-nemo` 配下に辞書エントリと辞書ローダを追加する。
2. `yomi` の正規化処理を追加する。
3. `enabled=true` の行だけ実行時辞書へ採用する。
4. 同一 `yomi` の複数候補を検出し、`ambiguous` の昇格ルールを実装する。
5. `SINCRO_RECOGNIZER_PROPER_NOUN_*` 系の引数と環境変数を追加する。
6. ロード結果の件数、警告件数、曖昧語件数をログ出力する。

## 想定変更箇所

- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/`
- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/models/SpeechRecognizerNemoProcessArgument.py`
- `sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py`
- `examples/compose.env`
- `compose/speech-recognizer.yml`

## 完了条件

- CSV 辞書をロードできる。
- 曖昧語を検出し、実行時辞書へ反映できる。
- 辞書未設定時でも recognizer が従来どおり起動する。
- 代表的な不正入力に対して warning が出る。

## 実装結果

- `speech-recognizer-nemo` に `ProperNounDictionary` と辞書エントリ/統計モデルを追加した。
- `surface,yomi,priority,category,enabled,ambiguous` を CSV からロードし、`normalized_yomi -> entries` 索引を生成するようにした。
- `enabled=true` の行のみ実行時辞書に採用し、同一 `yomi` の複数候補は `ambiguous=true` へ自動昇格するようにした。
- 空欄行、重複行、不正 bool / priority、ひらがな以外を含む `yomi` を warning として集計するようにした。
- `SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE` と `SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH` を recognizer 引数・compose/env に追加した。
- recognizer 起動時に、辞書ロード件数・warning 件数・曖昧語件数をログ出力するようにした。

## 確認

- 単体テストで辞書ロードと正規化を確認する。
- 辞書あり/なしの両方でプロセス起動確認を行う。

## 確認結果

- `uv run ruff check ...` で対象ファイルの静的チェックを通した。
- `uv run python -m unittest sincromisor-server/speech-recognizer-nemo/tests/test_proper_noun_dictionary.py` で辞書ロード・正規化・必須列バリデーションを確認した。
- 辞書無効時は `Proper noun dictionary is disabled.` を出して空辞書で継続し、辞書有効時はロード失敗でも warning のみで継続する実装にした。
