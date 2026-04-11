# TASK-1006 テストと評価用データ整備

- 作成日: 2026-04-12
- ステータス: Open
- 優先度: High

## 目的

固有名詞補強の効果と誤補正リスクを継続確認できるよう、テストケースと評価用データを整備する。

## 関連設計

- `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
- `documents/design/backend_speech_recognizer_proper_noun_dictionary.md`

## スコープ

- 辞書ロードの単体テスト
- 一意読み補正の単体テスト
- 曖昧語保留の単体テスト
- representative 文の評価セット作成
- 手動確認手順の文書化
- 過補正を検出する負例セットの整備
- raw ASR result と補正 trace の確認手順整備

## 非対象

- 学習データ作成

## 実装タスク

1. 辞書ローダのテストを追加する。
2. 一意読み補正のテストを追加する。
3. 曖昧語の誤補正回避テストを追加する。
4. 非辞書文・一般会話文の負例セットを追加する。
5. 代表例をまとめた評価セットを用意する。
6. raw ASR result と補正 trace の確認手順を `documents/tasks` または関連 README に残す。
7. false positive 件数、非辞書文無変化率、confirmed レイテンシ増分を評価項目に含める。

## 評価セットに含める例

- 固有名詞のみの短文
- 一般名詞をもじった固有名詞
- 同音異義語の混在文
- 固有名詞を含まない一般会話文
- 誤って部分一致しやすい短文
- `Sincromisor`
- `タブンネはヒヤリングポケモンです。たぶんね。`

## 想定変更箇所

- `sincromisor-server/speech-recognizer-nemo/` 配下のテスト
- `documents/tasks/proper_noun_biasing/`

## 完了条件

- タスク 1001-1005 の品質を支えるテストが揃う。
- 評価対象の文と期待結果が文書化される。
- 過補正の有無と raw/補正後差分を追跡できる。

## 確認

- テストがローカルで通る。
- 回帰確認手順が追える。
