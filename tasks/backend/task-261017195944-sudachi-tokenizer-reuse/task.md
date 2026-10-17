# Sudachiの分割モードを生成時に固定し解析領域を再利用する

## 背景 / 目的

RecognizerPostProcessorとPokeTextはtokenizeの呼出しごとに分割モードを渡す。採用Sudachiの生成時設定へ移行し、連続解析では出力領域を再利用する。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [RecognizerPostProcessor.py](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/RecognizerPostProcessor.py)
- [PokeText.py](../../../sincromisor-server/text-processor/src/text_processor/PokeText/PokeText.py)
- [test_recognizer_post_processor.py](../../../sincromisor-server/speech-recognizer-nemo/tests/test_recognizer_post_processor.py)

## 設計判断

- Dictionary.create(mode=SplitMode.C)で分割モードを固定し、tokenizeのmode引数と不要な保持フィールドを除く。
- TokenizerごとにMorphemeListを所有してoutへ渡す。次回解析で前回の結果が書き換わるため、外へ返す結果は現在どおり文字列・値へ取り出してから返す。
- 一つのTokenizerを複数スレッドで同時利用しない。注入している試験用Tokenizerを新しい呼出しに合わせ、辞書未導入時の後処理無効化を維持する。

## 完了条件と確認方法

- [x] 既存の認識後処理試験を通し、同じTokenizerで異なる文を連続解析しても先の補正結果が変化しないことを確認する。
- [x] 採用Sudachiとfull辞書で、PokeTextと固有名詞補正の代表入力について変更前後の結果を比較する。空文も確認し、modeの非推奨呼出しが対象2箇所に残らない。

変更ファイルに対象を絞った整形・静的検査を行う。Pythonはロックに従う環境を使い、環境の再現方法は[task.md](../../../tasks/backend/task-261011152416-update-python-dependencies/task.md)を参照する。

## 非対象

辞書の内容変更、分割モード変更、必要フィールドの絞込み、Tokenizerの全接続共通化。

## 文書と契約

設計の外部契約は変更しない。確認結果と判断はこのタスクへ記録する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。

## 一次資料

2026-10-17参照。採用する範囲は各項目に記す。

- [生成時の分割モード設定](https://worksapplications.github.io/sudachi.rs/python/api/sudachipy.tokenizer.html)。
- [解析結果領域の再利用](https://worksapplications.github.io/sudachi.rs/python/topics/out_param.html)。

## 実装・確認結果

PokeTextと認識後処理のTokenizerをSplitMode.Cで生成し、tokenizeのmode引数を削除した。Tokenizerごとに空文解析でMorphemeListを生成し、outへ渡して再利用する。外へ返す結果は文字列・値へ取り出し、次回解析で変更されない。採用Sudachi 0.7.0ではDictionary.createも非推奨のため、同じ機能のDictionary.tokenizerを利用した。full辞書による代表文・空文・連続解析の旧方式比較、既存補正・会話処理を含む42試験と対象Ruff・tyが成功した。対象2箇所に呼出時mode指定が残らないことを確認し、コメントを点検した。
