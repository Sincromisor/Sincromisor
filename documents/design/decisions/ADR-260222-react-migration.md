# ADR-260222 React Migration

## Status

- Accepted

## Context

プレーン TypeScript + DOM 直操作中心の UI 実装が拡大し、設定 dialog、debug console、chat / telop、ページ別 bootstrap の影響範囲が読みづらくなっていた。同時に Babylon.js legacy と Three.js + VRM 1.0 の描画系が混在していた。

## Decision

- Vite MPA は維持する。
- React は UI shell から段階導入する。
- RTC、Media、Talk、VRM 描画などの core TypeScript 実装は再利用し、React component から直接低レイヤを所有しない。
- Babylon.js legacy は通常導線と通常ビルドから外し、Three.js + VRM 1.0 を正本とする。

## Options Considered

| 選択肢                 | 利点                                       | 欠点                                       |
| ---------------------- | ------------------------------------------ | ------------------------------------------ |
| Vite MPA + React shell | 既存ページ構成を保ちながら UI を整理できる | MPA entry と shared shell の境界設計が必要 |
| SPA 化                 | routing と状態管理を統一しやすい           | WebRTC / media / 3D の移行範囲が大きい     |
| DOM manager 継続       | 依存追加が少ない                           | UI 変更の影響範囲がさらに読みづらくなる    |

## Consequences

- modern 3D ページは `div#sincroPageRoot` 配下の React app shell に集約する。
- page entry は薄く保ち、initializer / controller へ委譲する。
- React UI と core の接続は app controller / subscription API を通す。
- 完了済み移行ログは current design へ残さず、archive と task done を参照する。

## Review Conditions

- ページ数が増え、MPA 維持より SPA routing の方が明確に単純になった場合。
- React 以外の UI framework へ移る明確な理由が生じた場合。

## References

- `documents/design/frontend/app-shell.md`
- `documents/design/frontend/pages.md`
- `documents/design/initiatives/react-migration.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
