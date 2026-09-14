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
    - ヘッダーの題名は既存の設定購読で文字列として描画する。起動前後と有効な制御処理の差し替えに追従し、空文字はモデル側で `Sincromisor` へ補正する。
    - ダイアログ、header、チャット、テロップ、右側ツールパネル、設定、デバッグをまとめて描画する。
- `src/app/shell/bootstrapSincroPageAppShell.tsx`
    - 各ページの `mainReact.tsx` が単一の起動元となり、操作パネル読込後にReactルートを配置する。全体の配置完了後、描画領域と操作領域の参照をページ初期化へ渡す。
    - 初期化は一度だけ試み、配置通知の再実行でもアプリを再生成しない。パネル読込・描画準備・初期化の失敗は共通のエラーログへ報告し、開始へ進まない。DOM探索・MutationObserver・待機タイマーは使わない。
- `SincroVRMInitializer`（`src/app/bootstrap`）
    - 基底と360度・Looking Glassの派生初期化処理、および配置済みDOM参照の契約を `app/bootstrap` に置く。シーン生成はページ別に行い、開始・保持・姿勢設定・通常設定同期は基底の共通手順で行う。
    - 生成時は依存と開始フックを組み立てる。Reactの配置完了から渡された2つのDOM参照を `bootstrap` が受け取り、ページ既定値・許可済みURL設定を `initialize` へ渡し、成功後に `startAutomatically` を呼ぶ。
    - 初期化は機器利用可否、初期設定適用、購読・キャッシュ復元の順に進める。同期失敗時は購読を解除し開始しない。キャッシュ失敗はログと既定表示で継続する。
    - OBSの内部起動順序を、派生ページ既定値やsimple-vrmのURL設定が適用済みになってから開始する順序へ是正した。重複開始はアプリが抑止する。
- `SincroAppController`
    - UI と中核処理の共通窓口。
    - 起動設定、RTC、メディア機器、診断用スナップショット、右側ツールパネル状態を束ねる。
    - `debug.vrmDiagnostics` はVRMからの診断通知を既存の診断管理へ渡す。結果の複製・保存は診断側が所有する。
    - `pose` は診断モデルの姿勢設定を取得・適用する窓口。通常設定を基準に診断側の保存強度を重ねてモデルへ復元し、`connectPoseSettings` はその現在値をシーンへ通知する。診断側操作も同じ通知先へ渡す。通常設定の強度操作は同値でも診断側の保存強度を解除して反映する。接続の解除は有効アプリが所有し、差し替え時に旧シーンへの通知を止める。
- `SincroController`
    - UserMedia 取得、RTC 開始、CharacterGaze 開始、TalkManager 連携の実行時制御を担う。
- `RTCTalkClient`
    - PeerConnection、Offer/Answer、ICE 候補、DataChannel イベントを扱う。
    - 停止・接続置換・回復不能な失敗では、接続世代の中断通知で診断・トラック・DataChannelの購読を解除する。旧世代の候補送信完了・失敗も状態通知へ反映しない。
- RTCの接続表示
    - ICE・シグナリングの保持状態を更新してから、RTC状態と接続表示を通知する。停止中・停止済みの表示は残っているICE診断値より優先する。
- `ChatMessageService` / `SincroChatView`
    - サービスは最新30件の履歴と変更通知を保持し、Reactがチャットを描画する。取り付け前の履歴、同一IDの更新、VRM読込後のアイコン変更もこの経路で反映する。
    - 通常本文は文字列として表示し、明示的な `trusted_html` はシステム・リセットメッセージだけに許可する。
- `TalkManager` / `SincroTelopView`
    - 管理処理は口形同期と最新6発話・合計240文字以内の文字列履歴を保持し、Reactが初期履歴と受信後の更新を描画する。空文字は空白として連結する。
    - 横幅を超えた表示はReact側で最新文字へスクロールし、旧DOM描画への切替は行わない。
- React 設定 / デバッグ構成要素
    - 表示と操作に専念し、WebRTC や MediaPipe の生制御を直接持たない。

