# Frontend Pages

## Summary

- modern frontend は `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm` の 4 ページを通常ビルド対象にする。
- Babylon.js legacy ページは通常導線と通常ビルドから外れている。
- ページ差分は entry / initializer / scene option / page-specific settings に閉じ込める。

## Scope

- 対象:
    - Vite MPA のページ分類
    - modern / experimental の扱い
    - ページごとの設計確認入口
- 非対象:
    - 個別 UI component の実装詳細
    - legacy ページの保守

## Page Matrix

| Page                | 分類         | 役割                    | 主な確認文書                                              |
| ------------------- | ------------ | ----------------------- | --------------------------------------------------------- |
| `main`              | modern       | 通常導線の入口          | `frontend/app-shell.md`                                   |
| `simple-vrm`        | modern       | 通常会話の正規ルート    | `frontend/app-shell.md`, `frontend/character/overview.md` |
| `vrm360`            | experimental | 360 表示実験            | `frontend/character/overview.md`                          |
| `looking-glass-vrm` | experimental | Looking Glass + VRM 1.0 | `frontend/character/overview.md`                          |

## Responsibilities

- Entry files:
    - ページ固有 initializer を呼ぶ薄い入口に保つ。
- Initializer:
    - scene / page option を組み立て、app controller の起動へ委譲する。
- React app shell:
    - 共通 UI を描画し、ページ差分は props / controller option へ閉じ込める。

## Change Checklist

- 新しい通常ページを追加する場合:
    - Vite build input
    - app shell mount
    - settings / debug availability
    - `documents/design/index.md`
- experimental ページを通常導線へ昇格する場合:
    - build / manual verification
    - known limitations
    - design document update
- legacy を復活させる判断が必要な場合:
    - ADR を追加して理由を明記する。

## References

- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
