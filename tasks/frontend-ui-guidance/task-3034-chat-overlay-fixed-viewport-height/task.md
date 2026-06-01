# TASK-3034 chat overlay fixed viewport height

- 作成日: 2026-05-01
- 完了日: 2026-05-01
- ステータス: Done
- 優先度: High

## 目的

`#sincroChatBox` の表示領域を起動時から固定高で確保し、初期メッセージ投入時に top fade / clipping 領域が上へ移動して見える挙動を抑制する。

## 背景

- 既存の `#sincroChatBox` は `max-height` のみで表示上限を持ち、実際の高さはメッセージ量に応じて変化していた。
- `bottom` 固定の overlay で高さが増えるため、チャット領域の上端と `mask-image` の透明フェード位置が上へ伸びて見えた。
- ユーザーには起動時に透明部分が上へ移動するように見えるため、表示領域の初期安定化が必要だった。

## 対応内容

- `src/styles/sincroChatBox.css` に `--chatBoxViewportHeight` を追加し、desktop / tablet / mobile の高さ計算を token 化した。
- `#sincroChatBox` を `max-height` 依存から `height: var(--chatBoxViewportHeight)` に変更し、内容量ではなく viewport / breakpoint に基づく固定表示領域として確保した。
- `box-sizing: border-box` を追加し、padding を含めた clipping 領域を安定させた。
- `documents/design/frontend_ui.md` に、chat overlay の clipping / top fade 領域は起動時から固定高で確保する設計方針を追記した。

## 完了条件

- `#sincroChatBox` の表示領域が起動時から固定高で確保される。
- メッセージ追加量によって overlay 上端や top fade 位置が移動しない。
- `documents/design/frontend_ui.md` に方針が反映されている。
- `npm run build` が成功する。

## 確認結果

```sh
cd sincromisor-frontend
npm run build
```

- 成功。
- Vite の 500kB chunk warning は既存の bundle size 警告であり、本対応起因のエラーではない。
