# Proper Noun Biasing Initiative

## Summary

- SpeechRecognizerNemo の固有名詞認識を fine-tuning なしで改善する取り組みである。
- CSV 辞書、confirmed 後処理、context biasing、N-best reranking を段階導入する。
- 辞書仕様は `contracts/proper-noun-dictionary.md` を正本とする。

## Goal

- 固有名詞や同音異義語を、低遅延を保ちながら誤補正少なく扱えるようにする。
- raw ASR result、補正結果、補正 trace を切り分け可能にする。

## Scope

- 対象:
    - `speech-recognizer-nemo`
    - `ProperNounDictionary`
    - `RecognizerPostProcessor`
    - `AmbiguityResolver`
    - correction trace
- 非対象:
    - acoustic model fine-tuning
    - frontend / WebSocket API の初期段階での破壊的変更
    - TextProcessor 側の意味解釈による言い換え補正

## Phases

| Phase | 内容                                      | 完了条件                                           |
| ----- | ----------------------------------------- | -------------------------------------------------- |
| 1     | CSV 辞書 loader と confirmed 読み一致補正 | 一意読みのみ補正され、partial latency が悪化しない |
| 2     | 曖昧語の保留と context rule               | 文脈なしの強制置換が抑止される                     |
| 3     | context biasing                           | confirmed 再デコードで対象語の採用率が上がる       |
| 4     | N-best reranking                          | 曖昧語を候補スコアと辞書情報で選べる               |

## Design Sync

- Current Design:
    - `documents/design/backend/services/speech-recognizer.md`
- Contract Spec:
    - `documents/design/contracts/proper-noun-dictionary.md`
- Decision Record:
    - `documents/design/decisions/ADR-260412-proper-noun-biasing.md`

## Verification

- 辞書 loader の validation。
- confirmed unique yomi の補正。
- ambiguous yomi の保留。
- evaluation dataset による before / after 比較。
- 補正 trace のログまたは sidecar 確認。

## References

- `documents/design/backend/services/speech-recognizer.md`
- `documents/design/contracts/proper-noun-dictionary.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_biasing.md`
