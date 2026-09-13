# トップの開始案内と装飾番号を削除する

## 要求と完了状態

正式トップの「はじめる」で出る案内ダイアログと、キャラクター画像下の「01 / 02」を不要として削除する。
ヘッダーと体験選択下の両ボタンから、選択した会話モードを保って `/simple-vrm/` の起動前設定へ直接進める状態にする。

## 変更範囲

- 正式トップのHTMLからダイアログと装飾番号を削除する。
- 既存の `talkMode` URL入力を標準GETフォームで渡す。機器設定を行う移動先の起動前ダイアログは維持する。
- 独立モックの開始案内を専用スクリプトへ分離し、共用する体験選択処理から正式トップ用の案内処理を取り除く。
- ページ設計と対象Playwrightテストを同期する。

## 受け入れ条件

- [x] 正式トップに開始案内ダイアログと「01 / 02」が存在しない。
- [x] 両開始ボタンから直接遷移し、選択した `chat` / `sincro` が移動先の設定に反映される。
- [x] PC・スマートフォンの体験選択、キーボード操作、会話例表示と独立モックの動作を維持する。
- [x] 対象の静的検査、型確認・ビルド、Playwrightテスト、文書とタスクの確認が成功する。

## 確認結果

- `npm --prefix sincromisor-frontend run build`: 型確認と本番ビルドが成功。
- フロントエンドで `biome check src/pages/main/main.ts src/pages/homeMock/main.ts tests/home-mock/home-mock.spec.ts`: 成功。
- `PLAYWRIGHT_HTML_OPEN=never npx --no-install playwright test sincromisor-frontend/tests/home-mock/home-mock.spec.ts --workers=1 --reporter=line --output=/tmp/sincromisor-home-direct-test-results`: 3件成功。幅1440・390・320px、不要要素の不在、両開始ボタンのEnter操作による直接遷移、両モードの反映、独立モックの動作を確認。
- 変更MarkdownのPrettier確認、`git diff --check`、タスク索引・整合性確認が成功。
- コメント点検: PASS。正式トップは標準フォームで遷移し、独立モックだけが案内処理を持つ責務を明記。
- 実サーバーでの音声会話は対象外のため未実行。今回の動作確認は移動先の起動前設定まで。
