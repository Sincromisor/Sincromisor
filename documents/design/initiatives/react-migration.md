# React移行計画

## 要約

- React 移行は UIの共通枠組みから始め、RTC / メディア / VRM 中核処理は TypeScript 実装を再利用する。
- Babylon.js 旧形式は通常導線から外れ、現行 3D ページは Reactによるアプリの共通枠組みに集約済みである。
- この文書は残りの移行・整理観点だけを扱い、完了済みの詳細ログはアーカイブとタスク done を参照する。

## 目標

- 現行フロントエンドの UI 所有者を Reactによるアプリの共通枠組みに寄せ、DOM 管理処理 / 単一インスタンス依存を必要最小限にする。
- ページの起動処理、初期化処理、制御処理、React UI の責務境界を読みやすく保つ。

## 対象範囲

- 対象:
    - Reactによるアプリの共通枠組み
    - 設定 / 診断 Console
    - App 制御処理境界
    - 旧形式 DOM 依存関係削減
- 非対象:
    - RTC 通信規約変更
    - VRM 動作アルゴリズム
    - バックエンド再設計

## 現在の状態

- 現行 3D ページは `div#sincroPageRoot` 配下の Reactによるアプリの共通枠組みに集約済み。
- `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm`、`motion-debug`、`pose-landmarker-spike` が通常ビルド入力。
- Babylon.js 旧形式は通常導線から削除済み。
- 診断 Console と設定パネルは右側ツールの外枠配下で相互排他表示する。

## 目標の状態

- React UI はアプリ制御のスナップショット / 購読 API を通して実行時状態を読む。
- DOM ID は実行環境境界や互換が必要な箇所に限定する。
- 設定と診断は情報設計・表示・外枠責務が分離されている。

## 残作業

| 領域    | 内容                                                  | 完了条件                       |
| ------- | ----------------------------------------------------- | ------------------------------ |
| UI 境界 | React UI から管理処理単一インスタンス直接依存を減らす | アプリ制御経由に統一されている |
| 診断    | 診断情報中核処理と UI 表示の境界を保つ                | スナップショット提供元が明確   |
| 文書    | 旧移行ログをアーカイブへ寄せる                        | 現在設計が短く読める           |

## 検証

- `cd sincromisor-frontend && npm run build`
- `simple-vrm` デスクトップ / モバイルの起動前ダイアログ、設定、診断 Console を確認する。
- `vrm360` / `looking-glass-vrm` の共通枠組みが起動前 UI で崩れないことを確認する。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/frontend/settings-and-debug-ui.md`
- `documents/design/decisions/ADR-260222-react-migration.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
