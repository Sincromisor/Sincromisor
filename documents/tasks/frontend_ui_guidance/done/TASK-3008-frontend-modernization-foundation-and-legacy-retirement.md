# TASK-3008 フロントエンド近代化 Epic と legacy 整理ロードマップ

- 作成日: 2026-04-21
- ステータス: Done
- 完了日: 2026-04-21
- 優先度: High
- 種別: Epic

## 目的

`sincromisor-frontend` の近代化を `親タスク` として整理し、後続の実装タスクが `何を対象にし、どの順序で進めるか` を迷わない状態にする。

## 背景

- 当初の `TASK-3008` は、親タスクとしての役割に加えて `CSS`、`React 境界`、`Babylon legacy`、`コメント整備` の実装内容まで直接抱えており、`TASK-3009` から `TASK-3013` と完了条件が重複していた。
- この重複により、`3008 自体を done にする条件` と `子タスクを done にする条件` の境界が曖昧になっていた。
- レビュー結果を踏まえ、`3008` は Epic として `方針固定`、`子タスク定義`、`優先順位と依存関係の確定` に限定する。
- 実装や文書更新は `TASK-3009` から `TASK-3013` に委譲する。
- 特に今回の見直しでは、`TASK-3010` は現状のまま妥当、`TASK-3011` から `TASK-3013` は `未了の残件` ベースへ再スコープする。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/design/frontend_migration_react.md`
- `DESIGN.md`

## スコープ

- フロントエンド近代化全体の目的と非目的の整理
- `TASK-3009` から `TASK-3013` の責務分担整理
- 子タスク間の依存関係と実施順の確定
- 実装変更時に追従が必要な設計文書の洗い出し
- Epic 完了条件の定義

## 非対象

- CSS 設計やスタイル統合の実装そのもの
- React UI と Core 制御の具体的なリファクタ実装
- Babylon.js legacy ページの削除や build 設定変更そのもの
- コメント追加や設計文書更新の実作業そのもの
- `single` / `double` の再実装判断そのもの

## 対応方針

1. `TASK-3008` では実装詳細を再定義せず、`各子タスクが何を完了させるか` を明確にする。
2. `TASK-3009` を `守る対象と退役候補の分類`、`TASK-3010` を `CSS 基盤整理`、`TASK-3011` を `残存 direct manager 依存の移行`、`TASK-3012` を `legacy 導線の文書同期`、`TASK-3013` を `不足コメントの対象限定整備` として整理する。
3. Epic 完了条件は `子タスクの役割・順序・依存関係が確定していること` に置き、個別実装の完了は各子タスクで判定する。
4. 設計変更を伴う実装は、各子タスク側で `documents/design/*` 更新を伴う前提を明記する。

## Epic チェックリスト

### 1. 親子関係の明確化

- [x] `TASK-3008` が Epic として位置付けられている
- [x] `TASK-3009` から `TASK-3013` の責務分担が重複なく定義されている
- [x] 親タスクと子タスクで完了条件が二重化していない

### 2. 実施順と依存関係

- [x] 先に確定すべき分類タスクが `TASK-3009` だと明確になっている
- [x] `TASK-3010` は CSS 整理の独立タスクとして維持されている
- [x] `TASK-3011` から `TASK-3013` が現状実装との差分ベースで再スコープされている
- [x] `README` や設計文書更新がどの子タスクに紐づくか整理されている

### 3. Epic の成果物

- [x] フロントエンド近代化の全体像が読み取れる
- [x] 後続タスクの優先順位が明確になっている
- [x] 実装担当者が `次にどのタスクを進めるべきか` 判断できる

## 依存関係

1. `TASK-3009` を最初の固定点とし、`何を正系として守るか`、`何を legacy / deprecated として扱うか` を先に分類する。
2. `TASK-3010` は `TASK-3009` の分類結果を入力にして、modern 側で守る CSS 基盤と legacy style の境界を定義する。
3. `TASK-3011` は `TASK-3009` で優先対象になった modern 系ページを前提に、React 側の残存 direct manager 依存だけを縮退する。
4. `TASK-3012` は `TASK-3009` の分類結果と現行 build 構成を前提に、README・トップページ・設計文書の導線説明を同期する。
5. `TASK-3013` は `TASK-3009` から `TASK-3012` で固まった対象範囲と責務境界を受けて、コメント不足箇所だけを限定整備する。

## 子タスク責務マトリクス

| タスク | 主責務 | 先行入力 | 主成果物 | 主な更新責任 | このタスクでやらないこと |
| --- | --- | --- | --- | --- | --- |
| `TASK-3009` | サポート範囲とページ分類の固定 | 現在の HTML エントリ、描画基盤、build/public 導線 | `modern / legacy / experimental / deprecated` 分類表、保守対象一覧 | `README.md`、`documents/design/frontend_ui.md`、`documents/design/frontend_migration_react.md` | CSS 実装整理、React 境界実装、Babylon 削除実装 |
| `TASK-3010` | CSS 基盤と legacy style 境界の整理 | `TASK-3009` の分類結果 | token / layer / naming / nesting 方針、移行対象 CSS 一覧 | `documents/design/frontend_ui.md`、必要に応じて `README.md` | サポート範囲の再分類、React 境界整理 |
| `TASK-3011` | React 側の残存 direct manager 依存整理 | `TASK-3009` の優先対象、既存 `SincroAppController` 設計 | direct manager 依存一覧、移行先、優先順位、必要な bridge 変更 | `documents/design/frontend_ui.md`、`documents/design/frontend_migration_react.md` | CSS 方針決定、ページ分類や legacy 導線判断のやり直し |
| `TASK-3012` | legacy build/public 導線の文書同期 | `TASK-3009` の分類結果、現行 `build` / `build:all` 構成 | README・トップページ・設計文書の導線同期、`single` / `double` 扱い明文化 | `README.md`、`documents/design/frontend_ui.md`、`documents/design/frontend_migration_react.md` | build 分離の新規実装、Babylon 削除実装 |
| `TASK-3013` | 不足コメントの対象限定整備 | `TASK-3009` から `TASK-3012` で固まった対象範囲と責務境界 | コメント対象一覧、責務の入口コメント、必要最小限の補足文書 | `documents/design/frontend_ui.md`、`documents/design/frontend_migration_react.md`、必要に応じて `README.md` | コメントの全面追加、前段タスクの判断のやり直し |

## 子タスク

1. `TASK-3009`: フロントエンドのサポート範囲整理とページ分類
2. `TASK-3010`: CSS 基盤整備と legacy style 隔離
3. `TASK-3011`: React UI の残存 direct manager 依存整理と AppController 経由への移行
4. `TASK-3012`: legacy build/public 導線の文書同期と `single` / `double` 扱い確定
5. `TASK-3013`: 不足コメントの棚卸しと対象限定の責務コメント整備

## 実施順の目安

1. `TASK-3009` で `何を正系として守るか` と `何を legacy として扱うか` を固定する。
2. `TASK-3010` で modern 側 CSS の基盤と legacy style の境界を整理する。
3. `TASK-3011` で React 側に残る例外的な direct manager 依存を縮退する。
4. `TASK-3012` で build/public 導線と README・設計文書の説明を現状実装へ同期する。
5. `TASK-3013` で不足している入口コメントだけを対象限定で補い、読解コストを下げる。

## Epic を done にしてよい条件

- `TASK-3008` 自身が `実装タスク` ではなく `Epic` であることが文面上で明確になっている。
- `TASK-3009` から `TASK-3013` の責務、順序、依存関係、主な更新責任が読み取れる。
- `TASK-3010 は維持`、`TASK-3011` から `TASK-3013` は `未了の残件ベースへ再スコープ` という整理方針が子タスク文面へ反映されている。
- 親タスクの完了条件が、子タスクの実装完了を要求していない。

## Epic タスク

1. フロントエンド近代化の対象領域を `分類`、`CSS`、`UI 境界`、`legacy 導線`、`可読性整備` に分解する。
2. 各領域を `TASK-3009` から `TASK-3013` に割り当て、責務の重複をなくす。
3. 各子タスクの依存関係と推奨実施順を定義する。
4. 子タスクごとに更新対象となる設計文書・利用者向け文書の範囲を整理する。

## 想定変更箇所

- `documents/tasks/frontend_ui_guidance/done/TASK-3008-frontend-modernization-foundation-and-legacy-retirement.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3009-frontend-support-matrix-and-page-classification.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3010-css-foundation-and-legacy-style-isolation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3011-react-app-controller-boundary-and-ui-dependency-reduction.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3012-babylon-legacy-retirement-and-build-path-separation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3013-frontend-readability-comments-and-design-doc-alignment.md`

## 完了条件

- `TASK-3008` が Epic として再定義され、実装タスクと混同されていない
- `TASK-3009` から `TASK-3013` の役割分担が明確になっている
- `3010 は維持`、`3011 / 3012 / 3013 は未了の残件ベースへ再スコープ` という方針が反映されている
- 後続担当者が、各タスクをどの順で進めるべきか読み取れる
- `TASK-3008` を閉じても、各子タスクの入力と成果物の責任分担が失われない

## 確認

- `TASK-3008` の完了条件だけで個別実装の完了を要求していないことを確認する
- 子タスクの完了条件が親タスクと重複していないことを確認する
- レビュー指摘の `3008 は Epic 化` が文面上で明確になっていることを確認する

## 実施メモ

- 本タスクは `フロントエンド近代化を実装するタスク` ではなく、`実装タスク群を整理する Epic` である。
- 実装変更や設計文書更新は、各子タスクで扱う。
- 2026-04-21: Epic としての責務、子タスク依存、更新責任、完了判定を文書上で固定し、`done` へ移行する。
