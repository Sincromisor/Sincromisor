# ネクタイとソックスを調整したキャラクターをモックへ反映

## 背景 / 目的

ユーザー指定の、髪留めと同じ色のネクタイ、ほんの少し短いソックスの版を作り、トップページモックへ反映する。直前の画像案で確定したダークブラウンの髪、白寄りのシャツ、細身の脚を引き継ぐ。

## 完了条件

- [x] ネクタイを髪留めと同じオレンジにし、ソックスの見える丈をわずかに短くする。
- [x] ヒーローと紹介カードに同じ採用画像を設定し、代替テキストと設計文書を同期する。
- [x] PC・スマートフォン表示と通常ビルドを確認する。

## 実装と判断

- 内蔵の `image_gen` で直前の画像を編集し、[character-orange-tie.png](../../../sincromisor-frontend/public/images/home-mock/character-orange-tie.png) に保存した。
- 髪・顔・体型・ポーズ・スカート・靴は直前の画像から保ち、ネクタイとソックスのみ調整する。
- HTMLの画像参照とCSSの顔の切り抜き参照を同時に更新する。既存の比率と切り抜き位置を再利用する。
- `documents/design/frontend/pages.md` を現在の髪色と服装へ同期する。
- `codex/home-ui-mock` ブランチ上で完了する。VRMモデルの作成・変更は範囲外とする。

## 確認結果

- `cd sincromisor-frontend && npm run build`: 成功。既存のVite設定と共通チャンク容量の警告は残る。
- playwright-cliで1440px・390pxを確認し、全身像と紹介カードが新画像を使うこと、横はみ出しがないこと、画像読み込みが成功することを確認した。実行時例外とHTTPエラーは0件だった。
- 検証画像は `work/private-artifacts/task-260913075253-home-orange-tie-character/` に保存する。
- コメント点検: PASS。全身表示と顔の切り抜きのコメントが現在の処理を説明している。操作ロジックは変更していない。

## 画像生成記録

内蔵の `image_gen` を使用した。元画像は会話内で生成した、ダークブラウンの髪・白寄りのシャツ・細身の脚の版である。採用画像の更新時には以下の原文プロンプトを基準にし、髪留めとネクタイの色、ソックス丈を目視確認する。

最終プロンプト（原文）:

```text
Use case: precise-object-edit. Edit the supplied full-body dark-brown-haired toon character with the white short-sleeved shirt. Make ONLY two very small changes: (1) Recolor the entire necktie, both knot and hanging blade, from charcoal gray to the SAME warm orange as the existing triangular hairclip, preserving the tie shape and restrained cel-shaded highlights/shadows. Match the hairclip orange exactly in the lit base color; do not recolor the hairclip. (2) Make the plain ivory socks just a tiny bit shorter: lower their top edges by about 10–15 percent of the currently visible sock shaft height, approximately one to two centimeters in character scale. Keep a small visible cuff above each shoe, still short crew socks, not hidden/no-show socks. Preserve absolutely everything else: rich dark brown bob hairstyle and hairclip, amber eyes, expression, face, approximately six-head-tall proportions, accepted slender legs, leg lengths, stance, waving hand and pose, near-white collared short-sleeved shirt and pocket, dark gray knee-length wrap-effect skirt, white and gray low-profile sneakers, clean simple toon illustration style, plain pale-peach background and grounding shadow. Do not change body or leg thickness, do not add accessories or headphones. Full figure visible from hair to soles, identical composition and image dimensions, no text, no UI, no watermark.
```
