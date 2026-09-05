# ADR-260222 React移行

## 状態

- 採用済み

## 背景

プレーン TypeScript + DOM 直操作中心の UI 実装が拡大し、設定ダイアログ、デバッグ console、チャット / テロップ、ページ別起動処理の影響範囲が読みづらくなっていた。同時に Babylon.js 旧形式と Three.js + VRM 1.0 の描画系が混在していた。

## 決定

- Vite MPA は維持する。
- React は UIの共通枠組みから段階導入する。
- RTC、メディア、会話、VRM 描画などの中核処理 TypeScript 実装は再利用し、React コンポーネントから直接低レイヤを所有しない。
- Babylon.js 旧形式は通常導線と通常ビルドから外し、Three.js + VRM 1.0 を正本とする。

## 検討した選択肢

| 選択肢                      | 利点                                       | 欠点                                      |
| --------------------------- | ------------------------------------------ | ----------------------------------------- |
| Vite MPA + React 共通枠組み | 既存ページ構成を保ちながら UI を整理できる | MPA 項目と共通枠組みの境界設計が必要      |
| SPA 化                      | 振り分けと状態管理を統一しやすい           | WebRTC / メディア / 3D の移行範囲が大きい |
| DOM 管理処理継続            | 依存追加が少ない                           | UI 変更の影響範囲がさらに読みづらくなる   |

## 影響

- 現行 3D ページは `div#sincroPageRoot` 配下の Reactによるアプリの共通枠組みに集約する。
- ページの起動処理は薄く保ち、初期化処理 / 制御処理へ委譲する。
- React UI と中核処理の接続はアプリ制御 / 購読 API を通す。
- 完了済み移行ログは現在設計へ残さず、アーカイブとタスク done を参照する。

## 見直し条件

- ページ数が増え、MPA 維持より SPA 振り分けの方が明確に単純になった場合。
- React 以外の UI 枠組みへ移る明確な理由が生じた場合。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/frontend/pages.md`
- `documents/design/initiatives/react-migration.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
