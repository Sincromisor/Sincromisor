# コンセプトを表現するトップページUIモックを作成

## 背景 / 目的

既存のスタイルや構成に縛られず、2026年時点の新しいトップページUIモックを作るというユーザー要求に対応する。「キャラクターと話す／キャラクターになる」を入口に据える。

## 完了条件

- [x] 独立した `/home-mock/` に、暖かな白・朱色・生成キャラクター画像を使ったトップページを新規作成する。
- [x] 体験選択、会話プレビュー、開始案内、紹介からの再選択、FAQを操作できる。
- [x] PC・スマートフォンの表示、キーボード操作、動きを減らす設定を確認する。
- [x] 通常ビルドに含め、ページ構成とREADMEを同期する。

## 設計判断と範囲

- HTML、専用CSS、短いTypeScriptで構成し、依存を追加しない。ラジオボタン、`dialog`、`details` を使う。
- 既存トップページは維持する。モックはRTC、カメラ、マイク、保存設定を起動・変更しない。
- 画像はオリジナルの生成イラスト、会話文は固定プレビューであり、画面で説明する。選択は実アプリへ引き継がず、`/simple-vrm/` での再設定へ案内する。
- 操作対象の大きさとフォーカス表示は[W3CのWCAG 2.2解説](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)を参照した（2026-09-13）。全項目の適合監査は範囲外とする。
- `README.md`、`documents/design/frontend/pages.md`、`app-shell.md` を同期した。設計索引からページ構成へ到達できる。

## 確認結果

- 型確認・通常ビルド: `cd sincromisor-frontend && npm run build` 成功。
- Biome: モックのTypeScript、Playwrightテスト、Vite設定を対象に確認。
- ブラウザー: playwright-cliで1440px・390pxの表示を目視確認。画像は `work/private-artifacts/task-260913061234-home-concept-mock/` に保存する。
- 操作確認は、Viteをポート5173で起動し、導入済みGoogle Chromeで次を実行する。
- 操作テスト: 1件成功（10.7秒）。

```sh
npx --no-install playwright test sincromisor-frontend/tests/home-mock/home-mock.spec.ts --reporter=line --output=work/private-artifacts/task-260913061234-home-concept-mock/test-results
```

1440px・390px・320pxの横はみ出し、選択とプレビューの一致、矢印キー選択、ダイアログの内容、Escapeと閉じるボタン、フォーカス復帰、下部からの再選択、FAQ、動きを減らす設定、実行時例外とHTTPエラーを確認する。初回は既定のPlaywrightブラウザー未導入で起動できず、導入済みChromeの使用を明示した。

- コメント点検: PASS。モックの責務、実アプリとの境界、標準dialogへの委譲、上下の選択連動を説明した。
- 残る制約: 実際の音声会話・VRM動作は範囲外。Viteの既存の `__dirname` と大きな共通チャンクに関する警告は残る。

## 画像生成記録

内蔵の `image_gen` を使用した。採用画像は [character.png](../../../sincromisor-frontend/public/images/home-mock/character.png) に保存した。更新するときは以下の原文プロンプトを基準に再生成し、ページ内の切り抜きと可読性を再確認する。

最終プロンプト（原文）:

```text
Use case: stylized-concept. Asset type: hero artwork for a Japanese browser app where people talk to or become their favorite virtual characters. Create a premium polished anime 3D character editorial render, portrait 1024x1536 composition. A friendly young adult woman virtual avatar with short fluffy pale peach hair, amber eyes, small orange geometric hair clips, large cream and burnt-orange over-ear headphones resting around neck, oversized ivory technical hoodie with orange trim, modest charcoal bottoms. Waist-up, one relaxed hand raised waving toward viewer, expressive welcoming smile, delicate detailed face. Beautiful high-end cel-shaded 3D meets hand-painted anime, tactile soft fabric. Character centered with head in upper quarter and body extends beyond bottom edge, comfortably framed so all hair and raised hand fit. Backdrop is a plain warm light peach studio backdrop with a faint peach circular halo, warm soft daylight and subtle shadows. Cream, apricot, persimmon and muted ink palette. No text, no logo, no UI, no watermark, no extra people. This is an original concept character, not an existing franchise character.
```
