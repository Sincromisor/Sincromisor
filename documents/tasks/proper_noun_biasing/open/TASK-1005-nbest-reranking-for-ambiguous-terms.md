# TASK-1005 曖昧語向け N-best 再ランキング

- 作成日: 2026-04-12
- ステータス: Open
- 優先度: Medium

## 目的

confirmed 時に N-best 候補を取得し、辞書一致度と文脈を用いて曖昧語の最終候補を選び直す。

## 関連設計

- `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
- `documents/design/backend_speech_recognizer_proper_noun_dictionary.md`

## スコープ

- N-best 候補取得
- 再ランキングスコアの設計
- 曖昧語候補に対する最終採用ロジック
- ログとデバッグ情報の追加
- 採用候補と raw baseline 候補の保持
- TASK-1000 の調査結果で取得可能な候補形式に基づく実装

## TASK-1000 前提メモ

- N-best は `beam.return_best_hypothesis=False` で取得可能。
- 現行ラッパでは raw hypothesis が `list[Hypothesis]` になるため、再ランキング入力で正規化が必要。
- 候補 score は beam search score であり、そのまま確率として扱わない。
- 候補数は `beam_size` に依存するため、設定値を固定して比較可能にする。

## 非対象

- n-gram LM
- TASK-1000 で未対応と判定された N-best 取得方式の新規実装

## 実装タスク

1. TASK-1000 で実現可能と確認できた方法で、confirmed 時の N-best 候補取得を `SpeechRecognizerNemo` に追加する。
2. 候補数、score 定義、text 取得形式を固定する。
3. 辞書一致度、priority、周辺文脈、モデルスコアを使った再ランキング関数を実装する。
4. 曖昧語が含まれる場合のみ再ランキングを有効化する。
5. 採用候補と非採用候補をログへ残す。
6. 下流へ返した採用候補とは別に、raw baseline 候補と採用理由を trace に残す。

## 想定変更箇所

- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py`
- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py`
- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/`

## 完了条件

- 曖昧語を含むケースで N-best 再ランキングが動く。
- `タブンネ / たぶんね` のようなケースで baseline より誤補正が減る。
- feature flag で無効化できる。
- 候補取得形式と score の意味が文書化されている。
- 採用候補と raw baseline 候補の両方を後から追跡できる。

## 確認

- 曖昧語ケースの評価セットで比較する。
- 採用理由をログで追跡できることを確認する。
