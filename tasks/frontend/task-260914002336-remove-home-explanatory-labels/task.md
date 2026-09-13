# トップの自明な説明ラベルを整理する

## 要求と完了状態

「キャラクターイメージ」「会話のプレビュー」のように、見れば分かる内容を説明し直すテキストを正式トップから削除する。

## 変更範囲

- 指定された2ラベル、波形の「声でつながる」、紹介図の「あなたの声・表情・しぐさ」、FAQの「画像・会話はプレビューです。」を削除する。
- 会話カードの余白をラベルがある独立モックにだけ適用する。共用CSSの他のラベル用規則は独立モックが使うため維持する。
- 画像の代替テキスト、操作ラベル、体験紹介と開始導線を維持する。
- ページ設計と既存ブラウザーテストのFAQ文言を同期する。

## 受け入れ条件

- [x] 対象の説明ラベルが正式トップに表示されない。
- [x] PC・スマートフォンで会話カードが自然に収まり、体験選択と既存モックの表示が維持される。
- [x] 対象のブラウザー確認、ビルド、静的検査、文書とタスクの確認が成功する。

## 確認結果

- `npm --prefix sincromisor-frontend run build`: 型確認・本番ビルド成功。
- フロントエンドで `biome check tests/home-mock/home-mock.spec.ts`: 成功。
- `PLAYWRIGHT_HTML_OPEN=never npx --no-install playwright test sincromisor-frontend/tests/home-mock/home-mock.spec.ts --grep '画面幅' --workers=1 --reporter=line --output=/tmp/sincromisor-home-label-test-results`: 2件成功。正式トップと独立モックの幅1440・390・320px、体験選択、会話例とFAQ表示を確認。
- `playwright-cli` で幅1440pxと390pxを目視確認。説明ラベルがなく、会話カードと紹介図の配置に問題なし。ソース上でも対象文言の不在と画像の代替テキストの保持を確認。
- 変更MarkdownのPrettier確認、`git diff --check`、タスク索引・整合性確認に成功。
- コメント点検: PASS。変更した余白の規則は、ラベルを持つカードだけが対象であることをセレクターで表している。
- 既知の残る問題なし。
