# React移行計画

## 要約

- React移行はUIの共通枠組みから始め、RTC / メディア / VRM中核処理はTypeScript実装を再利用する。
- Babylon.js旧形式は通常導線から外れ、現行3DページはReactによるアプリの共通枠組みに集約済みである。
- この文書は残りの移行・整理観点だけを扱い、完了済みの詳細ログはアーカイブとdone状態のタスクを参照する。

## 目標

- 現行フロントエンドのUIを管理する責務をReactによるアプリの共通枠組みに寄せ、DOM管理処理 / 単一インスタンス依存を必要最小限にする。
- ページの起動処理、初期化処理、制御処理、React UIの責務境界を読みやすく保つ。

## 対象範囲

- 対象
    - Reactによるアプリの共通枠組み
    - 設定 / 診断Console
    - App制御処理境界
    - 旧形式DOM依存関係削減
- 非対象
    - RTC通信規約変更
    - VRM動作アルゴリズム
    - バックエンド再設計

## 現在の状態

- 現行3Dページは `div#sincroPageRoot`配下のReactによるアプリの共通枠組みに集約済み。
- `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm`、`motion-debug`、`pose-landmarker-spike`が通常ビルド入力。
- Babylon.js旧形式は通常導線から削除済み。
- 診断Consoleと設定パネルは右側ツールの外枠配下で相互排他表示する。

## 目標の状態

- React UIはアプリ制御のスナップショット / 購読APIを通して実行時状態を読む。
- DOM IDは実行環境境界や互換が必要な箇所に限定する。
- 設定と診断は情報設計・表示・外枠の責務が分離されている。

## 残作業

| 領域   | 内容                                                       | 完了条件                       |
| ------ | ---------------------------------------------------------- | ------------------------------ |
| UI境界 | React UIから管理処理の単一インスタンスへの直接依存を減らす | アプリ制御経由に統一されている |
| 診断   | 診断情報の中核処理とUI表示の境界を保つ                     | スナップショット提供元が明確   |
| 文書   | 旧移行ログをアーカイブへ寄せる                             | 現在設計が短く読める           |

## 検証

- `cd sincromisor-frontend && npm run build`
- `simple-vrm`デスクトップ / モバイルの起動前ダイアログ、設定、診断Consoleを確認する。
- `vrm360` / `looking-glass-vrm`の共通枠組みが起動前UIで崩れないことを確認する。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/frontend/setting-and-debug-ui/README.md`
- `documents/design/decisions/ADR-260222-react-migration.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
