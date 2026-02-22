# Frontend UI / アプリ制御設計

SincromisorフロントエンドのUI層とアプリ制御層（初期化、RTC連携、表示更新）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/frontend_ui.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-22
- ステータス: Active

## 2. 目的とスコープ

- 目的: フロントエンドUI層の画面構成、初期化処理、RTC連携、メッセージ表示の責務を明確化する
- 対象範囲:
  - `sincromisor-frontend/src/ts/SincroController.ts` を中心とした制御
  - UIコンポーネント（Dialog/Chat/Debug/Pop）
  - Vite MPA構成とHTML partial
- 非対象範囲:
  - VRMボーン制御や表情制御の詳細（`frontend_character.md` で扱う）
  - サーバー側のシグナリング実装詳細
- LLM向け要約（3-5行）:
  - エントリは `main-vrm.ts`（VRM系）と `main-legacy.ts`（legacy系）で分岐する。2026-02-22 時点で default build は VRM系優先（legacy は `build:all` 時のみ）で、modern 側には `simple-vrm`, `vrm360`, `looking-glass-vrm` を含む。
  - `SincroVRMInitializer` / `SincroInitializer` は `SincroAppController` を先行生成し、`start()` 呼び出しでアプリ起動を開始する（2026-02-22以降）。
  - `SincroController` は `start()` 内で UserMedia 取得、RTC開始、CharacterGaze開始を統括する。
  - チャット文は `text_ch`、テロップは `telop_ch` で受信し、`TalkManager` 経由でUI/口形同期に渡す。
  - React への段階移行計画は `documents/design/frontend_migration_react.md` を参照（本書は現行UI設計の正本）。
  - `simple-vrm`, `vrm360`, `looking-glass-vrm` では React 設定パネル（`SimpleVrmControlPanel` 系）を段階導入中。現行の表示コンポーネントは `SimpleVrmControlPanel`（旧 `SimpleVrmReactPanel`）で、`vrm360` は `Vrm360ControlPanel`、`looking-glass-vrm` は `LookingGlassVrmControlPanel` ラッパーから再利用する。`useSimpleVrmPanelState` hook を共有して横展開している。表示は常時ではなく、ヘッダー右上の Debug Menu 内 `Open Settings Panel` から開く。閉じる操作は Debug Console と同様に右上の X ボタン、およびメニュー外/パネル外のクリック（タップ由来 click を含む）で行う。`DebugConsoleManager` が `#sincroReactSettingsPanelContainer` の開閉を管理し、Debug Console と同じメニュー系の開閉導線・外側クリック閉じの実装パターンを共有する。Debug Menu には `Open Startup Dialog` も追加しており、起動前設定 dialog を再表示できる。Start/Stop は `SincroAppController` 直操作とし、controller 未接続時は disabled。接続状態は `SincroAppController` 導出の `connection_state` を優先表示する。設定UIは `titleText` / `talkMode`、主要マイク設定トグル（NS/EC/AGC/VAD Gate/Venue）、Character/Gaze/AutoMute、起動前設定トグル（Talk/Inspector/VR）、および Looking Glass runtime 設定（`lgTileHeight`, `lgNumViews`, `lgTargetY`, `lgDepthiness`, `lgFovyDeg`）を `settings_snapshot / applySettings(...)` 経由で読み書きする。Looking Glass runtime 設定は `LookingGlassRuntimeConfig` に保持され、次回 Looking Glass セッション開始時の polyfill 初期化へ反映される。`SincroAppController.applySettings(...)` は LG 設定を範囲丸め/step丸めして正規化する。LG 設定には `Default` / `Portrait` / `Wide` プリセットを用意する。`SincroAppController` は `looking_glass_config_status`（次回反映待ち/再読込推奨/変更キー一覧 + 項目別の `reloadRecommendedKeys` / `nextSessionKeys`）も通知し、`looking-glass-vrm` の React パネル上段に表示する。`LookingGlassXRController` は config 更新イベントを監視し、非アクティブ時は次回開始に向けて polyfill 再初期化フラグを立てるため、セッション終了後は `reloadRecommended` を解除して `nextSession` 扱いに戻せる。既存ダイアログ操作の変更も `settings_snapshot` で同期する。加えて `settings_ui_state` により既存ダイアログの disabled 状態を React 側にも反映し、`updateCharacterStatus` / `updateUserMediaAvailabilityStatus` 由来の状態変化にも追従する。`settings_ui_hints` により Character/Gaze/AutoMute の disabled 理由も補足表示する。`startup_settings_status` により起動前設定の変更差分を表示する（`running` 中は再起動推奨、`stopped/idle` では次回起動で反映予定）。さらに `startup_settings_capabilities` によりページ別の有効性を示し、`simple-vrm` では現状未接続の `Talk/Inspector/VR` は通常表示から外して注記を出し、必要時のみ `details` 展開で確認できる。`looking-glass-vrm` では `variant="looking-glass-vrm"` により Looking Glass 操作案内と LG設定セクションを追加し、startup 設定が全件未対応のときは startup セクション自体を省略し、通常の audio/character 設定は advanced 折りたたみに配置する。`talkMode` は `sincro` / `chat` の両ユースケースがあるため表示を維持し、LG設定の近くに配置する。`titleText` は `looking-glass-vrm` では非表示にしている。診断情報（status/logs）は `Diagnostics` 折りたたみ配下にまとめている。Looking Glass 起動状態は `LookingGlassXRController` -> `window` カスタムイベント -> `SincroAppController.looking_glass_state` を経由して React パネル上段/Diagnostics に表示し、エラーコードも併記して切り分けできる。状態には `recovering`（再試行/セッション終了後の復帰待ち）を含む。実装は `tsx/ts` 化済み。initializer 側のUI副作用は `SincroAppController.setStartHooks(...)` へ登録して整合を取る。加えて、`simple-vrm` / `vrm360` / `looking-glass-vrm` のチャット欄 (`#sincroChatBox`) とフッターテロップ欄 (`#sincroFooterBox`) は React 描画へ段階移行を開始しており、`ChatMessageManager` / `TalkManager` はイベント配信と履歴スナップショットを保持しつつ、React マウント時に既存DOM描画を停止できる。設定ダイアログ (`dialog#configurationDialog`) では主要セクション（基本設定 + マイク設定 + Character/Gaze/AutoMute + VRMファイル選択導線）を `ConfigurationDialogSettingsPanel` で React 置換し、表示UIは React 主導（`×`, `はじめる`, `<< もどる` を含む）へ寄せている。bridge DOM は `vrmFileInput` のみを残す最小構成へ縮退しており、visible 設定UIは React 側が正式経路である。`DialogManager` は `DialogStateStore` を介して主要設定値 / disabled 状態 / `DialogUiState` / `DialogVrmUiState` を保持し、`DialogBridgeDomAdapter` を介して dialog本体・VRM file input・ヘッダー文言の DOM 依存を扱う構成へ移行した。停止ボタン（`#rtcStop`）は Debug Console UI の責務として `DebugConsoleManager` が配線し、`DialogManager` からは切り離した。React 側は `SincroAppController` の dialog bridge API（`setDialogReactPrimarySettingsEnabled(...)`, `openDialogVrmFilePicker()`, `setDialogPopDomRenderingEnabled(...)`, `closeConfigurationDialog()`, `openConfigurationDialog()`）経由で dialog 操作を行い、`DialogManager` / `PopManager` 直接依存を減らしている。起動時 dialog の `はじめる` ボタンは React 側から `SincroAppController.start()` 直呼びに切り替え済みで、旧 `#sincroStart` クリック配線は initializer から削除済み。dialog は `DialogManager` 側で Esc / dialog 外側クリック（背景クリック）でも閉じられる。さらに dialog 専用hook（`useConfigurationDialogSettingsState`）で `SincroAppController` の settings系イベントと dialog UI状態イベント（VRM関連UI状態、`DialogUiState`）を直接購読し、`useSimpleVrmPanelState` 依存を外している。設定ダイアログ内の Pop 通知（VRM更新成功/失敗など）は `SincroAppController` の `dialog_pop_message` イベント経由で `DialogPopMessages` が React 描画し、既存 dialog pop DOM描画は停止できる。React dialog の見た目は `configurationDialogSettings.css` に分離し、dialog 本体の既存スタイル（`sincroConfigurationDialog.css`）とは役割を分けている。`ConfigurationDialogSettingsPanel` は dialog 専用セクション部品（`DialogSettingsSections`）と dialog 専用フォーム部品（`DialogSettingsFormSections`）へ分割し、フォーム実装も shared panel から独立化を開始した。React 設定型（`ApplySettingsFn`, `SincroAppSettings*`）は `src/react/app/appSettingsTypes.ts` へ切り出し、dialog UI が `simple-vrm/panelTypes` に依存しない構成へ整理した。`useSimpleVrmPanelState` と dialog hook は、active `SincroAppController` 差し替え時の購読張り替えを `subscribeActiveSincroAppController` で共有する。React エントリ（`main-react.tsx`）は動的 import 化され、Control Panel / Chat / Telop / Dialog UI が個別 chunk としてロードされる。`vite.config.js` の `manualChunks` により `react`, `three`, `three/examples`, `three-vrm`, `three-vrm-animation`, `@mediapipe/*`, `onnxruntime-web`, `@lookingglass/webxr`, その他 vendor を分離している。React チャットの描画方針は `ChatMessageManager` の view snapshot/event に含める `renderMode`（`text` / `trusted_html`）で受け取り、移行期間は `system` / `reset` のみ HTML 描画を許可する。

