# TASK-1000 NeMo biasing / N-best 実現性スパイク

- 作成日: 2026-04-18
- ステータス: Done
- 優先度: High

## 目的

現在の `reazonspeech-nemo-asr` ベース実装で、context biasing と N-best 取得を実装可能か事前確認する。

## 関連設計

- `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
- `documents/design/backend_speech_recognizer.md`

## スコープ

- 現行 `SpeechRecognizerNemo` ラッパで利用可能な decode API の確認
- context biasing に必要な設定注入ポイントの確認
- N-best 候補取得の可否と返却形式の確認
- 実装方式ごとの制約、未対応点、レイテンシ影響の整理
- タスク 1004 / 1005 の前提条件の明文化

## 非対象

- 固有名詞辞書の実装
- 本番用の context biasing 実装
- 本番用の N-best 再ランキング実装

## 実装タスク

1. `SpeechRecognizerNemo` と依存ライブラリの decode API を確認する。
2. context biasing を有効化する方法があるか、ラッパ拡張で到達可能かを確認する。
3. N-best 候補を取得する方法があるか、候補数・score・text を取得できるかを確認する。
4. 実装不能または大規模改修が必要な場合は、その理由と代替案を整理する。
5. 結果を `documents/tasks/proper_noun_biasing/` または関連設計へ記録し、1004/1005 の前提条件を更新する。

## 想定変更箇所

- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py`
- `documents/tasks/proper_noun_biasing/`
- 必要に応じて `documents/design/backend_speech_recognizer_proper_noun_biasing.md`

## 完了条件

- context biasing 実装の可否が判断できる。
- N-best 取得の可否が判断できる。
- 必要な API 拡張点と制約が文書化される。
- TASK-1004 / TASK-1005 の着手前提が明確になる。

## 調査結果

- N-best 取得は可能。
    - `EncDecRNNTBPEModel.change_decoding_strategy()` で `beam.return_best_hypothesis=False` を指定すると、`model.transcribe(..., return_hypotheses=True)` の 1 要素目が `list[Hypothesis]` になる。
    - 現行既定の `alsd` でも候補列は返る。`beam_size=4` のスパイクでは上位 4 件を取得できた。
    - 候補ごとに `text` と `score` を取得できるため、TASK-1005 の再ランキング入力としては十分。
- context biasing の受け口は存在するが、現行既定の `alsd` ではそのまま使えない。
    - NeMo 側には `beam.boosting_tree` と `beam.boosting_tree_alpha` があり、`BoostingTreeModelConfig` に `key_phrases_list` を直接渡せる。
    - ただし `strategy='alsd'` のまま `boosting_tree` を入れると、`Model rnnt with strategy 'alsd' does not support n-gram LM models and boosting tree. Recommended beam decoding strategy with LM is 'malsd_batch'.` で失敗する。
    - `strategy='malsd_batch'` へ切り替えると `boosting_tree` 付きデコードは実行できた。
- partial 用の既存軽量経路は維持すべき。
    - `malsd_batch` は `alsd` より重く、confirmed 専用の追加デコード経路として扱う前提が妥当。
    - `allow_cuda_graphs=False` で CPU スパイクは通った。実運用では GPU/CPU の挙動差を別途確認する。

## 実装メモ

- `SpeechRecognizerNemo` に以下のスパイク補助 API を追加した。
    - `build_decoding_config()`: 一時的な decoding strategy 構築
    - `transcribe_candidates()`: 候補列の取得
- `transcribe_with_score()` は raw hypothesis が `list[Hypothesis]` の場合も候補列を返すようにした。
- `transcribe()` は N-best 時でも先頭候補を `TranscribeResult` 本文へ反映し、候補列全体は raw hypothesis として保持するようにした。

## TASK-1004 前提条件

- confirmed 専用経路で `strategy='malsd_batch'` を使うこと。
- biasing 入力は辞書の `surface` から `key_phrases_list` を組み立てること。
- `alsd` ベースの既定経路へ直接 `boosting_tree` を注入しないこと。
- baseline 1-best と biasing 結果を両方記録し、採用判断を worker 側で行うこと。

## TASK-1005 前提条件

- 候補列は `list[Hypothesis]` を正規化して扱うこと。
- 候補 score は NeMo の beam search score であり、確率ではない前提で再ランキングすること。
- 候補数は decoding config の `beam_size` に依存するため、固定値を設定で持つこと。
- 1-best 本文と raw N-best 候補列を分けて保持すること。

## 再現手順

1. `sample02_f32le.raw` を入力に `beam.return_best_hypothesis=False` で実行し、候補列が返ることを確認する。
2. 同じ入力で `strategy='alsd'` のまま `boosting_tree` を設定し、`NotImplementedError` になることを確認する。
3. `strategy='malsd_batch'` に切り替えたうえで `boosting_tree` を設定し、デコードが完走することを確認する。

## 参照箇所

- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py`
- `.venv/lib/python3.12/site-packages/nemo/collections/asr/models/rnnt_bpe_models.py`
- `.venv/lib/python3.12/site-packages/nemo/collections/asr/parts/submodules/rnnt_decoding.py`
- `.venv/lib/python3.12/site-packages/nemo/collections/asr/parts/submodules/rnnt_beam_decoding.py`
- `.venv/lib/python3.12/site-packages/nemo/collections/asr/parts/context_biasing/boosting_graph_batched.py`

## 確認

- 調査結果に再現可能な参照箇所を残す。
- 必要であれば最小コードで取得結果を確認する。
