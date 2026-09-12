# モックの既定フォントとキャラクターの春夏服を調整

## 背景 / 目的

ユーザー要求に従い、UIの既定フォントをBIZ UDPGothicにする。キャラクターの頭身・素体は維持し、ヘッドホンを取り除き、ほどよい丈のスカート、短めのクルーソックス、調和する靴を使った少しガーリーな春夏服にする。追加の「2026年代らしくモダンに」は、服装が対象とユーザーに確認した。

## 完了条件

- [x] BIZ UDPGothicを既定にし、同梱フォントで表示できる。
- [x] 約6頭身の顔・髪・体型・ポーズを保ち、ヘッドホンなしの現代的な春夏服に変更する。
- [x] これまでのモック作業を別ブランチに保持し、ローカルmainを作業前へ戻す。
- [x] PC・スマートフォン表示と既存操作、ビルドを確認する。

## 実装と判断

- 既存の `fonts.css` と同梱のBIZ UDPGothic由来サブセットを再利用する。外部フォント配信への依存は追加しない。既定指定は `"BIZ UDPGothic", "UDPGothic", sans-serif` とする。
- 服装はコンパクトな半袖ニット、膝丈のラップ風スカート、無地の短めクルーソックス、薄底スニーカーにする。細い配色ラインと側面の小さな留め具で控えめな個性を添える。
- [UNIQLO : Cの2026年春夏公式発表](https://failover-www.uniqlo.com/jp/ja/contents/corp/press-release/2026/01/refined_for_the_everydayuniqlo.html)のニットTシャツ等を参照した（2026-09-13）。全体の組み合わせは本モックのデザイン判断であり、流行全般についての断定ではない。
- 採用画像は [character-spring-modern.png](../../../sincromisor-frontend/public/images/home-mock/character-spring-modern.png)。ヒーローと紹介カードを同時に更新する。初回の丸襟ブラウス案は採用しない。
- `documents/design/frontend/pages.md` のフォント・服装の記述を同期する。

## ブランチ

`codex/home-ui-mock` を作成し、モック作業の既存2コミット `d4196a30` と `c47ef018` を保持した。ローカル `main` は作業前の `fddafd27` へ戻した。今回の追加変更も同ブランチにコミットする。リモートの変更、push、rebaseは実行していない。

## 確認結果

- Chrome DevTools Protocolで見出しの実描画フォントが `BIZ UDPGothic` / `BIZUDPGothic-Bold`、`isCustomFont: true` であることを確認した。
- playwright-cliでPC幅1440pxとスマートフォン幅390pxを目視確認した。検証画像は `work/private-artifacts/task-260913072547-home-font-spring-outfit/` に保存する。
- 既存 `home-mock.spec.ts`: 1件成功（14.1秒）。1440px・390px・320pxの横はみ出し、選択、案内ダイアログ、キーボード操作、HTTPエラーを確認した。
- `cd sincromisor-frontend && npm run build`: 成功。既存のVite設定と共通チャンク容量の警告は残る。
- コメント点検: PASS。フォント定義の共有と未導入端末での扱いをCSSに記載する。
- VRMモデルの作成・変更は今回の範囲に含めない。

## 画像生成記録

内蔵の `image_gen` で既存 `character-toon.png` を編集した。初回の春夏服案から服装だけを再調整し、上記の採用画像を保存した。

### 初回編集のプロンプト（原文）

```text
Use case: precise-object-edit. Edit the supplied original toon character image ONLY to change clothing and remove headphones. Preserve EXACTLY the accepted head-to-body proportions (about 6 heads tall), underlying physique, head size, body height, limb proportions, peach bob haircut, triangle orange hairclip, amber-brown eyes, face, gentle smile, waving pose, full-body framing, crisp clean toon/cel-shading, and peach background. Remove the headphones completely. Replace hoodie and trousers with a modest spring-to-summer outfit that is just slightly more girly, simple and broadly appealing: an airy ivory short-sleeved blouse with a small rounded collar, understated slight gathers at the sleeves and three small tone-on-tone buttons, tucked into a muted coral-peach A-line skirt with a few broad soft pleats. Skirt hem reaches approximately the knees (at or just above kneecap), NOT a miniskirt, no elaborate frills, no big bows, no elaborate lace, no costume/uniform. Plain ivory short crew socks rising a little above the ankles to lower calf, simple smooth fabric with a small plain cuff, no ruffles. Coordinated low-profile warm brown Mary Jane flats with one simple strap and a rounded toe, low flat sole, no heels. Restrained ivory, muted coral and warm brown clothing palette complements hair. Do not add jewelry, bags, headphones, hats or other accessories. Keep the original anatomy, head size, hand position, stance and shoe-bottom position unchanged. Clothes should suggest a light comfortable everyday spring/summer look. Entire figure including shoes visible. Keep character identity and simple illustration rendering; no photorealism, no text.
```

### 最終編集のプロンプト（原文）

```text
Use case: precise-object-edit. Modernize ONLY the outfit of this original toon character into understated contemporary 2026 Japanese spring/summer casual fashion, slightly feminine but clean and practical. Preserve EXACTLY her accepted approximately 6-head-tall proportions, underlying physique and limb lengths, head size, peach bob, orange triangular hairclip, large amber eyes, face, smile, waving pose, full-body composition, peach background and crisp simple toon illustration style. Replace the old-fashioned rounded Peter Pan collar blouse and voluminous gathered skirt. New outfit: compact ivory short-sleeve fine-knit crew-neck top with a very narrow muted coral trim at neckline and sleeve edges, straight neat sleeves (no puff sleeves), clean shoulder line, hem neatly meets the high skirt waistband (no exposed midriff). Modern muted dusty-coral knee-length subtly A-line wrap-effect skirt, much cleaner and less voluminous than the original skirt, one diagonal overlapping front panel and one small fabric side fastening tab, no many pleats, no flounces, no slit exposing thigh, hem around kneecap or up to 3cm above. Keep plain ivory SHORT CREW SOCKS ending slightly above ankles, absolutely no ruffles. Replace brown Mary Janes with streamlined low-profile ivory retro court sneakers, slim taupe overlays, small muted coral heel detail, narrow gum outsole, simple laces; not chunky athletic or platform shoes. The result should feel like a current minimal feminine everyday outfit, easy silhouette, clean material blocks, quiet fashion detail, not a school uniform, not vintage doll clothes, not an elaborate costume. Do not add headphones or accessories. Keep all anatomy and the rest of image unchanged; no realistic textures, no text or logos.
```
