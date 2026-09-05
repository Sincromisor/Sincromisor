# フロントエンドのページ構成

## 要約

- 現行フロントエンドは `main`、`simple-vrm`、`vrm360`、`looking-glass-vrm`、`motion-debug`、`pose-landmarker-spike` の 6 ページを通常ビルド対象にする。
- Babylon.jsの旧ページと関連実装・依存は削除済み。
- 生成元の起動処理は `sincromisor-frontend/src/pages/*` に集約し、Vite の経路別名で既存公開 URL を維持する。
- ページ差分は項目 / 初期化処理 / シーン選択肢 / ページ固有の設定に閉じ込める。

## 対象範囲

- 対象:
    - Vite MPA のページ分類
    - 現行 / 実験用の扱い
    - ページごとの設計確認入口
- 非対象:
    - 個別 UI コンポーネントの実装詳細
    - 旧形式ページの保守

## ページ一覧

分類の「実験用」も通常ビルドに含まれる。ビルド入力と公開URLの正本は [Vite設定](../../../sincromisor-frontend/vite.config.js) である。

| ページ                  | 生成元の起動処理                           | 公開 URL                  | 分類   | 役割                      | 主な確認文書                                                     |
| ----------------------- | ------------------------------------------ | ------------------------- | ------ | ------------------------- | ---------------------------------------------------------------- |
| `main`                  | `src/pages/main/index.html`                | `/`                       | 現行   | 通常導線の入口            | `frontend/app-shell.md`                                          |
| `simple-vrm`            | `src/pages/simpleVrm/index.html`           | `/simple-vrm/`            | 現行   | 通常会話の正規ルート      | `frontend/app-shell.md`, `frontend/character/overview.md`        |
| `vrm360`                | `src/pages/vrm360/index.html`              | `/vrm360/`                | 実験用 | 360 表示実験              | `frontend/character/overview.md`                                 |
| `looking-glass-vrm`     | `src/pages/lookingGlassVrm/index.html`     | `/looking-glass-vrm/`     | 実験用 | Looking Glass + VRM 1.0   | `frontend/character/overview.md`                                 |
| `motion-debug`          | `src/pages/motionDebug/index.html`         | `/motion-debug/`          | 実験用 | Pose 動作の変換 / IK 調整 | `frontend/character/motion.md`, `frontend/character/tracking.md` |
| `pose-landmarker-spike` | `src/pages/poseLandmarkerSpike/index.html` | `/pose-landmarker-spike/` | 実験用 | MediaPipe Pose 性能検証   | `frontend/character/tracking.md`                                 |

## 責務

- 起動ファイル:
    - `src/pages/*` 配下に置き、ページ固有初期化処理を呼ぶ薄い入口に保つ。
    - 由来ディレクトリは camelCase、公開 URL は既存 kebab-case 経路を維持する。
    - `simple-vrm` の VRM 項目は `src/pages/simpleVrm/mainVrm.ts`、React パネルは `src/pages/simpleVrm/react/*` に置く。
    - `vrm360` / `looking-glass-vrm` の React パネルは各 `src/pages/<page>/react/*` に置き、通常アプリの共通枠組みの上へページ固有の操作パネルとして渡す。
- Vite 経路別名:
    - dev では旧公開 URL を `src/pages/*` の HTML へ内部書き換えする。
    - ビルド後は `dist/pages/*/index.html` を `dist/<public-route>/index.html` へ移し、プレビュー / 配信 URL を変えない。
- 初期化処理:
    - シーン / ページ選択肢を組み立て、アプリ制御の起動へ委譲する。
- Reactによるアプリの共通枠組み:
    - 共通 UI を描画し、ページ差分はプロパティ / 制御処理選択肢へ閉じ込める。
- 開発者向けページ:
    - `motion-debug` は AppShell / RTC / チャット / 起動前ダイアログを持たず、カメラ / 追跡処理 / VRM 動作の変換の観測に限定する。
    - `motion-debug` は `?vrm=/characters/<file>.vrm` で公開 `characters/` 配下の VRM を指定できる。指定がない場合や、異なるオリジン / `characters/` 外の URL は `/characters/default.vrm` に戻す。
    - `motion-debug` は開発者向け表示画面としてライブ / 記録 / 再生 / 指標モードを持ち、記録済み動作ログの層状態、再生状態、`MotionMetricSummary` を同じ画面で確認する。
    - Playwright から使う `window.__SINCRO_MOTION_DEBUG__` はフロントエンド開発者用ツールの内部 API として扱い、本番エンドポイント / JSON 契約には含めない。
    - ページ制御処理は `MotionDebugApp` を共通窓口とし、VRM URL 検証、カメラ / 固定データ由来、TrackerRuntime 橋渡し、再生、指標 / QA、ウィンドウ API 接続、VRM シーン / 描画頻度を `src/pages/motionDebug/motionDebug*Runtime.ts` と関連モジュールに分ける。公開ウィンドウ API 名・引数・戻り値は `types.ts` の `MotionDebugApi` を正本にし、内部モジュール境界の都合で増減させない。

## 変更時の確認

- 新しい通常ページを追加する場合:
    - Vite ビルド入力
    - Vite 経路別名
    - アプリの共通枠組み取り付け
    - 設定 / デバッグ利用可否
    - `documents/design/index.md`
- 実験用ページを通常導線へ昇格する場合:
    - ビルド / 手動確認
    - 既知の制約
    - 設計文書の更新
- 旧形式を復活させる判断が必要な場合:
    - ADR を追加して理由を明記する。

## 参照

- `documents/design/frontend/app-shell.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
