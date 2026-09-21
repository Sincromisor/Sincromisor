# Viteの非推奨ビルド設定を更新

## 背景 / 目的

TypeScriptソースの診断対象外だったvite.config.jsに、非推奨のbuild.rollupOptionsとoutput.manualChunksが残っていた。テスト時にはESM設定の__dirnameについても将来のnative設定読込みとの非互換警告が出る。

## 完了条件

- [x] rolldownOptionsとcodeSplitting.groupsのname関数へ移行し、既存のvendorチャンク分類を維持する。
- [x] __dirnameをimport.meta.dirnameへ変更し、native設定読込みでビルドできる。
- [x] 既定ビルド、チャンク分類の確認、ページ出力を確認する。

## 変更範囲と確認方法

vite.config.jsだけを変更する。採用Rolldown型定義に記載されたmanualChunksの内部変換と同じ構造を使い、分割条件、MPA入口、公開URLを維持する。プラグイン変更や依存更新は行わない。設定をNodeで直接読み込み、分類関数と出力HTMLを確認する。

## 文書同期

公開挙動は変わらないため設計変更は不要。

## 一次資料

2026-09-21確認。[Vite移行ガイド](https://vite.dev/guide/migration)と、採用Rolldownの型定義内にあるmanualChunksからcodeSplittingへの変換例を根拠とする。

## 確認結果

型検査・既定ビルドと `vite build --configLoader native` に合格。`node tasks/frontend/task-260921175828-modernize-vite-config/artifacts/check-config.mjs` で設定の直接読込み、React系依存の同一チャンク分類、Three.jsの本体・補助の分離、公開6ページのHTMLを確認した。Biomeとコメント点検: PASS。SWCプラグインからの別プラグイン推奨は非推奨指定ではないため依存変更は行っていない。実ブラウザーでの画面確認は未実施。
