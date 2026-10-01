# バックエンドサービス: SpeechRecognizer

## 要約

- SpeechRecognizerは抽出済み音声区間をテキストへ変換する下流サービスである。
- 現在は主にNemoで音声を認識する。Nue-ASRは廃止済みで、コンテナの `SINCRO_RECOGNIZER_MODEL`は `nemo`のみ受け付ける。
- 固有名詞補強は取り組み計画と辞書契約に分離する。

コンテナはCUDA 13.0系を使う。ホスト側の条件は[Compose設計](../../infrastructure/compose.md#nemoのgpu基盤)を参照する。

## 対象範囲

- 対象
    - SpeechRecognizerサービス境界
    - Nemo音声認識処理の認識結果
    - 確定 / 暫定の扱い
    - 固有名詞補強との接続点
- 非対象
    - 音声抽出
    - TextProcessorの応答生成

## 責務

- Goパイプライン調停器から音声区間を受け取る。
- 音声区間を暫定 / 確定結果へ変換する。
- 必要に応じて確定結果に後処理を適用する。
- 結果をTextProcessorへ渡せるmsgpackモデルとして返す。

## 固有名詞認識の補強

- 辞書仕様
    - `documents/design/contracts/proper-noun-dictionary.md`
- 導入計画
    - `documents/design/initiatives/proper-noun-biasing.md`
- 基本方針
    - 暫定の低遅延経路を保つ。
    - 確定時に読み一致補正、文脈による認識候補の補強、上位N候補の再順位付けを段階導入する。
    - 未補正の音声認識結果と補正の追跡記録はデバッグ可能に残す。

## 変更時の確認

- `SpeechRecognizerResult`を変える場合はWebSocket契約とTextProcessorを同時に確認する。
- 辞書列を変える場合は固有名詞辞書の契約を更新する。
- 確定専用の重い処理を入れる場合は遅延と代替処理を確認する。

## 参照

- `documents/design/contracts/audio-pipeline-websocket.md`
- `documents/design/contracts/proper-noun-dictionary.md`
- `documents/design/initiatives/proper-noun-biasing.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer.md`
- `documents/design/archive/legacy-flat/backend_speech_recognizer_proper_noun_biasing.md`

## 辞書の追加手順

音声認識の固有名詞辞書は `speech-recognizer`コンテナに
読み込ませる。固有名詞補強は `SINCRO_RECOGNIZER_MODEL=nemo`を前提とする。

1. 辞書配置用ディレクトリを作成する。

```sh
$ mkdir -p volumes/proper-noun-dictionaries
```

2. UTF-8のCSVで辞書ファイルを作成する。
   最低限 `surface`と `yomi`が必要となる。運用上は
   `surface,yomi,priority,category,enabled,ambiguous`の構成を推奨する。
   ヘッダが適切に記述されていない場合はエラーになる。

```csv
surface,yomi,priority,category,enabled,ambiguous
Sincromisor,しんくろみそーる,200,product,true,false
ピカチュウ,ぴかちゅう,100,pokemon,true,false
タブンネ,たぶんね,100,pokemon,true,true
たぶんね,たぶんね,10,common,true,true
```

3. 作成したCSVを `volumes/proper-noun-dictionaries/`配下へ置く。
   たとえば `volumes/proper-noun-dictionaries/proper_nouns.csv`のようなパスにする。

    `speech-recognizer`コンテナは非rootユーザーで動作するため、権限が厳しすぎると
    辞書を読めない。配置後に次のスクリプトで権限を整えておくのを推奨する。

```sh
$ ./utils/setup/proper_noun_dictionary.sh
```

このスクリプトは `volumes/proper-noun-dictionaries/`配下を
`directory=755`、`file=644`にそろえる。あわせて `.csv`の先頭行を確認し、
`surface,yomi,priority,category,enabled,ambiguous`ヘッダが無ければ自動で補う。
個別パスを指定することもできる。

```sh
$ ./utils/setup/proper_noun_dictionary.sh volumes/proper-noun-dictionaries/proper_nouns.csv
```

4. ルートの `.env`を更新する。

```dotenv
SINCRO_RECOGNIZER_MODEL=nemo
SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=true
SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH=/opt/sincromisor/proper-noun-dictionaries/proper_nouns.csv
```

confirmed時の補強を強めたい場合は、必要に応じて以下も有効化できる。

```dotenv
SINCRO_RECOGNIZER_PROPER_NOUN_CONTEXT_BIASING_ENABLE=true
SINCRO_RECOGNIZER_PROPER_NOUN_NBEST_ENABLE=true
```

5. `speech-recognizer`コンテナを再作成して反映する。

```sh
$ docker compose up -d speech-recognizer
```

6. ログを確認し、辞書がロードされていることを確認する。

```sh
$ docker compose logs speech-recognizer
```

`Proper noun dictionary loaded:`が出力されれば、辞書ファイルのマウントと読み込みは成功となる。
反映されない場合は、CSVのヘッダ、`.env`の `SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH`、
`volumes/proper-noun-dictionaries`配下のファイル配置、ディレクトリ/ファイル権限
（`755/644`）を見直す。

## 運用ログ

認識の運用ログは`recognition_result`へ本文と会話・発話・シーケンスID、確定状態を記録する。`SINCRO_LOG_CONVERSATION_ENABLED=false`では本文イベントを出さず、処理時間と結果だけを残す。補正追跡の運用ログへの重複出力はしない。認識音声・結果ファイルとS3保存はこの設定の対象外である。
書式・例外情報・設定反映は[ログ基盤](../../infrastructure/logging.md#pythonのjsonl出力)を参照する。