## 3. 背景

- 解決したい課題:
  - ブラウザ単体で、対話UI・音声I/O・状態確認を一体で扱う
  - モード別UI（simple/legacy/実験系）の共通部品化
- 現状の問題点:
  - legacy系とVRM系が共存し、エントリや依存関係を誤ると回帰しやすい
  - `SincroController` に UI / RTC / CharacterGaze の結線が集中しやすく、段階的なUI差し替え時の境界が見えにくい
- 採用理由:
  - Vite MPA + HTML partial により、ページ分割と共通UI部品の両立が可能
- 制約条件:
  - `getUserMedia` 利用のため HTTPS または localhost が前提
  - WebRTCの接続先は `/api/v1/RTCSignalingServer/config.json` の取得結果に依存
  - React段階移行中は、現行UI manager と新UIの併存期間が発生しうる（詳細は `frontend_migration_react.md`）
  - React移行で追加するUIコードは原則 `TypeScript`（`.ts` / `.tsx`）で実装し、props/state/event payload の型を明示する
  - Babylon/legacy ページは通常導線・通常ビルドから切り離して高速に置換を進める方針（必要時のみ legacy build）

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| MPA | Multi Page Application。Viteで複数HTMLエントリを配信する構成 |
| RTC | WebRTC。Offer/AnswerとDataChannelで通信する |
| CharacterGaze | MediaPipe FaceDetectorを使った顔向き推定機能 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - 設定ダイアログで会話モード・キャラ表示・顔認識・自動ミュート・マイク自動音量調整(AGC)を切替可能
  - 高度なマイク設定を折りたたみ表示（デフォルト閉）とし、必要時のみ詳細項目を操作できること
  - マイク詳細項目として `noiseSuppression` / `echoCancellation` / `autoGainControl` を切替可能であること
  - ローカルマイク入力に高域通過フィルタ(HPF)を適用し、低周波ノイズを抑えられること
  - AudioWorkletベースVADを実行し、DebugConsoleへ `Speech/Silence` 状態を表示できること
  - DebugConsole上でVADのRMS閾値を動的に変更し、判定感度を即時調整できること
  - DebugConsole上でVAD閾値モード（手動/自動追従）を排他的に切り替えられること
  - DebugConsole上で学習VAD（Silero）を有効化し、Web Worker推論結果でVAD判定を上書きできること
  - DebugConsole上でHPF/LPFのカットオフとLPF有効状態を変更し、前段フィルタを動的調整できること
  - 高度設定でVAD送信ゲートを有効化した場合、無音時の送信音量を抑制できること
  - 高度設定で騒音会場モードを有効化した場合、強めの前段フィルタ（HPF+LPF）と高めのVAD初期閾値を適用できること
  - 起動時にマイク/カメラを取得し、音声トラックでRTC接続する
  - `text_ch` / `telop_ch` の受信内容を画面に反映する
  - デバッグコンソールでICE/SDP/DataChannelログを確認できる
  - デバッグコンソールでローカルマイクのRMS/Peakと、入力状態表示/クリッピング警告を確認できる
  - `RTCPeerConnection.getStats()` を1秒間隔で収集し、主要メトリクスを表示できる
  - 主要メトリクスの直近60秒トレンドをミニグラフで確認できる
