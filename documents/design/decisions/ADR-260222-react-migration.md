# ADR-260222 React移行

## 状態

- 採用済み

## 背景

プレーンTypeScript + DOM直操作中心のUI実装が拡大し、設定ダイアログ、デバッグconsole、チャット / テロップ、ページ別起動処理の影響範囲が読みづらくなっていた。同時にBabylon.js旧形式とThree.js + VRM 1.0の描画系が混在していた。

## 決定

- Vite MPAは維持する。
- ReactはUIの共通枠組みから段階導入する。
- RTC、メディア、会話、VRM描画などの中核処理TypeScript実装は再利用し、Reactコンポーネントから下位層の処理を直接所有しない。
- Babylon.js旧形式は通常導線と通常ビルドから外し、Three.js + VRM 1.0を正本とする。

## 検討した選択肢

| 選択肢                     | 利点                                     | 欠点                                     |
| -------------------------- | ---------------------------------------- | ---------------------------------------- |
| Vite MPA + React共通枠組み | 既存ページ構成を保ちながらUIを整理できる | MPA項目と共通枠組みの境界設計が必要      |
| SPA化                      | 振り分けと状態管理を統一しやすい         | WebRTC / メディア / 3Dの移行範囲が大きい |
| DOM管理処理継続            | 依存追加が少ない                         | UI変更の影響範囲がさらに読みづらくなる   |

## 影響

- 現行3Dページは `div#sincroPageRoot`配下のReactによるアプリの共通枠組みに集約する。
- ページの起動処理は薄く保ち、初期化処理 / 制御処理へ委譲する。
- React UIと中核処理の接続はアプリ制御 / 購読APIを通す。
- 完了済みの移行記録は現在設計へ残さず、アーカイブとdone状態のタスクを参照する。

## 見直し条件

- ページ数が増え、MPA維持よりSPA振り分けの方が明確に単純になった場合。
- React以外のUI枠組みへ移る明確な理由が生じた場合。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/frontend/pages.md`
- `documents/design/initiatives/react-migration.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
