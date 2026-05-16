# Proper Noun Dictionary Contract

## Summary

- SpeechRecognizer の固有名詞補強で使う辞書ファイルの仕様を定義する。
- 推奨形式は CSV で、必須列は `surface,yomi`。
- 読みの一意性、曖昧語、優先度、enabled flag は補正精度と過補正回避に直結する。

## Producers / Consumers

- Producer:
    - 運用者または検証タスクが作成する CSV 辞書
- Consumer:
    - `ProperNounDictionary`
    - `RecognizerPostProcessor`
    - `AmbiguityResolver`

## Compatibility Policy

- `surface` と `yomi` は必須列として維持する。
- 推奨列を追加しても、未対応実装では無視できる形にする。
- 列名変更や必須列追加は破壊的変更として扱う。

## Format

```csv
surface,yomi,priority,category,enabled,ambiguous
タブンネ,たぶんね,100,pokemon,true,true
```

## Columns

| 列          | 必須 | 用途                         |
| ----------- | ---- | ---------------------------- |
| `surface`   | yes  | 補正後に採用する表記         |
| `yomi`      | yes  | 読み一致に使うかな表現       |
| `priority`  | no   | 同一読み候補の優先度         |
| `category`  | no   | ドメイン分類                 |
| `enabled`   | no   | 辞書 entry の有効/無効       |
| `ambiguous` | no   | 同音異義語などの自動置換抑止 |

## Normalization

- `yomi` はひらがな/カタカナ揺れ、長音、記号を実装側で正規化する。
- 同一 `yomi` に複数 `surface` がある場合は曖昧語として扱う。
- 曖昧語は文脈ルール、context biasing、N-best reranking などの根拠がない限り強制置換しない。

## Error Semantics

- 辞書未設定時は補正無効で起動する。
- 辞書ロード失敗時は warning を出し、認識処理は継続する。
- 不正行は行番号と理由をログに残し、可能なら該当行だけ無視する。

## Test Matrix

| 観点       | 確認内容                               |
| ---------- | -------------------------------------- |
| 必須列     | `surface,yomi` がない場合に検出できる  |
| 一意読み   | confirmed 時に読み一致補正が適用される |
| 曖昧語     | 文脈なしでは自動置換されない           |
| 無効 entry | `enabled=false` が補正対象から外れる   |

## References

- `documents/design/backend/services/speech-recognizer.md`
- `documents/design/initiatives/proper-noun-biasing.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_dictionary.md`