- 優先度（Must/Should/Could）:
  - Must: RTC接続、チャット表示、テロップ表示
  - Should: 顔認識と自動ミュート、VRMファイル差し替え
  - Could: 実験ページ（Looking Glass/360）

### 5.2 非機能要件

- 性能: UI更新はフレーム落ちを避け、重い処理はrequestAnimationFrameで分散
- 可用性: RTC失敗時は `RTCTalkClient.reConnect()` による再接続を試行
- スケーラビリティ: フロントはクライアント内完結。サーバー側水平分割に依存
- セキュリティ: ブラウザ権限（マイク/カメラ）とCORS/HTTPS前提
- 運用性/保守性: Singleton Managerによる責務分離
- 監視性: DebugConsoleで通信状態・音声レベル・`getStats` メトリクスを可視化

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - エントリ: `main-vrm.ts`, `main-legacy.ts`
  - 初期化: `SincroVRMInitializer`, `SincroInitializer`
  - 制御: `SincroController`, `RTCTalkClient`, `TalkManager`
  - UI: `DialogManager`, `ChatMessageManager`, `DebugConsoleManager`, `PopManager`
- 責務分割:
  - 画面入力/設定: DialogManager
  - 通信: RTCTalkClient + SincroRTCConfigManager
  - 表示更新: ChatMessageManager/TalkManager/DebugConsoleManager
  - 注: React段階移行に伴い、`SincroController` 直下の結線責務は `App/*Controller` 群へ段階分割予定（`frontend_migration_react.md` 参照）
  - 2026-02-22 時点の分割進捗: `RTC` / `AudioInput` / `CharacterGaze` の結線責務は `App/*Controller` へ抽出済み。`SincroAppController`（`start/stop/subscribe` の最小Facade）導入済み
- 外部依存:
  - Browser APIs: WebRTC, getUserMedia, Fetch, dialog element
  - `@mediapipe/tasks-vision`（顔認識利用時）
