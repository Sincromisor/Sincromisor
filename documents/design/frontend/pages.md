# フロントエンドのページ構成

## 要約

- 現行フロントエンドは `main`、`home-mock`、`simple-vrm`、`vrm360`、`looking-glass-vrm`、`motion-debug`、`pose-landmarker-spike` の 7 ページを通常ビルド対象にする。
- Babylon.jsの旧ページ（`simple`、`glass`、`character`、`character-glass`、`area360`、`single`、`double`）と関連実装・依存は削除済み。
- 生成元の起動処理は `sincromisor-frontend/src/pages/*` に集約し、Vite の経路別名で既存公開 URL を維持する。
- ページ差分は項目 / 初期化処理 / シーン選択肢 / ページ固有の設定に閉じ込める。

## 対象範囲

- 対象:
    - Vite MPA のページ分類
    - 現行 / 実験用の扱い
    - ページごとの設計確認入口
- 非対象:
    - 個別 UI コンポーネントの実装詳細
    - 旧形式ページの保守

## ページ一覧

分類の「実験用」も通常ビルドに含まれる。ビルド入力と公開URLの正本は [Vite設定](../../../sincromisor-frontend/vite.config.js) である。

| ページ                  | 生成元の起動処理                           | 公開 URL                  | 分類   | 役割                       | 主な確認文書                                                     |
| ----------------------- | ------------------------------------------ | ------------------------- | ------ | -------------------------- | ---------------------------------------------------------------- |
| `main`                  | `src/pages/main/index.html`                | `/`                       | 現行   | 通常導線の入口             | 本文「正式トップページ」                                         |
| `home-mock`             | `src/pages/homeMock/index.html`            | `/home-mock/`             | 試作   | トップページの独立UIモック | 本文「トップページのモック」                                     |
| `simple-vrm`            | `src/pages/simpleVrm/index.html`           | `/simple-vrm/`            | 現行   | 通常会話の正規ルート       | `frontend/app-shell.md`, `frontend/character/overview.md`        |
| `vrm360`                | `src/pages/vrm360/index.html`              | `/vrm360/`                | 実験用 | 360 表示実験               | `frontend/character/overview.md`                                 |
| `looking-glass-vrm`     | `src/pages/lookingGlassVrm/index.html`     | `/looking-glass-vrm/`     | 実験用 | Looking Glass + VRM 1.0    | `frontend/character/overview.md`                                 |
| `motion-debug`          | `src/pages/motionDebug/index.html`         | `/motion-debug/`          | 実験用 | Pose 動作の変換 / IK 調整  | `frontend/character/motion.md`, `frontend/character/tracking.md` |
| `pose-landmarker-spike` | `src/pages/poseLandmarkerSpike/index.html` | `/pose-landmarker-spike/` | 実験用 | MediaPipe Pose 性能検証    | `frontend/character/tracking.md`                                 |

## 開発時の起動とビルド

リポジトリのルートから次を実行する。開発サーバーのURLに `/home-mock/` を付けるとモックを確認できる。

```sh
npm --prefix sincromisor-frontend run dev
```

通常ビルドは次のコマンドを使う。`tsc -p tsconfig.modern.json && vite build` により型を確認し、ページ一覧の7ページを `sincromisor-frontend/dist/` に出力する。

```sh
npm --prefix sincromisor-frontend run build
```

## 正式トップページ

`/` と `/index.html` は `home-mock` のレイアウト・キャラクター画像・体験紹介を採用した正式な入口である。標準ラジオボタンで「キャラクターと話す／キャラクターになる」を選び、ヘッダーと体験選択下の開始ボタンから会話ページへ直接進む。開始前の案内ダイアログや装飾番号は表示しない。画像と会話例には、見た目を説明し直すラベルを付けない。画像の代替テキストと操作に必要な案内は保持する。トップではReactの共通枠組み、RTC、機器取得を起動しない。

