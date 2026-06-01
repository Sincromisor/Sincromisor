# TASK-1002 confirmed 時の一意読み辞書補正

- 作成日: 2026-04-12
- ステータス: Done
- 優先度: High

## 目的

`confirmed=True` の認識結果に対して、読みが一意な語だけを対象に辞書補正を適用する。

## 関連設計

- `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
- `documents/design/backend_speech_recognizer_proper_noun_dictionary.md`

## スコープ

- `RecognizerPostProcessor` の追加
- confirmed 限定の補正フロー追加
- 補正前後テキストとヒット語のログ出力
- 形態素境界に整列した一意読み置換
- 読み生成方式の確定（例: `sudachipy` 採用または軽量代替）
- 元の `SpeechRecognizerResult` 構造を維持したまま補正後テキストを返す
- raw ASR result を sidecar または構造化ログへ残す

## 非対象

- 曖昧語の自動解決
- context biasing
- N-best 再ランキング

## 実装タスク

1. 認識テキストを読みへ変換する後処理コンポーネントを追加する。
2. 読み生成方式を確定し、依存追加・Docker 影響・期待精度を整理する。
3. 形態素列を基準に、連続する境界上でのみ最長一致を評価する。
4. 読みが一意な辞書語だけを自動補正対象にする。
5. `SpeechRecognizerNemoWorker` で confirmed 時のみ補正を呼び、補正後 result を下流へ返す。
6. 補正失敗時は元の認識結果を返す。
7. raw ASR result、補正ヒット件数、補正前後テキストを、採用した trace 保存方式に従って残す。

## 想定変更箇所

- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py`
- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/`

## 完了条件

- partial は従来どおりの挙動を維持する。
- confirmed 時だけ辞書補正が反映される。
- 任意部分文字列への置換ではなく、形態素境界に整列した一致だけが置換される。
- 読み生成方式が明文化され、必要な依存が確定している。
- 一意読み語の代表例で結果が改善する。
- WebSocket のレスポンス形式を変更しない。
- raw ASR result を後から追跡できる。

## 確認

- 単体テストで一意読み補正を確認する。
- 単体テストで境界外の部分一致が置換されないことを確認する。
- 結合テストで confirmed 時のみ反映されることを確認する。
