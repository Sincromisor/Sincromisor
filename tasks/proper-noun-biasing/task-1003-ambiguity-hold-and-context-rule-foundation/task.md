# TASK-1003 曖昧語保留と文脈解決の土台

- 作成日: 2026-04-12
- ステータス: Done
- 優先度: Medium

## 目的

`タブンネ / たぶんね` のような曖昧語を単純置換せず保留し、後続の文脈解決へ回せる土台を作る。

## 関連設計

- `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
- `documents/design/backend_speech_recognizer_proper_noun_dictionary.md`

## スコープ

- `AmbiguityResolver` の追加
- 曖昧語の保留判定
- 将来の context biasing / N-best 再ランキングに渡す保留情報の整理
- 最低限の周辺語ルールの追加余地を作る
- タスク 1002 で確定した読み生成方式を前提にした曖昧語抽出

## 非対象

- 本格的な context biasing 実装
- N-best 実装

## 実装タスク

1. 曖昧語候補を抽出する resolver を追加する。
2. `ambiguous=true` または同一 `yomi` 複数候補を自動置換対象から外す。
3. 保留語をログまたは sidecar trace に出力する。
4. 将来の再ランキングが参照できる補正候補情報を内部構造に持たせる。
5. 最低限の周辺語ヒント API を定義する。

## 想定変更箇所

- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/`
- `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py`

## 完了条件

- 曖昧語が自動置換されない。
- 保留された語がログで追える。
- タスク 1002 の読み生成方式と矛盾しない。
- `タブンネはヒヤリングポケモンです。たぶんね。` のような混在文で、前後とも単純誤置換しない。

## 確認

- 曖昧語ケースの単体テストを追加する。
- 誤補正回避を確認する。
