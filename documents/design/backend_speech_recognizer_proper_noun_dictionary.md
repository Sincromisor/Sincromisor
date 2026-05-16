# Backend Speech Recognizer 固有名詞辞書仕様

Sincromisor の Speech Recognizer で利用する固有名詞辞書のファイル形式、正規化ルール、運用ルールを定義する設計文書。

注記:

- `Sincromisor` の読みは `シンクロミソール` とし、辞書上の `yomi` は `しんくろみそーる` を用いる。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_speech_recognizer_proper_noun_dictionary.md`
- 作成日: 2026-04-12
- 最終更新日: 2026-04-12
- ステータス: Draft

## 2. 目的とスコープ

- 目的:
    - 固有名詞補強で利用する辞書の内容とフォーマットを統一する
    - 辞書の人手編集を容易にしつつ、実装側で処理しやすい形を定義する
    - 読み一致補正、context biasing、N-best 再ランキングで再利用できる共通辞書仕様を提供する
- 対象範囲:
    - CSV 辞書ファイルの列定義
    - 読みの表記ルール
    - ロード時の検証ルール
    - 実行時の正規化方針
- 非対象範囲:
    - 実際の補正アルゴリズム詳細
    - NeMo デコード設定そのもの
- LLM向け要約（3-5行）:
    - 辞書の原本形式は UTF-8 の CSV とする。
    - ドキュメント上の標準フォーマットは `surface,yomi,priority,category,enabled,ambiguous` とする。
    - `surface` は ASR の最終出力や context biasing で使う表記、`yomi` は後処理照合や曖昧性管理で使う読みとする。
    - `yomi` はひらがな統一、空白なし、1セル1読みを原則とする。
    - 別表記や別読みは 1 行に詰め込まず、別行で管理する。
    - 同一 `yomi` に複数候補がある曖昧語は、辞書上で明示的に扱えるようにする。

## 3. 背景

- 解決したい課題:
    - 辞書を増やしていくと、表記揺れや記述揺れによりヒット率が不安定になる
    - 同音異表記や一時無効化したい語の運用管理が必要になる
- 現状の問題点:
    - 辞書仕様が未定義であり、記述ルールが人によってぶれやすい
    - 実装しやすさを優先したいが、運用側の編集コストも抑えたい
- 採用理由:
    - CSV は人手編集、差分レビュー、Docker マウント運用がしやすい
    - 列を固定することで、実装側の分岐を最小化できる
- 制約条件:
    - なるべく単純なパーサで扱えること
    - 将来の列追加に耐えられること
    - 同一の辞書原本を複数用途で使い回せること

## 4. 用語・略語

| 用語       | 定義                                                               |
| ---------- | ------------------------------------------------------------------ |
| 原本辞書   | 人手で管理する CSV ファイル                                        |
| 実行時辞書 | 原本辞書をロードし、正規化後にメモリへ展開したデータ               |
| surface    | 最終的に出力したい表記                                             |
| yomi       | 読み。比較用の入力値                                               |
| priority   | 同一読みの候補優先度。数値が大きいほど優先                         |
| 曖昧語     | 同じ `yomi` に対して複数の候補があり、単純置換すると誤補正しうる語 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
    - UTF-8 の CSV として保存できること
    - ヘッダ行を持つこと
    - `surface` と `yomi` を必須列とすること
    - 同音異表記を priority で解決できること
    - 曖昧語を辞書上で明示または検出できること
    - 一時無効化のための `enabled` 列を持てること
    - category 単位で辞書を切り分けられること
- 優先度（Must/Should/Could）:
    - Must: `surface`, `yomi`
    - Should: `priority`, `category`, `enabled`
    - Could: 将来拡張列

### 5.2 非機能要件

- 性能:
    - ロード時に O(n) 程度で索引化できること
- 可用性:
    - 不正行があっても全体起動不能にしないこと
- スケーラビリティ:
    - 数千〜数万語規模でも扱える形を維持すること
- セキュリティ:
    - 外部コード実行や式評価を必要としないこと
- 運用性/保守性:
    - Git diff でレビューしやすいこと
    - 1語単位で追加・削除しやすいこと
- 監視性:
    - 無効行、重複行、曖昧行をログで特定できること

## 6. 推奨フォーマット

- 注記:
    - 他文書でいう `表記,よみ` は論理上の必須 2 列を指す。
    - 実ファイルの標準構成は、運用と曖昧性管理のため `surface,yomi,priority,category,enabled,ambiguous` とする。

- 標準構成:

```csv
surface,yomi,priority,category,enabled,ambiguous
ピカチュウ,ぴかちゅう,100,pokemon,true,false
イーブイ,いーぶい,100,pokemon,true,false
ニャオハ,にゃおは,100,pokemon,true,false
Sincromisor,しんくろみそーる,200,product,true,false
タブンネ,たぶんね,100,pokemon,true,true
たぶんね,たぶんね,10,common,true,true
```

- 文字コード:
    - UTF-8
- 区切り文字:
    - `,`
- 改行コード:
    - LF を推奨
- ヘッダ:
    - 必須

## 7. 列定義

### 7.1 必須列

- `surface`
    - 型: string
    - 内容: 最終的に出力したい表記
    - 例: `ピカチュウ`, `Sincromisor`
    - 制約:
        - 空文字不可
        - 前後空白はロード時に trim する
    - 主用途:
        - confirmed 時に下流へ流す最終 ASR 結果
        - context biasing の key phrase
        - N-best 再ランキングで採用したい出力候補

- `yomi`
    - 型: string
    - 内容: 読み一致判定に用いる文字列
    - 例: `ぴかちゅう`, `しんくろみそーる`
    - 制約:
        - 空文字不可
        - 原則ひらがな
        - 空白なし
        - 1セル1読み
    - 主用途:
        - 読み一致後処理の比較キー
        - 曖昧語グルーピング
        - 将来の文脈ルールや評価用ラベル

### 7.2 推奨列

- `priority`
    - 型: integer
    - 内容: 同一 `yomi` に複数候補がある場合の優先度
    - 初期値:
        - 未指定時は `0`
    - 運用指針:
        - よく使う語、誤認識しやすい語ほど高くする

- `category`
    - 型: string
    - 内容: 語彙の分類
    - 例: `pokemon`, `character`, `product`, `streamer`
    - 用途:
        - ドメイン別読み込み
        - 将来の context biasing 範囲制御

- `enabled`
    - 型: boolean
    - 内容: その行を有効にするか
    - 許容値:
        - `true`, `false`
    - 初期値:
        - 未指定時は `true`

- `ambiguous`
    - 型: boolean
    - 内容: この語が曖昧語であり、単純置換の対象外であることを明示する
    - 許容値:
        - `true`, `false`
    - 初期値:
        - 未指定時は `false`
    - 運用指針:
        - `タブンネ / たぶんね` のように同一 `yomi` に複数候補がある場合に `true` を推奨する

### 7.3 将来拡張列

- `note`
    - 内容: 補足メモ
- `source`
    - 内容: 語彙の出典
- `alias_group`
    - 内容: 別表記グループ識別子
- `context_hint`
    - 内容: 文脈ルールや再ランキングで利用する分類ヒント

## 8. 読みの記述ルール

- 基本方針:
    - `yomi` は処理しやすさ優先で、比較用の正規化された表記を直接書く

- 推奨ルール:
    - ひらがなで記述する
    - 空白を入れない
    - 1セルに 1 読みだけ書く
    - 長音は実際に発音させたい形で書く
    - 小書き文字は通常どおり使う

- 例:
    - `にゃおは`
    - `いーぶい`
    - `しんくろみそーる`

- 非推奨:
    - カタカナ記述
    - ローマ字記述
    - 1セルに複数読みを `|` や `/` で併記すること
    - 読みの自由記述コメントを入れること

## 9. 記述ルール

- 1行1語にする
- 別表記は別行にする
- 別読みも別行にする
- 同じ `surface` でも読みが異なるなら別行にする
- 同じ `yomi` に複数の `surface` がある場合は `priority` で優先順を付ける
- 同じ `yomi` に複数の `surface` がある場合は、必要に応じて `ambiguous=true` を付ける
- 一時停止したい語は削除せず `enabled=false` にする

- 推奨例:

```csv
surface,yomi,priority,category,enabled,ambiguous
ポッチャマ,ぽっちゃま,100,pokemon,true,false
ぽっちゃま,ぽっちゃま,10,common,false,true
タブンネ,たぶんね,100,pokemon,true,true
たぶんね,たぶんね,10,common,true,true
```

- 非推奨例:

```csv
surface,yomi
ポッチャマ,ぽっちゃま|ぽっちゃまー
```

## 10. ロード時の正規化ルール

- `surface`
    - 前後空白を除去
    - 空文字なら無効行

- `yomi`
    - 前後空白を除去
    - ひらがな以外を含む場合は警告対象
    - 必要に応じて内部で以下を正規化する
    - カタカナ -> ひらがな
    - 全角/半角揺れ解消
    - 連続空白除去
    - 記号類除去または統一

- `priority`
    - 整数変換できない場合は `0`

- `enabled`
    - 未指定は `true`
    - 不正値は `false` ではなく警告 + `true` を推奨

- `ambiguous`
    - 未指定は `false`
    - 同一 `yomi` に複数候補がある場合は、ロード時に自動的に `true` 扱いへ昇格してよい

## 11. 実行時の内部表現

- 推奨構造:
    - `normalized_yomi -> list[DictionaryEntry]`

- `DictionaryEntry` の想定項目:
    - `surface: str`
    - `yomi: str`
    - `normalized_yomi: str`
    - `priority: int`
    - `category: str | None`
    - `enabled: bool`
    - `ambiguous: bool`

- ソート順:
    - `priority` 降順
    - `surface` 昇順

## 12. バリデーションルール

- エラー扱い:
    - 必須列欠落
    - `surface` 空文字
    - `yomi` 空文字

- 警告扱い:
    - 同一 `surface,yomi` の重複
    - 同一 `yomi` に複数 `surface` が存在し、priority も同値
    - `yomi` にひらがな以外が混在
    - `enabled` が不正値
    - 同一 `yomi` に複数 `surface` が存在するのに `ambiguous=false` のまま

- 許容:
    - 同一 `surface` の複数行
    - 同一 `yomi` の複数行

## 13. 運用ルール

- 原本辞書は Git 管理する
- 自動生成ではなく、人がレビュー可能な差分を保つ
- 代表的な誤認識が確認されたら、その都度辞書へ追加する
- 一時的な検証語彙は `enabled=false` で残してよい
- category は大分類に留め、細分化しすぎない
- 曖昧語は無理に priority だけで解決せず、`ambiguous=true` を付けて文脈側で扱う

## 14. 実装上の推奨

- 第1段階ではこの CSV 原本をそのまま読み込む
- 実行時には `enabled=true` の行だけ採用する
- 比較キーには `normalized_yomi` を使う
- 補正の第一候補は `priority` 最大の `surface` にする
- context biasing の key phrase には原則 `surface` を使う
- `yomi` は後処理・曖昧性判定用であり、初期導入では context biasing の入力に使わない
- 例外的に `surface` ではなくかな表記を出したい運用要件が生じた場合だけ、別エントリとして `surface` 側にそのかな表記を追加する
- ただし `ambiguous=true` の語、または同一 `yomi` の候補数が 2 件以上ある語は、単純置換せず保留候補に回す
- 同点時は決定不能として補正を見送るか、ログを出して後続運用で解決する

## 15. 代替案と設計判断

- 検討した代替案:
    - `表記,よみ` の2列だけに固定する
    - JSON/YAML を採用する
    - 1セルに複数読みを持たせる
- 採用しなかった理由:
    - 2列固定では同音異義語や一時無効化の運用が苦しくなる
    - JSON/YAML は人手編集と差分レビューで CSV より重くなりやすい
    - 1セル複数読みは実装分岐と運用ミスを増やす
- 最終判断:
    - 原本仕様は CSV
    - 必須列は `surface,yomi`
    - ドキュメント上の標準構成は `surface,yomi,priority,category,enabled,ambiguous`

## 16. 変更履歴

| 日付       | 変更内容 |
| ---------- | -------- |
| 2026-04-12 | 初版作成 |

## 17. 参照資料

- 関連ドキュメント:
    - `documents/design/backend_speech_recognizer.md`
    - `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
