# TASK-1001 辞書ロード基盤と設定追加

- 作成日: 2026-04-12
- ステータス: Open
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

## 確認

- 単体テストで辞書ロードと正規化を確認する。
- 辞書あり/なしの両方でプロセス起動確認を行う。