標準のGETフォームが選択中のラジオ値を送り、`/simple-vrm/?talkMode=chat` または `/simple-vrm/?talkMode=sincro` へ進む。`simpleVrm/mainVrm.ts` は初期化完了後、既知の2値だけを既存の設定適用処理へ渡す。未指定・不正値は既定値を維持し、利用者は起動前設定で変更できる。通信契約と保存形式は変わらない。

360度表示、Looking Glass、GitHubへの導線を残す。正式トップと独立モックは `src/pages/main/` のCSSと体験選択処理を共用し、HTMLは各ページで管理する。独立モックだけの開始案内処理は `src/pages/homeMock/main.ts` に置く。FAQ、画面幅への追従、フォーカス表示、動きを減らす設定は両ページで利用できる。

## トップページのモック

`/home-mock/` は「キャラクターと話す／キャラクターになる」を選べる独立したトップページ案である。正式トップとは別のHTMLを持ち、CSS・TypeScriptと生成画像は正式トップと共用する。Reactによるアプリの共通枠組み、RTC、機器取得は起動しない。画像と会話例はプレビューとして明示する。

選択状態は標準ラジオボタンに保持し、CSSが会話例を切り替える。開始ボタンは標準の `dialog` を開き、既存の `/simple-vrm/` へ案内する。モックの選択や画像は実アプリへ引き継がず、会話モードを移動先で再設定する案内を表示する。FAQは標準の `details` を使い、画面幅への追従、フォーカス表示、動きを減らす設定に対応する。

両トップページのUIの既定フォントはBIZ UDPGothicとする。未導入端末では共通の `fonts.css` に定義された、同梱のBIZ UDPGothic由来のサブセットを使う。

キャラクター画像は5〜6頭身を目安とするトゥーン調の全身像とし、大きな目、整理された髪の形、簡潔な服と陰影で親しみやすさを表す。ダークブラウンのボブ、オレンジの三角の髪留め、赤いオーバル型アンダーリムメガネ、細身の脚を特徴とする。メガネは目を縮小せずに掛ける。画像は背景と足元の影を持たない透過PNGとし、背景色はCSSで指定する。服装は白寄りの半袖シャツ、髪留めと同じオレンジの細めのネクタイ、ダークグレーの膝丈のラップ風スカート、足首の上に少し見える白いソックス、靴ひもを残したシンプルな白い薄底スニーカーとし、ヘッドホンは付けない。ヒーロー領域は全身を収め、紹介カードだけ顔を拡大する。

### 採用画像と更新方法

表示用画像は [character-transparent.png](../../../sincromisor-frontend/public/images/home-mock/character-transparent.png)（1024×1536、RGBA）である。[character-glasses.png](../../../sincromisor-frontend/public/images/home-mock/character-glasses.png) は背景透過前の生成原本として保持する。原本は `image_gen` による編集、透過版はローカル画像処理で作成した。

#### 採用につながった最終記録のプロンプト（原文）

ダークブラウンの髪・白寄りのシャツ・細身の脚を持つ画像に、次の編集を指示した。これはネクタイとソックスの調整時に保存された原文であり、メガネ追加後の完成画像を一度に生成するプロンプトではない。

```text
Use case: precise-object-edit. Edit the supplied full-body dark-brown-haired toon character with the white short-sleeved shirt. Make ONLY two very small changes: (1) Recolor the entire necktie, both knot and hanging blade, from charcoal gray to the SAME warm orange as the existing triangular hairclip, preserving the tie shape and restrained cel-shaded highlights/shadows. Match the hairclip orange exactly in the lit base color; do not recolor the hairclip. (2) Make the plain ivory socks just a tiny bit shorter: lower their top edges by about 10–15 percent of the currently visible sock shaft height, approximately one to two centimeters in character scale. Keep a small visible cuff above each shoe, still short crew socks, not hidden/no-show socks. Preserve absolutely everything else: rich dark brown bob hairstyle and hairclip, amber eyes, expression, face, approximately six-head-tall proportions, accepted slender legs, leg lengths, stance, waving hand and pose, near-white collared short-sleeved shirt and pocket, dark gray knee-length wrap-effect skirt, white and gray low-profile sneakers, clean simple toon illustration style, plain pale-peach background and grounding shadow. Do not change body or leg thickness, do not add accessories or headphones. Full figure visible from hair to soles, identical composition and image dimensions, no text, no UI, no watermark.
```

