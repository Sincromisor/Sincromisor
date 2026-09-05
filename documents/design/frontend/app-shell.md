# フロントエンドの共通枠組み

## 要約

- フロントエンドは Vite MPA を維持し、現行 3D ページは単一 Reactによるアプリの共通枠組みへ集約している。
- `simple-vrm`、`vrm360`、`looking-glass-vrm` は `div#sincroPageRoot` 配下でダイアログ / header / チャット / テロップ / 設定 / デバッグを描画する。
- WebRTC、UserMedia、CharacterGaze、VRM シーンの起動は `SincroAppController` と下位制御処理が束ねる。
- 物理構成は `app` / `features` / `character` / `shared` / `pages` を上位境界とし、旧 `src/ts` / `src/react` には新規実装を置かない。
- RTC 契約の正本は `contracts/frontend-rtc.md` に置く。

## 対象範囲

- 対象:
    - 現行フロントエンドのアプリの共通枠組み
    - React UI と TypeScript 中核処理の責務境界
    - 起動前ダイアログ、右側ツールパネル、診断 Console の所有境界
- 非対象:
    - VRM ボーン / 表情制御
    - WebRTC エンドポイント / 送受信データの詳細
    - 完了済み React 移行の作業ログ

## 責務

- `src/app/shell/sincroPageAppShell.tsx`
    - 現行 3D ページの React ルート。
    - ダイアログ、header、チャット、テロップ、右側ツールパネル、設定、デバッグをまとめて描画する。
- `src/app/shell/bootstrapSincroPageAppShell.tsx`
    - ページの起動処理から React ルートを取り付けし、ページ別操作パネルをアプリの共通枠組みへ渡す。
- `SincroAppController`
    - UI と中核処理の共通窓口。
    - 起動設定、RTC、メディア機器、診断用スナップショット、右側ツールパネル状態を束ねる。
- `SincroController`
    - UserMedia 取得、RTC 開始、CharacterGaze 開始、TalkManager 連携の実行時制御を担う。
- `RTCTalkClient`
    - PeerConnection、Offer/Answer、ICE 候補、DataChannel イベントを扱う。
- React 設定 / デバッグ構成要素
    - 表示と操作に専念し、WebRTC や MediaPipe の生制御を直接持たない。

## 物理構成

- `src/app/controller`
    - `SincroAppController` / `SincroController` と、RTC・音声・視線を束ねるアプリ全体の制御処理を置く。
- `src/app/events`
    - AppController のイベント集約点、スナップショットの通知、有効購読受け渡し、ウィンドウイベント接続処理を置く。
- `src/app/bridges`
    - AppController と旧形式管理処理 / サービス単一インスタンスの接続点、橋渡し型、実行時一式生成処理を置く。
- `src/app/settings`
    - 設定既定値 / スナップショット / 適用 / 起動状態 / 関連する送受信データキャッシュを置く。
    - `sincroAppSettingsDefaults.ts` は AppController スナップショット、React 代替処理、DialogStateStore、Looking Glass 実行時の既定値の正本を持つ。
- `src/app/react`
    - 有効 AppController 購読フック、パネル状態補助処理、UI 調整などアプリの共通枠組みから使う React 補助処理を置く。
- `src/features`
    - RTC、メディア、会話、ダイアログ、デバッグ、設定、視線などユーザー機能単位のモデル / React / 実行時を置く。
- `src/character`
    - VRM シーン、振る舞い、動作の変換、IK、ページ固有の VRM 実行時を置く。
- `src/shared`
    - ログ出力と横断型など、機能固有ではない基盤を置く。
- `src/pages`
    - Vite MPA の HTML / 項目 / ページ固有の React パネル / 開発者ページ実行時を置く。

## データ・状態

- 起動設定:
    - 音声入力機器
    - 視線カメラ機器
    - VRM URL
    - 会話モード
    - キャラクター動作 / 視線 / 姿勢オプション
- Runtime 状態:
    - RTC 接続状態
    - メディア機器スナップショット
    - VAD / 音声メートル
    - テキスト / テロップメッセージ
    - 視線 / 追跡診断情報
    - `sincro` 追跡中のカメラ品質案内。`SincroAppEvent` の
      `camera-quality-changed` / `camera-quality-reset` をパネル内の `PanelCameraGuideState` へ還元し、
      接続ページの診断情報一覧直前に先頭案内文言一件だけを表示する。`chat` モード、カメラ停止、
      追跡再初期化、有効制御処理解除では古くなった案内を残さない。
- UI 状態:
    - 起動前ダイアログ開く状態
    - 有効右側ツールパネル
    - 設定カテゴリ
    - デバッグタブ
    - sincro 設定の初期較正再試行状態。有効中は現在の段階、セッション要約、先頭案内文言、記録済み現在の段階の「再試行」を表示する。UI は本番較正制御処理を購読して Pose コールバックの評価結果を反映する。待機 / 中止はセッションフィールドと操作を表示しない。
    - simple-vrm パネルは `dialog_vrm_ui_state.vrmStatusText` の初期値確定後の変化を VRM 由来変更として扱い、有効初期較正を現在の `sessionId` で中断する。

## インターフェース

- 外部契約:
    - `documents/design/contracts/frontend-rtc.md`
- 内部イベント:
    - React UI はアプリ制御のスナップショット / 購読 API を使う。
    - 管理処理単一インスタンスへの直接依存は段階的に縮退させる。
    - ダイアログ設定は `DialogStateStore` に保持する。`DialogManager.getSetting` / `getSettings` で読み取り、`updateSettings` で部分更新する。アプリの設定適用処理は数値を正規化し、会話モードをキャラクター動作へ反映する。

## 設定・配備

- 通常確認:
    - `cd sincromisor-frontend && npm run build`
- dev サーバー:
    - `cd sincromisor-frontend && npm run dev`
- Vite ビルド入力:
    - `main`
    - `simple-vrm`
    - `vrm360`
    - `looking-glass-vrm`
    - `motion-debug`
    - `pose-landmarker-spike`

## 観測・失敗時の挙動

- 診断 Console は `Status` / `Audio` / `Messages` / `Gaze` / `Sincro` / `RTC` / `SDP` のタブ型診断を提供する。
- バックエンド未起動時は `config.json` 取得が失敗する。
- ブラウザ権限未付与時は `getUserMedia` が失敗する。
- `OrbitControls` の入力対象はキャラクターの操作領域に限定し、header / チャット / テロップ / 右側ツールと競合させない。

## 変更時の確認

- UIの共通枠組みを変更したら `frontend/pages.md` と `frontend/settings-and-debug-ui.md` の影響を確認する。
- RTC 接続仕様を変更したら `contracts/frontend-rtc.md` とバックエンドを同時確認する。
- メディア機器設定を変更したら起動前ダイアログと設定パネルの両方を確認する。
- 設定既定値を変更したら起動前ダイアログ、設定パネル、Looking Glass 実行時スナップショットの初期値一致を確認する。
- 現行ページの配置を変えたらデスクトップ / モバイルの表示確認を行う。

## 参照

- `documents/design/frontend/pages.md`
- `documents/design/frontend/settings-and-debug-ui.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`
