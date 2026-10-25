# 音声認識の固有名詞辞書の追加ガイドを作成する

## 背景 / 目的

READMEの「辞書の追加手順」はSpeechRecognizer設計の一節を参照し、操作手順と認識処理の責務・実装説明が混在している。
利用者が登録例から辞書を作り、設定を反映し、読込みを確認できるガイドへ整理する。
起票時はHEAD `b31be6ec`の既存手順、設定例、Composeのマウント先と環境変数、辞書読込みログの実装を確認した。

## 完了条件（受け入れ条件）

- [ ] `documents/guides/proper-noun-dictionary.md`に、辞書でできること、CSVの作成、配置、必要な設定、サービスへの反映、読込み確認を順に記載する。
- [ ] UTF-8、必須列`surface`と`yomi`、利用者が試せる小さな架空の登録例を示し、追加列の詳細は既存の辞書契約へ案内する。
- [ ] ホスト側の配置先とコンテナ内の設定パスを区別し、コマンドの実行場所を明記する。権限調整スクリプトが権限と必要に応じてCSV先頭行を変更することを説明する。
- [ ] 基本設定と任意の補強設定を区別する。辞書の読込み成功を現行ログで確認でき、反映されない場合のヘッダー・パス・権限の確認先が分かる。
- [ ] READMEのリンクをガイドへ変更し、SpeechRecognizer設計の操作手順をガイドへの参照に置き換える。辞書の列・補正仕様は既存契約へ維持する。

## 変更範囲と方針

新規ガイド、READMEの辞書の節、SpeechRecognizer設計を対象とする。旧見出しへの参照元を確認し、必要なリンクと設計索引の説明を同期する。
既存手順をそのまま移すだけでなく、設定が必要な理由と反映後の確認を操作順に整理する。
辞書ローダー、補正アルゴリズム、設定キー、CSV契約は変更しない。ユーザーが配置した`volumes/proper-noun-dictionaries/`内の実辞書を編集・転載しない。
他のガイド化タスクへの依存は設けず、READMEの担当節だけを更新する。

## 参照する現在の実装と文書

- [README](../../../README.md#音声認識の固有名詞辞書を追加する)
- [既存の辞書追加手順](../../../documents/design/backend/services/speech-recognizer.md#辞書の追加手順)
- [辞書契約](../../../documents/design/contracts/proper-noun-dictionary.md)
- [配置と設定受渡し](../../../compose/speech-recognizer.yml)
- [権限調整スクリプト](../../../utils/setup/proper_noun_dictionary.sh)
- [辞書ローダー](../../../sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/ProperNounDictionary.py)
- [設定例](../../../examples/compose.env)

## 確認方法

変更したMarkdownをPrettierで整形・確認し、リンク先と見出しを確認する。
CSV例と設定・パス・成功ログを既存契約および実装と照合し、初見の利用者が配置から読込み確認まで進めることを通読する。
スクリプトの挙動を確認する必要がある場合は一時的な架空CSVを使う。音声認識精度の再評価やアプリ全体のビルド・テストは要求しない。