#### 完成画像に採用した追加指示

メガネ付き画像の生成指示は原文が保存されていないため、記録に残る指定内容を示す。

- オレンジのネクタイ幅をわずかに狭くする。
- 目を変えず、赤いオーバル型アンダーリムメガネを加える。
- 靴ひもを残し、スニーカーの装飾を減らす。

透過版はこの生成原本から背景と足元の影だけを取り除き、輪郭の背景色の混色を補正する。メガネの移動・補完は行わず、目とメガネ周辺の元画素を保持する。白い衣服・ソックス・靴の内部は不透明のままにする。

更新時は原本と上記の外見・指示を参照し、透過PNGを同じ表示用パスへ保存する。全身像と紹介カードが同じ画像を参照すること、明暗の背景で輪郭が自然であること、PC・スマートフォンで全身と顔の切り抜きが収まることを確認する。

## 責務

- 起動ファイル:
    - `src/pages/*` 配下に置き、ページ固有初期化処理を呼ぶ薄い入口に保つ。
    - 由来ディレクトリは camelCase、公開 URL は既存 kebab-case 経路を維持する。
    - `simple-vrm` の VRM 項目は `src/pages/simpleVrm/mainVrm.ts`、React パネルは `src/pages/simpleVrm/react/*` に置く。
    - `vrm360` / `looking-glass-vrm` の React パネルは各 `src/pages/<page>/react/*` に置き、通常アプリの共通枠組みの上へページ固有の操作パネルとして渡す。
- Vite 経路別名:
    - dev では旧公開 URL を `src/pages/*` の HTML へ内部書き換えする。
    - ビルド後は `dist/pages/*/index.html` を `dist/<public-route>/index.html` へ移し、プレビュー / 配信 URL を変えない。
- 初期化処理:
    - シーン / ページ選択肢を組み立て、アプリ制御の起動へ委譲する。
- Reactによるアプリの共通枠組み:
    - 共通 UI を描画し、ページ差分はプロパティ / 制御処理選択肢へ閉じ込める。
- 開発者向けページ:
    - `motion-debug` は AppShell / RTC / チャット / 起動前ダイアログを持たず、カメラ / 追跡処理 / VRM 動作の変換の観測に限定する。
    - `motion-debug` は `?vrm=/characters/<file>.vrm` で公開 `characters/` 配下の VRM を指定できる。指定がない場合や、異なるオリジン / `characters/` 外の URL は `/characters/default.vrm` に戻す。
    - `motion-debug` は開発者向け表示画面としてライブ / 記録 / 再生 / 指標モードを持ち、記録済み動作ログの層状態、再生状態、`MotionMetricSummary` を同じ画面で確認する。
    - Playwright から使う `window.__SINCRO_MOTION_DEBUG__` はフロントエンド開発者用ツールの内部 API として扱い、本番エンドポイント / JSON 契約には含めない。
    - ページ制御処理は `MotionDebugApp` を共通窓口とし、VRM URL 検証、カメラ / 固定データ由来、TrackerRuntime 橋渡し、再生、指標 / QA、ウィンドウ API 接続、VRM シーン / 描画頻度を `src/pages/motionDebug/motionDebug*Runtime.ts` と関連モジュールに分ける。公開ウィンドウ API 名・引数・戻り値は `types.ts` の `MotionDebugApi` を正本にし、内部モジュール境界の都合で増減させない。

## 変更時の確認

- 新しい通常ページを追加する場合:
    - Vite ビルド入力
    - Vite 経路別名
    - アプリの共通枠組み取り付け
    - 設定 / デバッグ利用可否
    - `documents/design/index.md`
- 実験用ページを通常導線へ昇格する場合:
    - ビルド / 手動確認
    - 既知の制約
    - 設計文書の更新
- 旧形式を復活させる判断が必要な場合:
    - ADR を追加して理由を明記する。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
