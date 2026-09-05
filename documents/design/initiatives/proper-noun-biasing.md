# 固有名詞認識の補強計画

## 要約

- SpeechRecognizerNemo の固有名詞認識を追加学習なしで改善する取り組みである。
- CSV 辞書、確定後処理、文脈による認識候補の補強、上位N候補の再順位付けを段階導入する。
- 辞書仕様は `contracts/proper-noun-dictionary.md` を正本とする。

## 目標

- 固有名詞や同音異義語を、低遅延を保ちながら誤補正少なく扱えるようにする。
- 未補正の音声認識結果、補正結果、補正追跡記録を切り分け可能にする。

## 対象範囲

- 対象:
    - `speech-recognizer-nemo`
    - `ProperNounDictionary`
    - `RecognizerPostProcessor`
    - `AmbiguityResolver`
    - 補正の追跡記録
- 非対象:
    - 音響モデル追加学習
    - フロントエンド / WebSocket API の初期段階での破壊的変更
    - TextProcessor 側の意味解釈による言い換え補正

## 段階

| 段階 | 内容                                   | 完了条件                                   |
| ---- | -------------------------------------- | ------------------------------------------ |
| 1    | CSV 辞書読み込み処理と確定読み一致補正 | 一意読みのみ補正され、暫定遅延が悪化しない |
| 2    | 曖昧語の保留と文脈規則                 | 文脈なしの強制置換が抑止される             |
| 3    | 文脈による認識候補の補強               | 確定再デコードで対象語の採用率が上がる     |
| 4    | 上位N候補の再順位付け                  | 曖昧語を候補スコアと辞書情報で選べる       |

## 設計文書の同期

- 現在設計:
    - `documents/design/backend/services/speech-recognizer.md`
- 契約仕様:
    - `documents/design/contracts/proper-noun-dictionary.md`
- 設計判断記録:
    - `documents/design/decisions/ADR-260412-proper-noun-biasing.md`

## 検証

- 辞書読み込み処理の検証。
- 確定一意の読みの補正。
- 曖昧な読みの保留。
- 評価データセットによる変更前後比較。
- 補正追跡記録のログまたは付随ファイル確認。

## 参照

- `documents/design/backend/services/speech-recognizer.md`
- `documents/design/contracts/proper-noun-dictionary.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_biasing.md`
