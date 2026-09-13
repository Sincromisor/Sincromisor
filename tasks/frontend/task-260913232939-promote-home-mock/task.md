# home-mockを基に正式トップページを置き換える

## 問題と完了状態

ユーザーは `home-mock` を基に `main` ページを置き換え、必要なタスクの起票から実行までを希望している。現在の `/` は旧カード型の入口で、モックの体験選択は実アプリへ渡らない。

`/` と `/index.html` にモックのレイアウト・画像・体験紹介を採用し、正式な開始導線として利用できる状態にする。

## 変更範囲

- `src/pages/main/` に正式トップページを置き、モック表記と検索除外を取り除く。画像・会話例がプレビューである説明は残す。
- CSSと体験選択・開始案内の処理は正式ページを所有元として再利用し、`/home-mock/` の独立した試作表示は維持する。不要になる旧トップ専用CSSを削除する。
- 正式ページの選択を `/simple-vrm/?talkMode=chat` または `sincro` へ渡す。受信側はこの2値だけを既存の設定適用処理へ渡し、未指定・不正値は既定のままとする。起動前設定から変更できる。
- 360度表示、Looking Glass、GitHubへの既存導線を残す。
- ページ設計と対象のブラウザーテストを同期する。通信・保存契約や音声処理は変更しない。

## 受け入れ条件と確認

- [x] 正式トップにモックの主要構成が表示され、モック専用の文言や `noindex` が残らない。
- [x] 幅1440・390・320pxで横にはみ出さず、体験選択、会話例、開始案内、Escapeとフォーカス復帰が一致する。
- [x] 開始リンクから移動すると選んだ会話モードが起動前設定に反映され、未指定・不正値は既定値になる。トップ閲覧では機器取得やRTC接続を行わない。
- [x] 既存ページへの導線と独立モックの動作を維持する。
- [x] 対象の静的検査、型確認・ビルド、Playwright確認、変更Markdown整形、タスク整合性確認が成功する。

## 確認結果

- `npm --prefix sincromisor-frontend run build`: 型確認と7ページの本番ビルドに成功。
- フロントエンドで `biome check src/pages/main/main.ts src/pages/simpleVrm/mainVrm.ts tests/home-mock/home-mock.spec.ts`: 成功。
- `PLAYWRIGHT_HTML_OPEN=never npx --no-install playwright test sincromisor-frontend/tests/home-mock/home-mock.spec.ts --workers=1 --reporter=line`: 3件成功。正式トップ・独立モックの3画面幅、選択・ダイアログ・キーボード操作、両モードの引き継ぎと変更、未指定・不正値の既定値を確認。
- `playwright-cli` で幅1440pxと390pxの表示を目視確認。トップの通信は静的取得のみ。画像とフォントの表示、追加リンクの配置に問題なし。
- 変更MarkdownのPrettier確認と `git diff --check`: 成功。設計索引から更新したページ設計へ到達可能。
- コメント点検: PASS。共用処理の責務、モックと正式ページの開始導線の差、URL入力の受理条件と設定反映時点を記載。
- `tasks:set` で `done` / `PASS` を記録し、`tasks:index`・`tasks:index:check`・`tasks:check` が成功。
- 実サーバーを用いた音声会話は未実行。今回の確認範囲は起動前設定までで、音声処理・RTC契約の変更はない。
