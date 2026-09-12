# モックのキャラクターを5〜6頭身のトゥーン調に変更

## 背景 / 目的

ユーザー指定の「5〜6頭身程度のデフォルメ、トゥーン調、シンプルさと固有の特徴の両立、広く親しみやすいデザイン」を、既存のトップページモックへ反映する。添付3画像は顔・目・髪の形の参考とし、衣装やキャラクターそのものは複製しない。

## 完了条件

- [x] 約6頭身の全身像を作成し、線と陰影、髪や衣装の情報量を整理する。
- [x] 桃色のボブ、三角の髪留め、ヘッドホンで個性を表す。
- [x] ヒーロー画像と紹介カードの顔を差し替え、PC・スマートフォンで確認する。

## 実装と判断

- 採用画像は [character-toon.png](../../../sincromisor-frontend/public/images/home-mock/character-toon.png)。既存画像は前タスクの生成記録の参照先として保持する。
- 全身比率を確認できるよう `object-fit: contain` を使う。紹介カードのみ同じ画像の顔をCSSで拡大する。
- スマートフォンで顔や髪に重なるラベルを画像の外へ移す。画像の代替テキストも更新する。
- `documents/design/frontend/pages.md` にキャラクター方針を同期する。
- 万人受けはデザイン上の目標であり、ユーザー調査で確認した評価ではない。今回の成果物はモック用画像で、VRMモデルの変更は含まない。

## 確認結果

- `cd sincromisor-frontend && npm run build`: 成功。既存のVite設定と共通チャンク容量の警告は残る。
- playwright-cli: PC幅1440px、スマートフォン幅390pxで全身像と顔の切り抜きを目視確認。画像は `work/private-artifacts/task-260913064836-home-toon-character/` に保存する。
- 既存の `home-mock.spec.ts`: 1件成功（12.9秒）。1440px・390px・320pxでの横はみ出し、体験選択、開始案内、キーボード操作、画像のHTTPエラーを含む確認。
- コメント点検: PASS。全身画像を切り抜かない理由と、紹介カードだけ顔を拡大する理由をCSSに記載する。

## 画像生成記録

内蔵の `image_gen` を使用した。添付3画像を参照して全身案を生成後、頭部の大きさを2回調整した。採用した最終画像は上記のパスに保存する。更新時には以下の原文プロンプトと全身の比率を基準にする。

### 初回生成のプロンプト（原文）

```text
Use case: stylized-concept. Asset type: revised original mascot illustration for the Sincromisor home-page UI mock. Use the three attached images ONLY as references for friendly simplified anime/toon face shapes, big readable eyes, clean hair masses and approachable character appeal; do not copy their outfits or identities, do not copy watercolor texture. Create ONE original character, FULL BODY from top of hair to soles of shoes visible, standing and gently waving, approximately 5.5 heads tall (between 5 and 6 heads), visibly stylized proportions, larger rounded head, compact torso, moderate limbs, not realistic fashion proportions and not 2-3-head chibi. Design: friendly female-presenting young adult virtual companion, short pale peach bob made of a few clean broad locks, one little outward flick, ONE persimmon triangular hair clip, large warm amber-brown eyes with simple white highlights, small understated nose and mouth, soft welcoming closed-mouth smile. Keep signature features limited to the peach bob, triangular clip and compact ivory headphones with orange earpads resting at the neck. Outfit: simple ivory hooded sweatshirt with a single persimmon cuff/hem accent, plain muted charcoal tapered trousers, simple ivory sneakers with orange soles; modest relaxed fit, minimal seams, no accessories beyond specified ones. Style: clean Japanese 3D VRM TOON / flat cel-shaded anime character concept, crisp thin outlines, broad flat color areas, just one or two hard-edged shadow tones. No skin pores, no individual hair strands, no realistic fabric weave, no glossy realistic lighting, no photorealism, no complex fashion details, no elaborate gradients, no doll-like realistic anatomy. High readability at small size, distinctive clean silhouette, calm friendly broad-audience design. Composition: 1024x1536 vertical single-character hero asset, entire figure occupies about 88% of image height, centered, waving hand fits comfortably inside frame, top margin 6%, feet fully visible with 6% bottom margin. Plain uniform light warm peach background (#f6e3d3), minimal flat oval grounding shadow, no environment, no text, no labels, no logo, no watermark, no character sheet, no extra figures.
```

### 比率調整のプロンプト（原文）

```text
Use case: precise-object-edit. Refine this generated full-body original toon character. Keep the identity, pale peach bob, amber eyes, triangular orange hairclip, headphones, ivory/orange hoodie, charcoal trousers, sneakers, friendly waving pose, simple cel-shaded style, peach background and composition. ONLY correct the head-to-body proportion to approximately 5.5 heads tall: the current head including main hair mass is too large. Reduce the entire head including hair, eyes, face and clip by about 18%, keep it properly connected to the neck with natural alignment, keep the neck short, keep the body and limbs the same dimensions and feet in the same place. The main hair crown to chin (excluding the single upward hair flick) must measure around one fifth-and-a-half of the crown-to-sole height. Maintain large expressive eyes RELATIVE to the resized face and the same gentle smile. Do not drift into realistic proportions or realistic rendering. Full figure remains visible from hair to soles, no text, no measurement lines, no diagram.
```

### 最終調整のプロンプト（原文）

```text
Use case: precise-object-edit. Keep this exact original toon character and whole image. One precise proportion correction only: increase the entire head including hair, eyes, face and triangle clip by 12 percent, anchored at the neck. Do not resize the body, hands, legs, clothes, headphones, or background. Keep the same face, warm friendly smile, pose, palette and simple clean cel shading. The goal is a gently deformed 5-to-6-head-tall character, roughly 5.7 heads tall when counting from the main crown of the hair (not the stray upward hair strand) to the soles, instead of the slightly-too-small head in the input. No other changes, no text.
```
