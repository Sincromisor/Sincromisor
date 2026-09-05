# 固有名詞辞書の契約

## 要約

- SpeechRecognizer の固有名詞補強で使う辞書ファイルの仕様を定義する。
- 推奨形式は CSV で、必須列は `surface,yomi`。
- 読みの一意性、曖昧語、優先度、有効・無効を示すフラグは補正精度と過補正回避に直結する。

## 生成側・利用側

- 生成側:
    - 運用者または検証タスクが作成する CSV 辞書
- 利用側:
    - `ProperNounDictionary`
    - `RecognizerPostProcessor`
    - `AmbiguityResolver`

## 互換性方針

- `surface` と `yomi` は必須列として維持する。
- 推奨列を追加しても、未対応実装では無視できる形にする。
- 列名変更や必須列追加は破壊的変更として扱う。

## 形式

```csv
surface,yomi,priority,category,enabled,ambiguous
タブンネ,たぶんね,100,pokemon,true,true
```

## 列

| 列          | 必須 | 用途                         |
| ----------- | ---- | ---------------------------- |
| `surface`   | 必須 | 補正後に採用する表記         |
| `yomi`      | 必須 | 読み一致に使うかな表現       |
| `priority`  | 任意 | 同一読み候補の優先度         |
| `category`  | 任意 | ドメイン分類                 |
| `enabled`   | 任意 | 辞書項目の有効/無効          |
| `ambiguous` | 任意 | 同音異義語などの自動置換抑止 |

## 正規化

- `yomi` はひらがな/カタカナ揺れ、長音、記号を実装側で正規化する。
- 同一 `yomi` に複数 `surface` がある場合は曖昧語として扱う。
- 曖昧語は文脈ルール、文脈による認識候補の補強、上位N候補の再順位付けなどの根拠がない限り強制置換しない。

## エラーの扱い

- 辞書未設定時は補正無効で起動する。
- 辞書ロード失敗時は警告を出し、認識処理は継続する。
- 不正行は行番号と理由をログに残し、可能なら該当行だけ無視する。

## 検証項目

| 観点     | 確認内容                              |
| -------- | ------------------------------------- |
| 必須列   | `surface,yomi` がない場合に検出できる |
| 一意読み | 確定時に読み一致補正が適用される      |
| 曖昧語   | 文脈なしでは自動置換されない          |
| 無効項目 | `enabled=false` が補正対象から外れる  |

## 参照

- `documents/design/backend/services/speech-recognizer.md`
- `documents/design/initiatives/proper-noun-biasing.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_dictionary.md`
