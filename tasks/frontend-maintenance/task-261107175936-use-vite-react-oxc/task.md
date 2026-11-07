# ViteのReact変換を標準Oxc経路へ移行する

## 背景 / 目的

Vite 8を導入済みだが、SWC固有プラグインを使わないままplugin-react-swcが残り、起動時に標準経路への移行警告が出る。標準のplugin-reactに揃えて不要なSWC依存を除く。

## 完了条件

- [x] Vite 8対応のplugin-reactへ置換し、package-lockと設定を同期する。
- [x] MPAの公開URL、React自動JSX変換、Fast Refresh、Workerビルドを維持する。
- [x] SWC固有依存が不要になったことを依存ツリーで確認する。
- [x] 型・本番ビルド・全体Vitestと、開発ページでのFast Refreshを確認する。
- [x] 現行設計とタスク記録へ採用理由・検証結果を反映する。

## 範囲と確認

依存関係、ViteのReactプラグイン指定、ページ設計を対象とする。React CompilerやBabelプラグインは追加しない。既存のchunk分割・MPA経路は維持する。開発用の合成ページで状態を持つReact部品を更新し、ページ再読込なしの反映と状態維持を確認した後に削除する。

根拠: [Vite公式プラグイン](https://vite.dev/plugins/)（2026-11-07確認）。plugin-reactはOxcによるFast Refreshを提供し、plugin-react-swcはSWCプラグインを使う用途に対応する。

## 実施結果

plugin-react 6.2.1（Vite 8対応）へ移行し、lockfileからplugin-react-swcとSWC依存を削除した。追加の変換プラグインは導入していない。

- Node 26.12.1 / npm 11.21.1で依存解決と本番ビルドを実行し、型確認・MPA 6入口・音声/追跡Workerの出力を確認した。
- 全体Vitestは138ファイル・749件成功、既存の2ファイル・3件スキップ。今回のVAD・顔・手の回帰試験も含む。
- Chromeの専用セッションで合成React部品を更新し、表示が「更新前: 1」から「更新後: 1」へ変わり、ページ内の識別値も維持された。Fast Refreshによる状態保持を確認した。
- 開発時の公開URL 6件のHTTP 200とRefreshコードの注入を確認した。合成ページを削除し、自分のブラウザーとサーバーを終了した。
- 依存ツリーにSWCが無いこと、対象Biome、Markdown、タスク整合性を確認した。コメント点検: PASS。

ビルドの既存の大きいchunkとcodeSplittingのdebugName未指定の助言は残る。実端末での処理速度比較は未実施であり、性能向上を検証結果には含めない。先行タスクの実マイク・実カメラによる精度確認も今回のブラウザー確認には含めない。
