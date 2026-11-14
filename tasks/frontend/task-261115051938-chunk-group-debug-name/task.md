# チャンク分類の表示名を指定してビルド警告を解消する

## 背景と目的

`npm run build` で、関数形式のチャンク分類に `debugName` がないという警告が発生する。ユーザーの依頼に従い、この警告を解消してコミットする。

## 変更範囲

[sincromisor-frontend/vite.config.js](../../../sincromisor-frontend/vite.config.js) の `build.rolldownOptions.output.codeSplitting.groups[0]` に、ビルド時間レポート用の `debugName` と用途のコメントを追加する。既存の名前関数と分割方法は維持する。500 kBを超えるチャンクの警告は今回の対象外とする。

## 完了条件

- [x] `npm run build` が成功し、`debugName` 未指定の警告が出ない。
- [x] 変更した設定ファイルのBiome検査が成功する。

## 確認結果

- `npm run build`: 成功。対象の警告が消え、前回のビルドと出力チャンクの名前・サイズが一致した。500 kBを超えるチャンクの警告は残る。
- `sincromisor-frontend` で `../node_modules/.bin/biome check vite.config.js`: 成功。ルートからの直接実行は既存の入れ子設定により失敗したため、対象パッケージから実行した。
- コメント点検: PASS。追加した表示名の用途を近接コメントで説明した。
