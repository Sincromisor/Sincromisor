# Dockerの保存領域

Composeが起動時に保存先を準備し、コンテナの再作成後もデータを再利用する。

- `sincro-cache`: 音声認識モデルのキャッシュ。
- `llama-models`: 自動取得した会話用モデル。
- `proper-noun-dictionaries`: 管理者が追加する固有名詞辞書。

サービス間の認証情報と会話履歴は名前付きボリュームへ保存する。
[保存領域の設計](../documents/design/infrastructure/storage.md)を参照する。
