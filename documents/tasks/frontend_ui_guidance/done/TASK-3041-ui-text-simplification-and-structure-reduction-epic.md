# TASK-3041 UI文言簡素化と不要階層削減 Epic

- 作成日: 2026-05-07
- ステータス: Done
- 優先度: High
- 親タスク: なし
- 依存: なし

## 目的

フロントエンドUIに表示されている冗長な説明文、内部都合の文言、重複した見出し階層を整理し、画面を見れば分かることをテキストで説明しすぎないUIへ戻す。

## 基本原則

- UIを見れば分かるものは、いちいちテキストにしない。
- UIで理解させる。
- Keep It Simple。
- `回答` 列を最終文言案として扱う。
- `備考` がある場合は `修正案` / `回答` より優先する。
- `備考=不要` または不要判断が明確なものは削除する。
- 接続通知は現状の想定どおり動作しているため、基本的に残す。

## 背景

- `frontend-ui-text-review` のレビューにより、設定パネル、初回セットアップ、右上ツール、Debug Console、トップページで冗長な文言が多数確認された。
- 現状の `SettingsShell` は `badge` / shell title / shell description / page title / page description / card title / card description のように階層が重く、同じ意味の説明が複数箇所に出る。
- `接続` ページでは「接続状態の確認と開始・停止」という目的に対して、ページ説明、カード説明、状態カード内ヒント、診断誘導が重複している。
- `Looking Glass` には開始・終了の概念があるが、会話セッションとは別概念であり、文言上で混ざると誤解を生む。
- `enableTalk` / `enableInspector` など、過去のデバッグや Babylon.js 時代の名残と思われる開始時設定がUIに残っている可能性がある。

## 参照資料

- レビュー済みCSV: `/Users/aki/Downloads/frontend-ui-text-review - frontend-ui-text-review.csv`
- 作業前ドラフトCSV: `documents/tasks/frontend-ui-text-review.csv`

## 子タスク

- `TASK-3042`: 右上ツールとパネル外枠の文言整理
- `TASK-3043`: SettingsShell / 設定パネル / 初回セットアップの階層削減
- `TASK-3044`: 開始時設定の整理と Looking Glass セッション文言分離
- `TASK-3045`: トップページ文言反映と全体目視検証

## 非対象

- WebRTC の接続通知文言変更
- WebRTC endpoint / payload / signaling 仕様変更
- Debug Console の計測項目追加
- Looking Glass の起動・終了機能そのものの変更

## 完了条件

- レビューCSVの `回答` / `備考` 方針が実装へ反映されている。
- 設定パネルと初回セットアップで、同じ意味の説明が複数階層に出ない。
- 右上ツール領域が `基本設定` と `開発者ツール` の役割に整理されている。
- `enableTalk` は原則常時有効として扱われ、不要なUI項目として露出しない。
- `enableInspector` は現行 Three.js 経路で意味がない場合、UIから削除または非露出化されている。
- Looking Glass の開始・終了は会話接続と混ざらない文言になっている。
- desktop / mobile で文言削除後の余白、見出し、ボタン配置が崩れていない。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

```sh
playwright-cli open http://127.0.0.1:5173/simple-vrm/
playwright-cli resize 1280 720
playwright-cli resize 390 844
```

## 完了メモ

- 2026-05-07: 子タスク `TASK-3042` から `TASK-3045` までが Done になり、UI文言簡素化、階層削減、開始時設定整理、トップページ文言確認を完了した。
- 2026-05-07: `documents/design/frontend_ui.md` を現行方針へ同期し、右上ツールと SettingsShell の簡素化方針を設計正本へ反映した。
