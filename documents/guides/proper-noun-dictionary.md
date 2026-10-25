# 音声認識の固有名詞辞書を追加する

## 目的と前提

名前や作品名など、音声認識で表記が揺れる語を登録し、確定した認識結果の補正に使うためのガイドである。
読みが一致する語の補正を基本とし、登録しただけであらゆる発音・文脈で認識が改善することは保証しない。
同じ読みに複数の表記がある曖昧語は、根拠がないまま強制置換しない。音声合成の読み方を変える辞書ではない。

NeMoの `speech-recognizer` を起動済みであることを前提とする。
以下のコマンドは、音声認識サービスを動かすホストのリポジトリルートで実行する。分散配置ではフロントやRTCのホストではなく、認識サービスのホストで作業する。
設定の受渡しは [Compose定義](../../compose/speech-recognizer.yml)、既定値は [設定例](../../examples/compose.env) を参照する。

## CSVを作って配置する

配置先を用意する。

```sh
mkdir -p volumes/proper-noun-dictionaries
```

テキストエディターでUTF-8（BOMなし）のCSVを作り、`volumes/proper-noun-dictionaries/proper_nouns.csv` へ保存する。
同名の辞書がある場合は上書きせず、別名にして後述の設定パスも合わせる。
最小の例は次のとおり。どちらも架空の登録語である。

```csv
surface,yomi
星霧工房,ほしぎりこうぼう
ミラノア,みらのあ
```

先頭行の `surface` は採用したい表記、`yomi` はかなで書く読みで、両列とも必須である。
ヘッダーを省略したり、日本語の列名へ変えたりしない。
優先度、分類、有効・無効、曖昧語の指定が必要になったら [辞書契約](../design/contracts/proper-noun-dictionary.md#列) の追加列を使う。

## 読み取り権限を整える

認識サービスは非rootユーザーで動く。ホスト側の配置先ディレクトリを辿れ、CSVを読める権限が必要である。
既存の辞書をバックアップし、対象を確認してから [権限調整スクリプト](../../utils/setup/proper_noun_dictionary.sh) を使う。
単一ファイルへ適用する例は次のとおり。

```sh
./utils/setup/proper_noun_dictionary.sh volumes/proper-noun-dictionaries/proper_nouns.csv
```

この指定では親ディレクトリを755、ファイルを644にする。ホストの他ユーザーからも読み取り可能になるため、秘密情報を含む辞書にはこの権限設定をそのまま適用しない。
引数を省略すると `volumes/proper-noun-dictionaries/` 全体のディレクトリを755、ファイルを644にする。

スクリプトは権限だけでなく、`.csv` の先頭行も確認する。
先頭行が `surface,yomi` と一致せず、`surface,yomi,` でも始まらない場合は、`surface,yomi,priority,category,enabled,ambiguous` を先頭へ追加する。
既存の列を並べ替える処理ではないため、誤った列順やBOM付きのヘッダーはエディターで直す。上の登録例は先頭行を変更せずに使える。

## 辞書を有効にする

対象ホストのルート `.env` に次を設定する。既定では固有名詞補正は無効である。

```dotenv
SINCRO_RECOGNIZER_MODEL=nemo
SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=true
SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH=/opt/sincromisor/proper-noun-dictionaries/proper_nouns.csv
```

配置先と設定値は次のように対応する。

| 場所                                 | パス                                                         |
| ------------------------------------ | ------------------------------------------------------------ |
| ホスト上のCSV                        | `volumes/proper-noun-dictionaries/proper_nouns.csv`          |
| コンテナから読むCSV（`.env` に指定） | `/opt/sincromisor/proper-noun-dictionaries/proper_nouns.csv` |

コンテナはホストの辞書ディレクトリを読み取り専用で参照する。`.env` にホスト側の相対パスを書かない。
まず基本設定で試し、確定時の認識候補も補強したい場合に限って、次の任意設定を検討する。

```dotenv
SINCRO_RECOGNIZER_PROPER_NOUN_CONTEXT_BIASING_ENABLE=true
SINCRO_RECOGNIZER_PROPER_NOUN_NBEST_ENABLE=true
```

前者は文脈による認識候補の補強、後者は上位候補の再順位付けを有効にする。CSVを読み込むための必須設定ではない。
追加処理が入るため、実際に使う語と会話で効果を確認して選ぶ。

## サービスへ反映して確認する

利用中の会話を終えてから、音声認識サービスだけを再作成する。
辞書の内容だけを変えた場合も読み直しが必要なため、再作成を明示する。

```sh
docker compose up -d --no-deps --force-recreate speech-recognizer
docker compose logs --since 5m speech-recognizer
```

初回のモデル準備中なら完了を待つ。JSON形式のログの `message` に、次の原文を含む行があることを確認する。

```text
Proper noun dictionary loaded: path=... rows=... enabled=... disabled=... skipped=... warnings=... ambiguous_yomi=...
```

`path` が指定したファイルで、`enabled` が想定する登録件数かを確認する。上の2語だけなら `rows=2 enabled=2`、除外や警告がなければ `skipped=0 warnings=0` となる。
読込み成功は、すべての行が採用されたことや実際の認識改善までを保証しない。
通常画面で登録語を含む短い発話を行い、確定後の表記を確認する。暫定表示だけで判断しない。
ログの探し方は [ログガイド](logging.md) を参照する。

## 反映されないとき

| 確認箇所     | 見直す内容                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 有効化       | `SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=true` と辞書パスが設定されているか。変更後に再作成したか。                       |
| 配置とパス   | 認識ホストのファイル名と、コンテナ内の設定パスが対応しているか。大文字・小文字も確認する。                             |
| CSV          | UTF-8、先頭行の必須列、空の表記・読み、不正行の警告を確認する。BOMやヘッダーの余分な空白を除く。                       |
| 権限         | ディレクトリを辿れるか、非rootの認識サービスがファイルを読めるか。権限調整後も親ディレクトリの制約がないかを確認する。 |
| 読みと曖昧語 | 発話の読みが登録と一致するか。同じ読みの別表記や曖昧語指定で、自動置換を抑えていないか。                               |

`Proper noun dictionary is unavailable` や `Proper noun dictionary load failed` の原文を含むログがある場合は、その理由を確認する。
辞書を読めなくても通常の認識は継続するため、サービスが起動したことだけを読込み成功としない。
実辞書や認識結果を共有資料へ転載せず、必要なら架空の小さな例で再現する。
