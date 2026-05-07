# TASK-3045 トップページ文言反映とUI簡素化の目視検証

- 作成日: 2026-05-07
- ステータス: Open
- 優先度: Medium
- 親タスク: `TASK-3041`
- 依存: `TASK-3042`, `TASK-3043`, `TASK-3044`

## 目的

レビュー済みCSVのトップページ文言を反映し、設定/セットアップ/右側ツールの簡素化後に、実画面として破綻がないか目視確認する。

## 背景

- トップページのモードカード文言は、英語説明から日本語のユーザー向け説明へ変更する方針になった。
- ヒーローリードには `<br>` を含む回答があり、HTMLとして適切に扱う必要がある。
- UI文言削除後は、単純にテキストが減るだけでなく、余白やカード高さ、タブと内容面のつながりも変わるため、目視確認が必要。

## スコープ

- `src/index.html` のヒーローリード
- トップページのモードカード説明
- simple-vrm / vrm360 / looking-glass-vrm の主要画面確認
- desktop / mobile の見た目確認
- 必要に応じた設計ドキュメント同期判断

## 非対象

- トップページの大規模デザイン変更
- 新規画像作成
- WebRTC / Looking Glass の機能変更

## 実装タスク

1. トップページのヒーローリードを `かわいいキャラクターになって話そう!` / `かわいいキャラクターとおしゃべりしよう!` に変更する。
2. `<br>` はHTMLとして自然に改行される形で処理する。
3. Simple Interface カード説明を `Webブラウザ、マイク、カメラ、VRM 1.0モデルだけで始められます。` に変更する。
4. 360deg Camera カード説明を `360度カメラ映像と連動できます(実験的)。` に変更する。
5. Looking Glass カード説明を `Looking Glassと連携し、より存在感のあるかわいさを実現します。` に変更する。
6. `TASK-3042` から `TASK-3044` までの変更後、Playwright で主要画面を確認する。
7. 文言削除後に残った余白、見出しだけのカード、意味のない枠があれば追加修正する。
8. 設計方針として残すべき場合は `documents/design/frontend_ui.md` など該当設計文書の更新要否を判断する。

## 実装対象候補

- `sincromisor-frontend/src/index.html`
- `sincromisor-frontend/src/styles/index.css`
- `sincromisor-frontend/src/react/app-shell/SincroPageAppShell.tsx`
- `sincromisor-frontend/src/react/settings-shell/settingsShell.css`
- `sincromisor-frontend/src/react/dialog/configurationDialogSettings.css`
- `documents/design/frontend_ui.md`

## 完了条件

- トップページの文言がレビュー回答に沿っている。
- `<br>` が不自然な文字列として画面に出ない。
- simple-vrm / vrm360 / looking-glass-vrm の右上ツール、基本設定、開発者ツール、初回セットアップが目視で破綻していない。
- mobile 幅でテキストが重ならず、ボタンやタブが読みやすい。
- `npm run build` が成功する。

## 確認コマンド案

```sh
cd sincromisor-frontend
npm run build
```

```sh
npm run dev
```

```sh
playwright-cli open http://127.0.0.1:5173/
playwright-cli open http://127.0.0.1:5173/simple-vrm/
playwright-cli open http://127.0.0.1:5173/vrm360/
playwright-cli open http://127.0.0.1:5173/looking-glass-vrm/
```

