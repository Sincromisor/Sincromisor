# Three.jsの読み込み元を統一して重複配信を解消

## 背景 / 目的

アプリの `three/src/...` と依存ライブラリの `three` が混在し、ビルド結果にソース側と配布用の同じ実装が含まれる。2026-10-17の調査では、Three.js 0.186.1でアプリの読み込み元だけを統一すると対象JSが904,963→571,598バイト、gzip後が217,132→141,403バイトになった。これは参考実測であり固定の合格値ではない。

優先度: 高。2026-10-17のフロントエンド改善調査に基づく。

## 依存関係

なし。

## 担当範囲と設計判断

- 担当はフロントエンドのThree.js読み込み宣言と、それに直接依存するテスト・モック。`src/character`を中心に`src`全体の`three/src/`参照を調べて変更する。
- 公開されているクラス・定数・型は `three` から読み、`three/addons/...` はそのまま使う。新たな別名設定や依存追加は行わない。
- 描画ロジック、VRM最適化、依存版、チャンク分割方針は対象外。ファイル数は多いが、担当責務は読み込み元の統一に限定する。

## 完了条件

- [x] アプリと関連テストの `three/src/...` 直接参照を公開入口へ統一し、ビルド結果でThree.jsの `src` と `build` に由来する同じ中核実装の重複が解消している。
- [x] 型と既存の描画・姿勢・再生の挙動を維持する。変更前後の対象チャンク容量を圧縮前・gzip後で記録する。

## 確認方法

コマンドはリポジトリルートから実行する。型検査は `node_modules/.bin/tsc -p sincromisor-frontend/tsconfig.modern.json`、対象テストは `npm run test -- <対象パス>` を使う。ブラウザー確認では既存の[Playwright CLI利用ルール](../../../documents/rules/playwright-cli.md)に従う。

- `npm run build`、変更した読み込みを使う既存のcharacter・motionDebugテストを実行する。読み込み変更だけを検査する新規テストは不要。
- Viteの出力モジュール一覧で `three/src/math/Vector3.js` と `three/build/three.core.js` などの重複を確認し、容量を比較する。通常VRM表示を開発ブラウザーで一度確認する。

## 文書同期

実装入口の統一であり、外部契約・責務・配信URLは維持する。設計文書の変更は不要。

## 参照

[`src/character/scene/vrmScene.ts`](../../../sincromisor-frontend/src/character/scene/vrmScene.ts)、[`vite.config.js`](../../../sincromisor-frontend/vite.config.js)

## 実施結果

- 70ファイルのThree.js参照を公開入口へ統一した。依存版・描画処理・分割設定は維持した。
- 対象チャンクは904,963→571,598バイト、gzipは217,132→141,403バイト。Vite出力モジュールは245→2で、`src/math/Vector3.js`が消え、`build/three.core.js`へ統一された。
- ビルド、対象Biome、character・motionDebugの478テストが成功（既存3テストはスキップ）。通常VRMSceneの読込・描画を専用Chromeで確認した。
- 開発配信にはRTCバックエンドがなく設定取得は404となるため、会話接続は確認対象外とした。