## 物理構成

- `src/app/controller`
    - `SincroAppController` / `SincroController` と、RTC・音声・視線を束ねるアプリ全体の制御処理を置く。
- `src/app/events`
    - AppController のイベント集約点、スナップショットの通知、有効購読受け渡し、ウィンドウイベント接続処理を置く。
- `src/app/bridges`
    - AppController と管理処理 / サービス単一インスタンスの接続点、橋渡し型を置く。
    - `createSincroAppRuntimeBundle` が依存取得と `dialog` / `chat` / `debug` / `rtc` / `state` の操作窓口を一度に組み立てる。アプリ制御は組み立て後に設定の初期値を確定し、有効な制御処理の公開、購読登録の順に進む。
- `src/app/settings`
    - 設定既定値 / スナップショット購読 / 適用 / 起動状態を置く。
    - `sincroAppSettingsDefaults.ts` は AppController スナップショット、React 代替処理、設定モデル、Looking Glass 実行時の既定値の正本を持つ。
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
    - 各 `SincroAppController` は自分が登録した管理処理と `window` の購読解除関数を保持する。有効な制御処理の差し替えでは旧購読を解除してから新しい購読を接続する。解除を再実行しても共有サービスや新制御処理には影響しない。
    - Reactの設定値・操作可否・案内は `SincroAppController.settingsStore` の1つのスナップショットを `useSyncExternalStore` で購読する。内容が変わらない間は取得結果の参照を維持する。
    - 起動・接続・ページ固有状態は既存のイベント購読を使う。描画ごとのコールバックの作り直しでは再購読しない。VRMシーン向けの `settings_snapshot` イベントは維持する。
    - 通常設定の値・操作可否・適用規則・利用者編集通知は `app/settings/SincroAppSettingsModel` が所有する。アプリの組み立てが同じモデルを音声・視線・動作とダイアログへ渡し、ダイアログを生成せずに設定を利用できる。`DialogStateStore` は開閉・開始案内・VRM選択だけを保持する。機器通知は有効アプリが接続・解除し、ダイアログはモデルから開始案内を導出する。数値は設定モデルとLooking Glass適用処理で正規化し、会話モードの動作反映はアプリの適用処理が担う。

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

- UIの共通枠組みを変更したら `frontend/pages.md` と `frontend/setting-and-debug-ui/README.md` の影響を確認する。
- RTC 接続仕様を変更したら `contracts/frontend-rtc.md` とバックエンドを同時確認する。
- メディア機器設定を変更したら起動前ダイアログと設定パネルの両方を確認する。
- 設定既定値を変更したら起動前ダイアログ、設定パネル、Looking Glass 実行時スナップショットの初期値一致を確認する。
- 現行ページの配置を変えたらデスクトップ / モバイルの表示確認を行う。

## 参照

- `documents/design/frontend/pages.md`
- `documents/design/frontend/setting-and-debug-ui/README.md`
- `documents/design/archive/legacy-flat/frontend_ui.md`
- `documents/design/archive/legacy-flat/frontend_migration_react.md`

## 通常設定の保存と起動順序

機器・ページの利用可否確定後、`restoreSettings` がページ既定値、保存した利用者設定、有効なURL設定を一括適用する。完了してから設定購読・シーン接続と手動・OBS開始へ進む。通常設定の保存購読は利用者操作だけを受け取り、初期化・復元を保存しない。音声・視線・姿勢の調整は通常設定復元後に接続済みのモデルへ復元し、音声取得やシーン生成前に確定する。診断操作の保存購読も有効アプリの差し替えで解除する。保存形式と対象は[設定UI設計](setting-and-debug-ui/settings-design.md#保存と復元)を参照する。

視線コールバックは接続時に診断モデルの最新値を受け取り、姿勢設定はシーン生成前からモデルに保持する。保存・通常強度の優先順位と全設定初期化は[視線・姿勢調整の保存](setting-and-debug-ui/debug-design.md#視線姿勢調整の保存)を参照する。