- 全体図（必要なら図リンク）:
  - TODO: 図を追加する場合は `documents/design/assets/frontend_ui_overview.drawio` などに配置

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `SincroVRMInitializer`: 初期画面起動、`SincroAppController` 経由の起動/停止配線・dialog bridge 利用、シーン開始
  - `SincroVRM360Initializer`: `VRM360Scene` 初期化に加え、Three.js/VRM1.0 側の Looking Glass 起動ボタン連携（`LookingGlassXRController`）を有効化
  - `SincroController`: UserMedia取得前にダイアログ設定（NS/EC/AGC/騒音会場モード含む）を反映し、RTC開始/停止、DataChannel受信ハンドラ設定、CharacterGaze起動、DebugConsoleのVAD閾値変更をAudioWorkletへ中継
  - `RTCTalkClient`: Offer生成、`/offer` POST、Answer適用、DataChannel管理
  - `TalkManager`: text/telop受信を集約し、チャットUIと口形同期向け状態を維持
  - `DialogManager`: 設定値の参照、タイトル反映、VRMファイル更新時のUI状態/通知（選択中VRM URL を含む状態は `DialogStateStore` に保持、DOM依存は `DialogBridgeDomAdapter` 経由）
  - `DialogVrmFileService`: VRMファイル/サムネイルの Cache Storage 永続化
  - `DialogVrmWorkflowService`: VRMファイル選択/初期復元フロー（検証・保存・復元結果の組み立て）
  - `DialogNotificationService`: dialog 内 Pop 通知の橋渡し（`PopManager` ラッパー）
  - `DialogSettingsPolicy`: 設定UIの disabled 状態/Hints と Character/Gaze/AutoMute の有効化ポリシー
  - `LearnedVadWorkerClient`: 学習VAD Workerの初期化/有効化/チューニング設定/状態通知を管理
  - `UserMediaManager`: `getUserMedia` 制約（`echoCancellation`/`noiseSuppression`/`autoGainControl` 等）を構築し、騒音会場モード切替、HPF/LPF+AudioWorklet VAD処理、手動/自動/学習VAD閾値更新を管理
  - `DebugConsoleManager`: デバッグUIの表示制御、RTC状態表示、イベントログ、音声レベルメーター、HPF/LPF・VAD状態/閾値調整・学習VAD状態表示、60秒トレンドグラフ描画
  - `SincroAppController.dialogBridge`（`appController.dialog.*`）: dialog 関連 bridge API の集約窓口。React dialog hook / dialog pop / initializer からの呼び出しを段階的に統一
  - `SincroAppController.chatBridge`（`appController.chat.*`）: 挨拶メッセージ出力や system icon 更新など、チャットUI更新の集約窓口（initializer からの `ChatMessageManager` 直接依存を縮退）
  - `SincroAppController.debugBridge`（`appController.debug.*`）: Debug Console 操作の集約窓口（initializer からの `DebugConsoleManager` 直接依存を縮退）
  - `SincroAppController` の bridge 群（`dialog/chat/debug/rtc`）を UI層の主要な呼び出し窓口として段階採用し、manager singleton 直接参照を削減している
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-frontend/src/ts/SincroController.ts`
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-frontend/src/ts/RTC/LearnedVadWorkerClient.ts`
  - `sincromisor-frontend/src/ts/RTC/TalkManager.ts`
  - `sincromisor-frontend/src/ts/UI/DialogManager.ts`
  - `sincromisor-frontend/src/ts/UI/ChatMessageManager.ts`
  - `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
  - `sincromisor-frontend/src/partials/debugConsole.html`
  - `sincromisor-frontend/src/ts/RTC/silero-vad.worker.ts`
  - `sincromisor-frontend/src/styles/sincroDebugConsole.css`
  - `sincromisor-frontend/src/ts/SincroVRM/LookingGlass/LookingGlassXRController.ts`
- 変更時に同時確認が必要なファイル:
  - RTCペイロード変更: `RTCTalkClient.ts` とサーバー側 `RTCSignalingServer.py`
  - ダイアログ項目変更: `DialogManager.ts` と `src/partials/configurationDialog.html`
  - 起動前 dialog の起動/停止導線変更: `SincroAppController.ts` / `SincroVRMInitializer.ts` / `SincroLegacy/SincroInitializer.ts`
  - 音声入力制約変更: `SincroController.ts` と `RTC/UserMediaManager.ts`
  - チャット表示変更: `ChatMessageManager.ts` と `src/styles/sincroChatBox.css`

### 7.2 データ設計

- 主要データ構造:
  - `ChatMessage`（text_ch）
  - `TelopChannelMessage`（telop_ch）
  - `SincroRTCConfig`（offerURL, candidateURL, iceServers）
- 永続化対象:
  - ブラウザ側の永続ストレージ利用は基本なし
  - VRMファイル/サムネイルは `DialogVrmFileService` 経由で Cache API（`caches.open('file-cache')`）に保存/読込
- スキーマ/モデル:
  - `sincromisor-frontend/src/ts/RTC/RTCMessage.ts`
- バージョニング方針:
  - サーバーとの契約変更時は前方互換を優先し、必要なら `message_type` 等で吸収

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - `GET /api/v1/RTCSignalingServer/config.json`
  - `POST {offerURL}`（configで配布）
  - `POST {candidateURL}`（configで配布）
  - DataChannel: `text_ch`, `telop_ch`
- リクエスト仕様:
  - Offer送信: `{ sdp, type, talk_mode, session_id? }`（再接続時は直前 `session_id` で同一セッション更新を試行）
  - Candidate送信: `{ session_id, candidate }`（`candidate` は end-of-candidates のとき `null`）
- レスポンス仕様:
  - Answer: `{ sdp, type, session_id }`
  - Candidate応答: `{ status: true }` または `{ status: false, reason: "session_not_found_or_closed" }`
- エラー仕様:
  - HTTP 429 は明示エラーとして扱う
  - それ以外の非200は再接続対象
- タイムアウト/リトライ方針:
  - Trickle ICE方式: `setLocalDescription`後にOfferを先に送信し、候補は`onicecandidate`で逐次送信
  - `offer.session_id` が有効なら同一セッション更新を優先し、失敗時はサーバー側で新規セッションへフォールバック
  - 接続失敗時は `createOffer({ iceRestart: true })` を利用して再接続する
  - 再接続待機は段階的バックオフ（初回約5秒、指数的に増加、上限60秒、ジッターあり）で制御する
  - 再接続タイマーは単一化し、同時多重再接続を防止する

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - 画面読込 -> 設定ダイアログ表示 -> Start押下
  - UserMedia取得 -> RTC Offer/Answer（session_id取得）-> ICE candidate逐次送信 -> DataChannel open
  - `RTCTalkClient` が `getStats()` を1秒間隔で収集し、DebugConsoleへ反映
  - Local/Remote audio track から音声レベルメーターを更新
  - text/telop受信 -> UI更新
- 異常系フロー:
  - 設定取得失敗 -> チャット欄へエラー表示
  - マイク/カメラ取得失敗 -> 起動不可表示またはエラーメッセージ
  - ICE failed -> ICE restart付きOfferで再接続
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: `networking_rtc.md` と整合する図を後続で追加

## 8. 設定・デプロイ

- 環境変数:
  - フロント単体では `.env` 依存は薄く、主にサーバー配布configを利用
- 設定ファイル:
  - `sincromisor-frontend/vite.config.js`（MPA entry / partial plugin）
- 起動方法:
  - `cd sincromisor-frontend && npm run dev`
- デプロイ/ローカル実行手順:
  - `npm run build` で `dist/` 出力
  - `public/mediapipe-wasm` と `public/3rd_party/blaze_face_short_range.tflite` の配置が必要
  - 学習VAD利用時は `public/3rd_party/silero-vad/silero_vad.onnx` の配置が必要（`onnxruntime-web` はnpm依存でバンドル）
- 互換性に影響する設定変更:
  - `config.json` の `offerURL` / `iceServers` 変更は接続性に直結

## 9. 監視・運用

- ログ設計:
  - チャット欄にシステム/エラーを表示
  - デバッグ欄に ICE/SDP/DataChannelログ + RTCイベントタイムラインを表示
  - 再接続時の判定ログ:
    - `start negotiation: forceIceRestart=..., preferredSessionId=...`
    - `send offer: mode=session-update|new-session, targetSessionId=...`
    - `offer update succeeded (...)`
    - `offer fallback detected (...)`
- メトリクス:
  - 1秒間隔で `RTCPeerConnection.getStats()` を収集し、以下を表示
    - Outbound/Inbound audio bitrate
    - Outbound packets sent
    - Inbound packets lost / loss rate / jitter
    - Candidate pair / available outgoing bitrate / RTT
  - 直近60秒トレンドをミニグラフ表示
    - Outbound bitrate（max 256 kbps）
    - Inbound bitrate（max 256 kbps）
    - RTT（max 200 ms）
    - Inbound loss rate（max 5%）
  - Local Mic / Remote RTC の音声レベルメーターを表示
- 障害時の切り分け手順:
  - 1. `/config.json` が取得できるか
  - 2. ICE state が `connected/completed` に遷移するか
  - 3. `text_ch` / `telop_ch` のopenと受信ログが出るか
  - 4. `offer update succeeded` / `offer fallback detected` の発生傾向を確認
  - 5. RTT/loss/jitterトレンドが劣化していないか
- よくある失敗と対処:
  - マイク権限なし: ブラウザ権限を許可
  - 会場ノイズで誤反応が多い: 設定ダイアログの「マイク自動音量調整」をOFFにして再試行
  - WASM未配置: CharacterGazeが起動しない
  - offerURL不整合: POST先エラーで再接続ループ
  - 音声メーターが動かない: ブラウザの自動再生ポリシーにより `AudioContext` が `suspended` のままになっていないか確認

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - ブラウザUI側に独自認証は未実装（上位プロキシ/サービス構成に依存）
- 秘密情報の扱い:
  - フロントに長期秘密情報は保持しない
- 入力検証:
  - VRMアップロード時は拡張子 `.vrm` を最低限検証
- 脅威と対策:
  - XSS対策として通常は `innerText` を使用（必要時のみ `innerHTML`）
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - 起動導線、RTC接続、チャット表示、テロップ表示、設定反映
- 単体テスト:
  - 現状は薄い。主要ロジックは手動確認中心
- 結合テスト:
  - サーバー起動下で Offer/Answer と DataChannel を確認
- E2Eテスト:
  - 手動で `simple-vrm/` を用いた動作確認
- 負荷テスト（必要な場合のみ）:
  - 未整備
- 受け入れ条件:
  - Start後に接続完了メッセージが出て、text/telopが継続受信される

## 12. 既知課題・リスク

- 既知課題:
  - Singleton前提のため、複数インスタンス同時利用には不向き
  - legacyページとの差分が増えると保守コストが増加
- 技術的負債:
  - UIロジックとDOM依存が密結合な箇所がある
- リスク一覧:
  - WebRTC仕様変更時にフロント/サーバー差分が発生しやすい
  - Candidate送信経路（`candidateURL`）が不整合だと接続が成立しない
- 軽減策:
  - `networking_rtc.md` と本書を同時更新する運用を徹底
  - `offerURL`/`candidateURL`/payloadをフロントとサーバーで同時更新する

## 13. 代替案と設計判断

- 検討した代替案:
  - SPA化してルーティング統合
- 採用しなかった理由:
  - 実験ページを含む複数導線を小さく独立管理したい
- 最終判断:
  - MPA継続。共通部品は partial + Manager クラスで共有

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |
| 2026-02-15 | ChromiumでのOffer遅延対策として、ICE gathering待機に1500ms上限を設ける仕様を追記 |
| 2026-02-16 | FirefoxでのICE失敗を避けるため、ICE gathering待機をブラウザ別制御（Chromiumのみ1500ms上限）に更新 |
| 2026-02-16 | Trickle ICE導入。`candidateURL`追加、`session_id`付きAnswer、候補の逐次送信フローへ更新 |
| 2026-02-21 | 設定ダイアログにマイク自動音量調整(AGC)の切替を追加し、`getUserMedia` 音声制約へ反映する仕様を追記 |
| 2026-02-21 | 高度なマイク設定（折りたたみ）を追加し、`noiseSuppression`/`echoCancellation`/`autoGainControl` の3項目を起動時に反映する仕様へ更新 |
| 2026-02-21 | DebugConsoleのAudio MonitorにローカルマイクRMS/Peak表示と入力警告（クリッピング/入力小）を追加 |
| 2026-02-21 | クライアント音声処理パイプラインにHPF(120Hz)とAudioWorklet VADを追加し、DebugConsoleへSpeech/Silence状態を表示 |
| 2026-02-21 | 高度設定にVAD送信ゲートを追加し、無音時はGainNodeで送信音量を抑制できるよう更新 |
| 2026-02-21 | DebugConsoleにVAD RMS閾値スライダーを追加し、AudioWorkletへ閾値を動的反映できるよう更新 |
| 2026-02-21 | DebugConsoleにVAD閾値の手動/自動追従モードを追加し、Auto時はノイズフロア追従でRMS閾値を更新する仕様へ更新 |
| 2026-02-21 | DebugConsoleに学習VAD（Silero）トグルとモデル状態/確率表示を追加し、Web Workerで推論できる構成へ更新 |
| 2026-02-21 | 学習VAD処理を `LearnedVadWorkerClient` へ分離し、ON/OFF閾値・hangover・推論間隔をランタイム調整可能に更新 |
| 2026-02-21 | 学習VADに負荷/精度プリセット（低負荷/標準/高精度）を追加し、会場運用時に一括調整できるよう更新 |
| 2026-02-21 | DebugConsoleにHPF/LPF設定（HPF cutoff・LPF有効化・LPF cutoff）を追加し、前段フィルタを動的反映できるよう更新 |
| 2026-02-21 | DebugConsoleにVAD RMS閾値プリセット（標準/騒音環境/超騒音環境）を追加し、ワンクリックで適用可能に更新 |
| 2026-02-21 | 高度設定に騒音会場モードを追加し、HPF強化(180Hz)+LPF(4.2kHz)+高めのVAD初期閾値を起動時に適用できるよう更新 |
| 2026-02-21 | DebugConsole UIをカード型レイアウトへ刷新。Session/Transport/Audio/Channel/Gaze/SDPの監視パネルを追加 |
| 2026-02-21 | `getStats()` の1秒収集による主要メトリクス表示と、直近60秒ミニグラフ（固定上限スケール）を追加 |
| 2026-02-21 | 再接続仕様を更新。ICE restart明示のOffer再送と、指数バックオフ（上限60秒・ジッター付き）を追加 |
| 2026-02-21 | `offer.session_id` による同一セッション更新（失敗時は新規セッションフォールバック）を追加 |
| 2026-02-21 | 同一セッション更新の挙動を追跡するため、再接続時の判定ログ（更新成功/フォールバック）を追記 |
| 2026-02-22 | 起動前 dialog を React 主導 + bridge 最小構成へ移行。`DialogStateStore`/`DialogBridgeDomAdapter`/`DialogSettingsPolicy`/`DialogEventHub`/`Dialog*Service` 群で責務分離し、呼び出し側は `SincroAppController` の `dialog/chat/debug/rtc` bridge API を利用する構成へ更新 |
| 2026-02-22 | `SincroAppTypes.ts` を追加して AppController 型/イベント定義を分離。React 側の dialog 操作は `DialogManager` 直接参照を使わず `SincroAppController.dialog` 経由に統一 |
| 2026-02-22 | `SincroAppEventMappers.ts` に managerイベント→Appイベント変換を分離し、`SincroAppController` の購読処理を `bindManagerSubscriptions()` に整理 |
| 2026-02-22 | Looking Glass の UI表示向け状態管理を `SincroAppLookingGlassStateTracker.ts` へ分離し、`SincroAppController` はイベント受信/通知順の制御に集中する構成へ更新 |
| 2026-02-22 | `SincroAppConnectionState.ts` / `SincroAppSettingsApply.ts` / `SincroAppBridgeFactories.ts` を追加し、AppController の接続状態判定・設定反映・bridge実装を helper/factory へ分離 |
| 2026-02-22 | `SincroAppStartupSettings.ts` / `SincroAppSubscriptionSnapshot.ts` を追加し、AppController の startup設定判定と初期購読スナップショット送出を helper 化 |
| 2026-02-22 | `SincroAppSettingsSnapshotBuilder.ts` / `SincroAppWindowEventBinder.ts` を追加し、AppController の settings snapshot 合成・window event 登録を helper 化。未使用の互換 wrapper を整理して bridge API（`appController.dialog/chat/debug/rtc`）中心へ寄せた |
| 2026-02-22 | `SincroAppUiStateSnapshotBuilder.ts` を追加して Dialog由来UI状態の取得を helper 化。AppController の manager購読配線を機能別メソッド（chat/debug/talk/pop/dialog）に分割し可読性を改善 |
| 2026-02-22 | `SincroAppEventHub.ts` / `SincroAppControllerRuntime.ts` を追加し、AppController の AppEvent listener 管理と constructor 初期化（manager bundle / bridge bundle 作成）を helper 化。UI状態 getter は `getUiStateSnapshot()` 経由に整理 |
| 2026-02-22 | `SincroAppActiveControllerRegistry.ts` / `SincroAppLookingGlassEventFlow.ts` を追加し、AppController の static active controller 管理と Looking Glass window event handler 本文を helper 化。public API はセクションコメントで整理 |
| 2026-02-22 | `SincroAppDialogFacade.ts`（Dialog 境界型）と `SincroAppEmitHelpers.ts`（lifecycle/settings snapshot emit）を追加。React 側は `subscribeActiveSincroAppEvents.ts` で active controller + event購読の定型配線を共通化 |
| 2026-02-22 | `SincroAppDebugSubscriptionFlow.ts` で debug購読の RTC/connection state 更新手順を helper 化。`SincroAppController.state` bridge を追加して snapshot getter 群を grouping。`useSimpleVrmPanelState` の AppEvent 処理は handler map 化して保守性を改善 |
| 2026-02-22 | `useConfigurationDialogSettingsState` も AppEvent handler map 化し、`appController.state` から初期/差し替え時 snapshot を取得する構成へ整理。AppController の manager購読配線には emit順序意図のコメントを補強 |
| 2026-02-22 | `sincroAppStateSnapshotHydrators.ts` で React hook 間の snapshot 反映処理を共通化。`SincroAppManagerSubscriptionBinder.ts` で AppController の manager購読本文（chat/debug/talk/pop/dialog）を helper 化し、Controller 本体を orchestration 中心に整理 |
| 2026-02-22 | `SincroAppManagerSubscriptionFacades.ts` で manager購読binderの依存境界を facade 型として明文化。React 側は `panelLogHelpers.ts` で chat/system/error ログ追加処理を共通化。AppController constructor は `initializeRuntime()` へ分割して読み順を改善 |
| 2026-02-22 | `SincroAppControllerRuntimeBundle` 型を追加して AppController `initializeRuntime()` の返却型を明示。`panelLogHelpers.ts` の汎用先頭追加 helper は `DialogPopMessages.tsx` にも適用し、dialog pop 更新処理の共通化を前進。`SincroAppManagerSubscriptionBinder.ts` の debug購読には emit順序意図コメントを追加 |
| 2026-02-22 | `dialogPopAnimationHelpers.ts` で dialog pop の show/hide/remove タイマー処理を helper 化。`SincroAppLookingGlassEventFlow.ts` は flow 用 params 型/ラッパーを追加して LG event handler 境界を明確化。AppController `initializeRuntime()` は `createSincroAppRuntimeBundle(...)` を利用し、runtime bundle 組み立て（manager + bridge + stateBridge）を `SincroAppControllerRuntime.ts` へ集約 |
| 2026-02-22 | `DialogPopMessages.tsx` は unmount / active controller 切替時に pending timer を cleanup する構成へ改善。Looking Glass event flow は `*Flow` 公開中心に名称整理し、AppController 側は flow 呼び出しに統一。`setStartupSettingsCapabilities()` は AppController の state/capability 系 API の近くへ移動し、読み順を改善 |
| 2026-02-22 | `useDialogPopTimers.ts` で dialog pop の timer 登録/一括cleanup を custom hook 化し、`DialogPopMessages.tsx` の timer bookkeeping を簡素化。`SincroAppLookingGlassEventFlow.ts` の `emitLookingGlassConfigStatus(...)` は flow context 型ベースに統一し、LG event flow API の形状を揃えた。AppController private methods は event handlers→init/bind→state helpers の読み順を意識して整理を継続 |
| 2026-02-22 | dialog pop のアニメーション timing（show delay / hide transition）を `dialogPopAnimationHelpers.ts` の定数に集約し、`DialogPopMessages.tsx` の cleanup 余裕時間にも再利用。`emitSincroAppConnectionState(...)` を `SincroAppEmitHelpers.ts` に追加して AppController の派生接続状態通知を helper 経由へ統一。Looking Glass event flow には `active` 時 config status の二重通知意図（UI表示の収束性確保）をコメント追記 |
| 2026-02-22 | `DialogPopMessages.tsx` の表示件数は `DIALOG_POP_TIMING.renderLimit` に集約。`emitSincroAppSettingsApplyEvents(...)` を追加し、AppController `applySettings(...)` 後の settings/UI/startup/LG config 通知を helper 経由に整理。`buildSettingsRelatedSnapshotPayload()` により AppController 内の settings関連 payload 組み立て重複を削減 |
| 2026-02-22 | `SincroAppSettingsRelatedSnapshotBuilder.ts` を追加し、settings関連 payload 組み立て（settings/uiState/uiHints/startupStatus）を helper 化。`DialogManager` は `updateCharacterStatus()` / `updateUserMediaAvailabilityStatus()` 内で settingsChange の中間重複通知を抑止して発火回数を削減。React 側の表示件数/タイミング定数は `react/app/uiTuning.ts` に集約を開始（chat/telop/rtc logs, dialog pop） |
| 2026-02-22 | `DialogEventHub` に getter ベースの current UI state 通知ヘルパ（dialog/VRM）を追加し、`DialogManager` の UI state emit を薄く整理。AppController `applySettings(...)` は `getSettingsSnapshot()` 結果を settings関連 payload builder に再利用して重複 snapshot 合成を削減。`UI_TUNING.controlPanel.diagnostics` を追加し、Diagnostics の spacing / message log 高さ / status grid 列数などの表示値を定数化して反映 |
| 2026-02-22 | `DialogManager` の VRM status/start button 状態更新は同値ガードを追加し、不要な `dialog_ui_state` / `dialog_vrm_ui_state` 通知を抑止。AppController は settings関連 payload の短命キャッシュで同期処理内の重複 snapshot 生成を抑制。`UI_TUNING.controlPanel` を拡張し、Control Panel 本体の section spacing / details margin も定数化して `SimpleVrmControlPanel` に適用 |
| 2026-02-22 | AppController `subscribe()` の初期イベント送出も settings関連 payload の短命キャッシュを利用し、初回購読時の重複 snapshot 合成を削減。`DialogManager` には dialog/VRM UI state の通知順序意図コメントを補強。`SettingsSections.tsx` にも `UI_TUNING.controlPanel` を展開し、basic/mic/character/startup/Looking Glass 設定セクションの spacing を定数化 |
| 2026-02-22 | `UI_TUNING.controlPanel.settings` を追加し、settings tooltip/help badge/各セクションの spacing を `SettingsSections.tsx` へ適用して見た目調整点を一元化。AppController `start()` は起動時 settings snapshot を lifecycle通知と startup適用値保存で再利用し、微小な重複計算を削減 |
| 2026-02-22 | `UI_TUNING.controlPanel.styles` を追加し、`panelStyles.ts` の root/button/miniCard/miniLog の調整値（radius/padding/font/maxHeight）を `UI_TUNING` に集約。`looking-glass-vrm` Control Panel の案内文も日本語表現を微調整し、エラー時の確認先（LG Code / LG Detail）と再読み込み推奨文言を明確化 |
| 2026-02-22 | `UI_TUNING.controlPanel.styles` を拡張し、Control Panel のボタン間隔・Diagnostics カード間隔・section title 余白も定数化。`PanelControls` / `DiagnosticsStatusCards` / `DiagnosticsLogSections` に適用し、操作ボタン（開始/停止）と Diagnostics の主要ラベル/空状態文言を日本語寄りに調整 |
| 2026-02-22 | `Control Panel` / `Diagnostics` の残り文言を日本語寄りに調整（`トークモード (talk mode)`、`診断情報`、`Signaling状態`、`LGコード` / `LG詳細` など）。`looking-glass-vrm` の LGエラー時案内も日本語表現を整理 |
| 2026-02-22 | `UI_TUNING.controlPanel.settings` / `UI_TUNING.controlPanel.styles` を追加拡張し、Control Panel 本体・Diagnostics・Settings の spacing/tooltip/help badge 調整値を集約。`looking-glass-vrm` の案内文は LGエラー時の確認先を `LGコード` / `LG詳細` 表記に統一 |
| 2026-02-22 | `VRM360/SphereVideo.ts` の HLS 再生経路を `hls.js` 遅延読み込みへ変更。`vite.config.js` の `manualChunks` では `vendor_three_renderers` / `vendor_hls` / `vendor_yaml` を追加分割し、`vendor_misc` を縮小。`vendor_hls` は遅延読み込み chunk として分離（サイズ警告は残る）。`VRM360 設定パネル` / `Looking Glass VRM1.0 設定パネル` へ見出しを日本語寄りに調整 |
| 2026-02-22 | Looking Glass 実機での焦点/ピンボケ調整向けに `Target Z` / `Target Diam` を `looking-glass-vrm` の設定UIに追加。`LookingGlassRuntimeConfig` と WebXR polyfill 初期化オプションへ反映し、`焦点調整用 (Focus)` プリセットを追加。案内文でも `Target Z` / `Target Diam` を優先調整項目として明記 |
| 2026-02-22 | `three/src/renderers` の chunk 分割は three 内部の初期化順エラー（`Cannot access 'Je' before initialization`）を誘発したため撤回。安定性優先で `three` は単一 chunk に戻し、`hls.js` 遅延読み込み + `vendor_hls` 分離を継続 |
| 2026-02-22 | Looking Glass 実機で初回 `Start Looking Glass` が polyfill 制約により失敗する場合に備え、`LookingGlassXRController` で初回 `immersive-vr` 前の `navigator.xr.isSessionSupported(\"immersive-vr\")` ウォームアップを追加 |
| 2026-02-22 | Looking Glass セッション終了時に polyfill を次回再初期化可能状態へ戻す処理を追加し、セッション中の LG 設定変更はページ再読み込み不要で「セッション終了後の再実行」で反映できるよう改善。Control Panel の案内文も同方針に合わせて更新 |
| 2026-02-22 | `looking-glass-vrm` の Control Panel に `Looking Glass 開始` / `Looking Glass 停止` ボタンを追加し、設定メニュー側から実行/停止できるよう更新。`LookingGlassXRController` は Debug Console ボタンに加えて custom event 経由の start/stop request を受け付け、`XRSession.end()` による停止を実装 |
| 2026-02-22 | `Start Looking Glass` を Debug Console から削除し、`looking-glass-vrm` では Control Panel を正式な実行導線に統一。`LookingGlassXRController` は Debug Console ボタン未配置時も error 扱いせず、custom event 経由の start/stop 操作を継続利用できるよう更新 |
| 2026-02-22 | 右上 Debug メニューの `Open Startup Dialog` を削除。起動前設定の React dialog UI は枠線/背景/ヘッダー/開始ボタンの見た目を調整し、Control Panel / Debug Console とトーンを揃える方向で更新 |
| 2026-02-22 | 起動前設定の既定値を見直し、通常ページでは `Character` / `Gaze` を初期ONに変更。`VRM360`（360deg camera）のみ `SincroVRM360Initializer` で `Gaze` を既定OFFに上書きし、Character は既定ONを維持 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/networking_rtc.md`
  - `documents/design/frontend_character.md`
- 参照実装:
  - `sincromisor-frontend/src/ts/SincroController.ts`
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-frontend/vite.config.js`
- 外部リンク:
  - https://vitejs.dev/
