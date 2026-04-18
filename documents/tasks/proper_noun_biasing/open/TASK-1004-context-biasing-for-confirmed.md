# TASK-1004 confirmed 時の context biasing 導入

- 作成日: 2026-04-12
- ステータス: Open
- 優先度: Medium

## 目的

NeMo の context biasing を confirmed 専用の強化経路として導入し、固有名詞や曖昧語の候補選定に使う。

## 関連設計

- `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
- `documents/design/backend_speech_recognizer_proper_noun_dictionary.md`

## スコープ

- NeMo の decoding strategy 切替
- 辞書から `surface` ベースの key phrases を生成する処理
- confirmed 時のみ biasing を有効化する経路
- feature flag による ON/OFF
- baseline と biasing 結果の採用判断、および raw 結果の記録
- TASK-1000 の調査結果で実装可能と判定された方式に限定する

## TASK-1000 前提メモ

- `boosting_tree` は NeMo に存在するが、現行既定の `alsd` では `NotImplementedError` になる。
- 初期導入は `strategy='malsd_batch'` の confirmed 専用再デコードとして設計する。
- biasing 結果を常時採用せず、baseline との比較と trace 記録を前提にする。

## 非対象

- N-best 再ランキング
- n-gram LM
- TASK-1000 で未対応と判定された経路の新規実装

## 実装タスク

1. NeMo 側の confirmed 専用 decoding config を追加する。
2. 辞書の `surface` から key phrases を構築する。
3. `yomi` は後処理・曖昧性判定用とし、初期導入では biasing 入力に使わない。
4. TASK-1000 で利用可能と確認できた API に対して、`boosting_tree` または同等の context biasing 設定を組み込む。
5. confirmed 時のみ再デコードするフローを worker に追加する。
6. baseline と biasing 結果の採用ルールを定義し、非採用側も trace に残す。
7. 追加デコードが不可能または高コストな場合の fallback を明文化する。

## 想定変更箇所

- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py`
- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py`
- `examples/compose.env`

## 完了条件

- context biasing の ON/OFF が設定で切り替えられる。
- confirmed 時のみ追加デコードされる。
- key phrase が `surface` ベースで生成される。
- TASK-1000 で確認した制約から逸脱していない。
- 代表固有名詞で baseline より改善が確認できる。
- baseline と biasing の比較結果を後から追跡できる。

## 確認

- biasing 有効/無効の比較テストを行う。
- `surface` と `yomi` の取り違えがないことを確認する。
- 遅延増分をログで確認する。
