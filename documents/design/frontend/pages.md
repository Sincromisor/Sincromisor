# Frontend Pages

## Summary

- modern frontend は `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm`、`motion-debug`、`pose-landmarker-spike` の 6 ページを通常ビルド対象にする。
- Babylon.js legacy ページは通常導線と通常ビルドから外れている。
- source entry は `sincromisor-frontend/src/pages/*` に集約し、Vite の route alias で既存公開 URL を維持する。
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

| Page                    | Source entry                               | 公開 URL                  | 分類         | 役割                    | 主な確認文書                                                     |
| ----------------------- | ------------------------------------------ | ------------------------- | ------------ | ----------------------- | ---------------------------------------------------------------- |
| `main`                  | `src/pages/main/index.html`                | `/`                       | modern       | 通常導線の入口          | `frontend/app-shell.md`                                          |
| `simple-vrm`            | `src/pages/simpleVrm/index.html`           | `/simple-vrm/`            | modern       | 通常会話の正規ルート    | `frontend/app-shell.md`, `frontend/character/overview.md`        |
| `vrm360`                | `src/pages/vrm360/index.html`              | `/vrm360/`                | experimental | 360 表示実験            | `frontend/character/overview.md`                                 |
| `looking-glass-vrm`     | `src/pages/lookingGlassVrm/index.html`     | `/looking-glass-vrm/`     | experimental | Looking Glass + VRM 1.0 | `frontend/character/overview.md`                                 |
| `motion-debug`          | `src/pages/motionDebug/index.html`         | `/motion-debug/`          | experimental | Pose retarget / IK 調整 | `frontend/character/motion.md`, `frontend/character/tracking.md` |
| `pose-landmarker-spike` | `src/pages/poseLandmarkerSpike/index.html` | `/pose-landmarker-spike/` | experimental | MediaPipe Pose 性能検証 | `frontend/character/tracking.md`                                 |

## Responsibilities

- Entry files:
    - `src/pages/*` 配下に置き、ページ固有 initializer を呼ぶ薄い入口に保つ。
    - source directory は camelCase、公開 URL は既存 kebab-case route を維持する。
    - `simple-vrm` の VRM entry は `src/pages/simpleVrm/mainVrm.ts`、React panel は `src/pages/simpleVrm/react/*` に置く。
    - `vrm360` / `looking-glass-vrm` の React panel は各 `src/pages/<page>/react/*` に置き、通常 app shell の上へ page-specific control panel として渡す。
- Vite route alias:
    - dev では旧公開 URL を `src/pages/*` の HTML へ内部 rewrite する。
    - build 後は `dist/pages/*/index.html` を `dist/<public-route>/index.html` へ移し、preview / 配信 URL を変えない。
- Initializer:
    - scene / page option を組み立て、app controller の起動へ委譲する。
- React app shell:
    - 共通 UI を描画し、ページ差分は props / controller option へ閉じ込める。
- Developer pages:
    - `motion-debug` は AppShell / RTC / chat / startup dialog を持たず、camera / tracker / VRM retarget の観測に限定する。
    - `motion-debug` は `?vrm=/characters/<file>.vrm` で public `characters/` 配下の VRM を指定できる。指定がない場合や、cross-origin / `characters/` 外の URL は `/characters/default.vrm` に戻す。
    - `motion-debug` は developer viewer として live / recording / replay / metrics mode を持ち、recorded motion log の layer status、replay state、`MotionMetricSummary` を同じ画面で確認する。
    - Playwright から使う `window.__SINCRO_MOTION_DEBUG__` は frontend developer tooling の内部 API として扱い、本番 endpoint / JSON 契約には含めない。

## Change Checklist

- 新しい通常ページを追加する場合:
    - Vite build input
    - Vite route alias
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
