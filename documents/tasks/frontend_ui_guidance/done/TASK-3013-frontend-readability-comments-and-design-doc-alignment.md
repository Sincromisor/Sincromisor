# TASK-3013 不足コメントの棚卸しと対象限定の責務コメント整備

- 作成日: 2026-04-21
- ステータス: Done
- 優先度: Medium

## 目的

フロントエンド全体へ広くコメントをばらまくのではなく、`責務の入口説明が不足している箇所` を棚卸ししたうえで対象を限定し、初見でも修正入口を追いやすい状態にする。

## 背景

- `SincroController.ts` や `SincroAppController.ts` には、すでに入口コメントが入っている。
- 一方で `main-vrm.ts` のように、起動経路や存在意図が薄く、初見では役割を掴みにくいエントリも残っている。
- したがって課題は `主要ファイル全般にコメントがないこと` ではなく、`コメント密度に偏りがあり、薄い入口だけが残っていること` である。
- コメント追加を広く取り過ぎると、ノイズが増えてかえって読みづらくなるため、まず不足箇所の棚卸しが必要である。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3008-frontend-modernization-foundation-and-legacy-retirement.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3009-frontend-support-matrix-and-page-classification.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3010-css-foundation-and-legacy-style-isolation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3011-react-app-controller-boundary-and-ui-dependency-reduction.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3012-babylon-legacy-retirement-and-build-path-separation.md`

## スコープ

- コメント不足箇所の棚卸し
- 対象限定の責務コメント追加
- 必要に応じたディレクトリ導入メモ追加
- 設計文書との説明差分整理
- 初見読解コストを下げるための修正入口整備

## 非対象

- `主要ファイル全般` への一律コメント追加
- ロジック単位の逐次説明を全行へ付けること
- 機械的な大量コメント生成
- WebRTC や VRM 制御アルゴリズムの再設計
- CSS / legacy 整理そのもの
- ページ分類、CSS 境界、legacy 導線判断をここで再度やり直すこと

## 先行条件

- `TASK-3009` の対象分類、`TASK-3010` の CSS 責務境界、`TASK-3011` の UI 境界整理、`TASK-3012` の legacy 導線説明を踏まえて対象を絞る。
- 本タスクでは前段タスクの判断を再オープンせず、`どこに入口コメントが必要か` の限定整備に集中する。

## 対応方針

1. 先に `どこが不足しているか` を棚卸しし、対象リストを作る。
2. コメントは `何をしているか` より `どこから呼ばれ、なぜ存在するか` を短く説明する。
3. すでに十分な入口コメントがあるファイルには追記しない。
4. 設計文書更新は、コメント追加対象や責務説明と食い違う場合に限定して行う。

## 整理チェックリスト

### 1. 棚卸し

- [x] 主要エントリ、initializer、controller、hook、service のうちコメント不足箇所が一覧化されている
- [x] 既に十分なコメントがあるファイルと、追加対象ファイルが区別されている
- [x] 各対象ファイルについて、`何が分かりにくいのか` が整理されている

### 2. 対象限定の整備

- [x] `main-vrm.ts` のような薄い入口ファイルの扱いが整理されている
- [x] コメント追加対象が、初見で修正入口を追ううえで効果の高い箇所に絞られている
- [x] コメント追加がノイズ化しない粒度になっている

### 3. 文書同期

- [x] コメントの説明と `frontend_ui.md` / `frontend_migration_react.md` が矛盾していない
- [x] 必要に応じて README や設計文書の補足ポイントが整理されている
- [x] 変更後に、修正入口を追いやすくなったか確認できる

## 実装タスク

1. 主要エントリ、initializer、controller、service、hook を棚卸しし、コメント不足箇所を洗い出す。
2. `追加不要` と `追加対象` を分けた対象一覧を作る。
3. 効果の高い対象ファイルへ、責務の入口説明を中心に短いコメントを追加する。
4. 必要なら主要ディレクトリや設計文書へ、修正入口を追うための補足を追加する。
5. 変更後に、初見で修正入口を追いやすいか確認する。

## 想定変更箇所

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- 必要に応じて `README.md`
- `sincromisor-frontend/src/ts/main-vrm.ts`
- 必要に応じて `sincromisor-frontend/src/ts/App/**`
- 必要に応じて `sincromisor-frontend/src/react/**`
- 必要に応じて `sincromisor-frontend/src/ts/UI/**`
- 必要に応じて `sincromisor-frontend/src/ts/SincroLegacy/**`

## 完了条件

- コメント不足箇所の棚卸し結果がある
- コメント追加対象が限定され、対象選定の理由が説明できる
- 追加したコメントが `責務の入口説明` として機能している
- コメントと設計文書の説明が食い違っていない

## 確認

- `主要ファイル全般にコメントを足す` タスクになっていないことを確認する
- 既に十分なコメントがあるファイルへ不要な追記をしていないことを確認する
- コメント追加対象が、初見読解コストの高い箇所に絞られていることを確認する

## 実施メモ

- 本タスクは `コメントを増やすこと` ではなく、`不足している入口説明だけを補うこと` が目的である。
- 先行する `TASK-3009` から `TASK-3012` の整理結果を踏まえて行うのが望ましい。
- 2026-04-22 実施内容:
    - `documents/design/frontend_ui.md` に入口コメントの棚卸し結果を追加し、`追加不要` と `追加対象` を分けて判断理由を明文化した。
    - `documents/design/frontend_migration_react.md` に、`main-react.tsx` 系を薄い mount 入口として保ち、詳細な購読/設定反映は hook / controller 側へ寄せる方針を追記した。
    - 実装側では `main-vrm.ts`、`main-legacy.ts`、`vrm360/main-vrm360.ts`、`looking-glass-vrm/main-vrm-looking-glass.ts`、各 `main-react.tsx` に、どのページから呼ばれ、何を下位 initializer / React UI へ委譲しているかを示す責務コメントを追加した。
    - `SincroController`、`SincroAppController`、各 initializer、主要 hook / service は既存コメントで責務を追えるため、追加対象から外した。
    - `cd sincromisor-frontend && npm run build` を実行し、ビルド成功を確認した。既知の警告として `vendor_misc -> vendor_react -> vendor_misc` の circular chunk 警告は継続している。
