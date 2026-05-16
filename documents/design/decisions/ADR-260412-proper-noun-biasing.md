# ADR-260412 Proper Noun Biasing Strategy

## Status

- Accepted

## Context

SpeechRecognizerNemo は 1-best 結果をほぼそのまま返しており、固有名詞や既存語をもじった名称が一般語彙へ引っ張られやすかった。モデル fine-tuning は重く、個人開発で反復しにくい。

## Decision

- モデル fine-tuning ではなく、CSV 辞書を使う段階的補強を採用する。
- 初期段階は confirmed result に対する読み一致補正を優先する。
- 曖昧語は強制置換せず、context biasing と N-best reranking を段階導入する。
- WebSocket 応答スキーマは初期段階では変更しない。

## Options Considered

| 選択肢                      | 利点                       | 欠点                                     |
| --------------------------- | -------------------------- | ---------------------------------------- |
| CSV 辞書 + confirmed 後処理 | 運用で語彙追加しやすい     | 過補正対策が必要                         |
| NeMo context biasing        | decoder 段階で補強できる   | decode strategy の制約確認が必要         |
| N-best reranking            | 曖昧語に強い               | N-best 取得と scoring の実装コストがある |
| fine-tuning                 | 根本的な精度向上が見込める | データと運用コストが大きい               |

## Consequences

- 辞書仕様は `contracts/proper-noun-dictionary.md` を正本にする。
- 補強計画は `initiatives/proper-noun-biasing.md` に分離する。
- raw ASR result と correction trace はデバッグ可能に残す。

## Review Conditions

- 辞書補正による過補正が多く、文脈ルールや reranking でも改善しない場合。
- 十分な学習データが揃い、fine-tuning の運用が現実的になった場合。

## References

- `documents/design/contracts/proper-noun-dictionary.md`
- `documents/design/initiatives/proper-noun-biasing.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_biasing.md`
