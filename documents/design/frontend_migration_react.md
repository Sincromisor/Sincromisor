# Frontend React移行計画

Sincromisor フロントエンドを、既存機能を維持しながら段階的に React ベースへ移行するための計画文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/frontend_migration_react.md`
- 作成日: 2026-02-22
- 最終更新日: 2026-02-22
- ステータス: Active

## 2. 目的とスコープ

- 目的: `sincromisor-frontend` の巨大化に対応し、個人開発でも扱いやすい構成へ段階的に移行する
- 対象範囲:
  - フロントエンドの UI 層 / アプリ制御層の React 移行方針
  - Babylon.js legacy コードの切り離し方針
  - Looking Glass 機能の VRM1.0 対応の進め方
- 非対象範囲:
  - サーバー側 WebRTC シグナリング仕様の変更
  - 音声認識 / 音声合成のバックエンド再設計
- LLM向け要約（3-5行）:
  - React は UI 層から段階導入し、RTC / Media / 3D 描画の既存 TypeScript 実装は当面再利用する。
  - Vite は継続、構成はまず MPA のまま維持し、全面再構成を避ける。
  - Babylon.js 依存は `legacy`/`experimental` として隔離し、通常系ページから順次外す。
  - Looking Glass は `@lookingglass/webxr` を継続利用しつつ、Three.js + VRM1.0 側へ移植する。

## 3. 背景

- 解決したい課題:
  - プレーン TypeScript + DOM 直操作中心の UI 実装が拡大し、変更時の影響範囲が読みづらくなっている
  - Babylon.js 依存の旧コードが残存し、VRM1.0 系の実装と保守方針が混在している
  - Looking Glass 機能を VRM1.0 基盤へ寄せたい
- 現状の問題点:
  - `SincroController` に UI / RTC / CharacterGaze の結線が集中しやすい
  - MPA の各ページで UI と描画初期化ロジックの再利用境界が曖昧
  - Babylon.js と Three.js が同一フロントエンド内で共存しており、依存削減計画が明文化されていない
- 採用理由:
  - React はメジャーで情報量が多く、個人開発でも保守しやすい
  - Vite + React は構成が比較的シンプルでバージョンアップ追従しやすい
  - UI 層から段階移行すれば、WebRTC / 音声処理 / 3D を同時に壊すリスクを下げられる
- 制約条件:
  - 既存 WebRTC 契約（endpoint / JSON payload / DataChannel 名）を壊さない
  - マイク/カメラ権限や WebRTC 接続の不具合切り分けを維持するため、デバッグ UI 機能を後退させない
  - 個人開発前提のため、巨大なフレームワークや過剰な抽象化を避ける

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| React化 | UI層および画面状態管理を React コンポーネント中心へ移行すること |
| Core層 | フレームワーク非依存で再利用する RTC / Media / Talk / Gaze 制御モジュール群 |
| Legacy | Babylon.js ベースの旧実装（将来的に削除予定） |
| MPA | Vite の複数 HTML エントリ構成（当面維持） |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - 既存の主要機能（RTC接続、text/telop受信、設定ダイアログ、デバッグ表示）を維持したまま UI 層を段階移行できること
  - React 導入後も `simple-vrm` を最初の移行対象として単独で動作確認できること
  - Babylon.js 依存ページを通常系ページから明確に分離できること
  - Looking Glass 機能を Three.js + VRM1.0 系へ移植可能な構造にすること
  - フロントエンド依存ライブラリの増加を最小限に抑えること
- 優先度（Must/Should/Could）:
  - Must: UI先行の段階移行、RTC契約維持、Babylon隔離方針の明文化
  - Should: Looking Glass VRM1.0 対応の実施順序と責務分離
  - Could: 将来の SPA 化 / Router 導入判断基準の整理

### 5.2 非機能要件

- 性能: React 導入で音声処理や 3D 描画のフレームレートを悪化させない（重処理は既存非UI層に維持）
- 可用性: 段階移行中も既存ページを並行運用し、切り戻ししやすいこと
- スケーラビリティ: 新規ページ・機能追加時に UI と Core の責務を分離しやすい構成
- セキュリティ: ブラウザ権限・通信先設定の扱いは現行方針を維持
- 運用性/保守性: 依存数を絞り、アップグレード対象を React/Vite/TypeScript 程度に集中させる
- 監視性: デバッグコンソール機能（RTCログ、音声メーター、VAD状態）を維持または改善する

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - UI層（React）: 設定ダイアログ、チャット、デバッグコンソール、各ページの画面構成
  - Core層（既存TS再利用・段階整理）: `RTCTalkClient`, `UserMediaManager`, `TalkManager`, `CharacterGaze`, `SincroRTCConfigManager`
  - 描画層: Three.js + VRM1.0（主系統）、Babylon.js（legacy/experimental）
  - ページエントリ層: Vite MPA エントリ (`simple-vrm`, `main`, `vrm360`, `glass` など)
- 責務分割:
  - React: UI描画・ユーザー操作・状態表示
  - Core: WebRTC接続、音声処理、VAD、DataChannel受信、設定反映
  - Renderer: VRM / 360 / Looking Glass の描画処理
- 外部依存:
  - 継続: `vite`, `typescript`, `three`, `@pixiv/three-vrm`, `@mediapipe/tasks-vision`, `onnxruntime-web`
  - 追加（最小）: `react`, `react-dom`, `@vitejs/plugin-react-swc`
  - 将来的に削減対象: `@babylonjs/*`
- 全体図（必要なら図リンク）:
  - TODO: `frontend_ui.md` の全体図に React UI / Core / Renderer の分離図を追記

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `React UI`: DOM生成・画面状態・イベント配線。`document.querySelector` 依存を減らす
  - `App Controller / Core Facade`（新設予定）: React UI と既存 Core 間の橋渡し
  - `RTCTalkClient` / `UserMediaManager` / `TalkManager`: 原則そのまま利用し、UI への通知方法のみ整理
  - `VRMScene` 系: Three.js + VRM1.0 描画継続、React からは API 経由で制御
  - `SincroLegacy/*`: Babylon.js 依存実装として隔離し、縮退対象にする
  - Looking Glass 新実装（計画）: `@lookingglass/webxr` + Three.js/VRM1.0 による描画開始処理
- 主要クラス/モジュールと対応ファイル:
  - 現行制御: `sincromisor-frontend/src/ts/SincroController.ts`
  - RTC: `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - Media/VAD: `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`
  - VRM描画: `sincromisor-frontend/src/ts/SincroVRM/**`
  - Babylon legacy: `sincromisor-frontend/src/ts/SincroLegacy/**`, `sincromisor-frontend/src/area360/**`
  - Looking Glass（現行）: `sincromisor-frontend/src/ts/SincroLegacy/Scene/SincroGlassScene.ts`
- 変更時に同時確認が必要なファイル:
  - UIイベント移行時: `frontend_ui.md`, `src/partials/*.html`, `src/ts/UI/*.ts`
  - RTC契約関連: `src/ts/RTC/RTCTalkClient.ts` と `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
  - Looking Glass移植時: `src/ts/SincroLegacy/Scene/SincroGlassScene.ts` と `src/ts/SincroVRM/**`

### 7.2 データ設計

- 主要データ構造:
  - `ChatMessage`, `TelopChannelMessage`, `SincroRTCConfig`
  - UI 状態（React 側）: 設定フォーム状態、接続状態、デバッグ表示状態
- 永続化対象:
  - 既存の VRM サムネイル Cache API 利用は継続
  - React 導入時に新規永続化は増やさない（必要最小限）
- スキーマ/モデル:
  - 既存 `RTCMessage.ts` を継続利用
  - React 導入用の状態型はフロント内型として追加（サーバー契約と分離）
- バージョニング方針:
  - UI 移行ではサーバー通信スキーマを変更しない
  - 必要な UI 内部型変更はフロント内で閉じる

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - 現行の WebRTC 関連 endpoint / DataChannel (`text_ch`, `telop_ch`) を維持
- リクエスト仕様:
  - `offer`, `candidate` payload は現行のまま維持
- レスポンス仕様:
  - `config.json`, `answer`, `candidate` 応答は現行のまま維持
- エラー仕様:
  - UI 表示変更のみ許容。エラー分類・再接続方針は `RTCTalkClient` の現行挙動を維持
- タイムアウト/リトライ方針:
  - `RTCTalkClient` の再接続ロジック（ICE restart / backoff）を維持

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - React UI 起動 -> 設定入力 -> Start
  - Core層へ設定反映 -> UserMedia取得 -> RTC開始 -> DataChannel受信
  - React UI が購読/通知を受けてチャット・デバッグ表示更新
  - VRM描画層は従来どおり別系統で更新（React は制御のみ）
- 異常系フロー:
  - React UI 初期導入段階では、既存 MPA ページを残して切り戻し可能にする
  - 一部 UI 機能の移行中は、未移行機能を既存 manager 経由で暫定運用する
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: 初期 React 導入後に `frontend_ui.md` のシーケンス図を更新

### 7.5 フェーズ別移行計画（実施手順）

- 方針:
  - 1フェーズごとに「ビルド成功 + 手動確認 + 切り戻し可能」を満たしてから次へ進む
  - React化（UI）、Babylon隔離（依存整理）、Looking Glass移植（描画置換）を同時に完了させようとしない

- Phase 0: 事前整理（React導入前の境界作成）
  - 目的:
    - `SincroController` の責務を整理し、UI置換時の影響範囲を縮小する
  - 実施内容:
    - `SincroController` 内の処理を責務別に分割（設定反映 / RTC開始 / Gaze開始 / UI通知）
    - UI manager への直接書き込み箇所を列挙し、イベント/通知境界を明文化する
    - `simple-vrm` を移行検証対象ページとして固定する
  - 成果物:
    - 責務分割メモまたは設計追記（本書 or `frontend_ui.md`）
    - `SincroController` 分割方針（新規クラス名・責務一覧）
  - 受け入れ条件:
    - 挙動変更なしで `npm run build` が通る
    - `simple-vrm` の起動/接続/停止が従来通り動作

- Phase 1: React最小導入（1ページ PoC）
  - 目的:
    - 既存 Core を再利用しつつ、React UI を 1 ページで成立させる
  - 実施内容:
    - `react`, `react-dom`, `@vitejs/plugin-react-swc` を追加
    - Vite MPA を維持したまま移行対象ページのエントリのみ React 化
    - React UI で最低限の画面要素（Start/Stop、チャット表示、接続状態）を実装
    - 未移行機能は既存 UI manager を暫定利用して共存させる
  - 対象ページ:
    - 第一候補: `simple-vrm`
  - 受け入れ条件:
    - 移行対象ページで Start -> RTC接続 -> text/telop受信 -> Stop が動作
    - 非移行ページ（`main` 等）がビルド/起動可能

- Phase 2: 共通UIの段階移行（React UIの実用化）
  - 目的:
    - `partials` と `UI/*Manager.ts` 依存を減らし、UI保守性を上げる
  - 実施内容:
    - 設定ダイアログを React コンポーネント化
    - チャット表示 UI を React 化（system/user/error 表示を再現）
    - DebugConsole を React 化（段階的に。まずログと主要状態表示を優先）
    - 既存 singleton manager を UIアダプタ化 or 縮退
  - 受け入れ条件:
    - 既存の主要デバッグ表示（RTCログ/VAD状態/音声メーター）の欠落がない
    - イベント二重登録や二重描画が発生しない

- Phase 3: Babylon.js 依存の隔離・縮退
  - 目的:
    - 通常系ページから Babylon.js 依存を切り離し、保守対象を明確化する
  - 実施内容:
    - `SincroLegacy/**` と `area360/**` を `legacy`/`experimental` として扱う方針を実装/文書で明示
    - 通常系ページ（VRM1.0）と Babylon系ページのビルド確認手順を分ける
    - Babylon系ページの利用状況を確認し、代替実装または廃止順を決める
  - 受け入れ条件:
    - 通常系ページ開発時に Babylon 変更が不要な状態
    - 削除対象/維持対象が文書化されている

- Phase 4: Looking Glass の VRM1.0 対応
  - 目的:
    - Babylon ベース `SincroGlassScene` を脱却し、Three.js + VRM1.0 側へ移植する
  - 実施内容:
    - Looking Glass 起動処理（`@lookingglass/webxr`）を描画エンジン非依存の開始ロジックとして切り出す
    - Three.js/VRMScene 側で Looking Glass 用エントリ（仮: `LookingGlassVrmScene`）を実装
    - 既存 `glass` / `character-glass` ページの役割整理（統合 or 廃止）
  - 受け入れ条件:
    - VRM1.0 キャラクターで Looking Glass 表示が起動できる
    - Babylon依存なしで Looking Glass 機能を維持できる見通しが立つ

### 7.6 初期タスク分解（Phase 0 / Phase 1 着手用）

- Phase 0 タスク（推奨順）
  - `SincroController` の責務をコメント付きで整理（設定反映、RTC、Gaze、UI更新）
  - UI manager 呼び出し一覧を作成（どのイベント/状態を UI が必要としているか）
  - `simple-vrm` の起動経路（`main-vrm.ts` -> `SincroVRMInitializer` -> `SincroController`）を図または箇条書きで明文化
  - React導入後も再利用する Core API の最小セットを定義

- Phase 1 タスク（推奨順）
  - 依存追加と Vite React plugin 導入
  - `simple-vrm` 用 React エントリ作成（既存ページは維持）
  - Start/Stop ボタンと接続状態の最小 UI 実装
  - チャット受信表示（`text_ch` / `telop_ch`）の最小 UI 実装
  - 既存 DebugConsole の暫定共存（完全移行は Phase 2）

### 7.7 設計判断ルール（移行中のブレ防止）

- 新規機能追加時の原則:
  - UIに閉じる変更は React 側へ追加する
  - RTC/Media/描画のロジック追加は Core/Renderer 側に閉じ込める
  - React コンポーネントから WebRTC API を直接叩かない（Facade/Controller 経由）
- 依存追加の原則:
  - 同等のことが React 標準機能 + 既存実装で実現できるなら新規ライブラリを追加しない
  - 状態管理ライブラリは Context/props で破綻してから検討する
- 廃止判断の原則:
  - Babylon系ページは代替実装 or 明確な廃止告知のどちらかを先に決める
  - 「未使用だが残す」は期限付きにする（見直し日を決める）

### 7.8 `SincroController` 分割案（Phase 0 の具体化）

- 目的:
  - 現在 `SincroController` に集中している「設定反映 / UI更新 / RTC開始 / Gaze開始」を分離し、React UI から扱いやすい API にする

- 現行 `SincroController` の責務（観測ベース）
  - UI manager の取得と初期値反映（`DialogManager`, `DebugConsoleManager`, `ChatMessageManager`）
  - `UserMediaManager` へのマイク設定反映（NS/EC/AGC/VAD関連）
  - `DebugConsoleManager` と `UserMediaManager` の双方向コールバック接続
  - `getUserMedia` 実行と成功/失敗ハンドリング
  - `RTCTalkClient` の生成、DataChannel コールバック設定、開始/停止
  - `CharacterGaze` の起動、デバッグ表示更新、AutoMute 制御
  - 一部 DOM 直接操作（`#eyeTarget`）

- 分割後の想定構成（最小）
  - `SincroAppController`（新設、UIから使う入口）
    - 責務: `start()`, `stop()`, `applySettings()`, `subscribe()` の公開 API を提供
    - React UI / 既存UI manager の両方から利用可能な Facade とする
  - `SincroRtcSessionController`（新設）
    - 責務: `RTCTalkClient` の生成、開始/停止、DataChannel受信の `TalkManager` 連携
    - `SincroRTCConfigManager` 依存を内部に閉じる
  - `SincroAudioInputController`（新設）
    - 責務: `UserMediaManager` 設定反映、`getUserMedia` 実行、VAD状態通知、音声トラック取得
    - VAD/学習VAD設定の双方向反映を集中管理
  - `SincroCharacterGazeController`（新設）
    - 責務: `CharacterGaze` 起動、視線状態通知、AutoMuteイベント通知
    - DOM 直接操作（`#eyeTarget`）はここに閉じるか、UIイベント化して除去する
  - `SincroUiBridge`（新設 or 暫定）
    - 責務: 既存 `DialogManager` / `DebugConsoleManager` / `ChatMessageManager` との接続
    - React移行完了後に縮退/削除対象

- 依存方向（守るべきルール）
  - `React UI` -> `SincroAppController` -> (`AudioInput` / `RtcSession` / `CharacterGaze`)
  - Core controller 群 -> Browser API / 既存 Core (`RTCTalkClient`, `UserMediaManager`, `TalkManager`)
  - Core controller 群 -> React 依存禁止
  - `SincroUiBridge` は暫定的に Core と既存UI manager をつなぐが、新規ロジックを増やさない

- ファイル配置案（例）
  - `sincromisor-frontend/src/ts/App/SincroAppController.ts`
  - `sincromisor-frontend/src/ts/App/SincroRtcSessionController.ts`
  - `sincromisor-frontend/src/ts/App/SincroAudioInputController.ts`
  - `sincromisor-frontend/src/ts/App/SincroCharacterGazeController.ts`
  - `sincromisor-frontend/src/ts/App/SincroUiBridge.ts`（暫定）
  - 注: 既存 `src/ts/RTC/**` / `src/ts/UI/**` / `src/ts/CharacterGaze/**` は当面維持

- 段階的な分割順（推奨）
  - 1. `SincroRtcSessionController` を抽出（外部影響が比較的小さい）
  - 2. `SincroAudioInputController` を抽出（`UserMediaManager` と VAD callback を集約）
  - 3. `SincroCharacterGazeController` を抽出（DOM依存を局所化）
  - 4. `SincroAppController` を薄い Facade として整える
  - 5. `SincroUiBridge` を導入して既存UI manager 接続を集約

### 7.9 UIイベント境界（React UI が購読する最小イベント）

- 目的:
  - React 導入時に、既存 singleton manager を直接触らずに UI 更新できるイベント面を定義する

- React UI が必要とする主な入力イベント（最小セット）
  - 接続状態:
    - `idle | preparing_media | connecting_rtc | connected | reconnecting | error | stopped`
  - チャット関連:
    - `chat_message_received`（`ChatMessage`）
    - `telop_message_received`（`TelopChannelMessage`）
    - `system_message` / `error_message`（表示専用文字列）
  - 音声/VAD関連:
    - `local_vad_state_changed`（speech/silence）
    - `learned_vad_state_changed`（status, probability 等）
    - `local_audio_meter_changed`（RMS/peak）
  - CharacterGaze関連:
    - `gaze_target_changed`（x, y, facing）
    - `gaze_presence_changed`（arrive/leave）
  - RTC統計/ログ関連:
    - `rtc_log_added`
    - `rtc_stats_updated`

- React UI から Core へ渡す主なコマンド（最小セット）
  - `applySettings(settings)`
  - `start()`
  - `stop()`
  - `setMute(boolean)`（必要なら公開）
  - `updateVadTuning(...)` / `updateAudioFilter(...)`（Phase 2 以降）

- 既存 manager との対応（移行マッピング）
  - `ChatMessageManager.write*` -> `chat/system/error` 表示イベントへ寄せる
  - `DebugConsoleManager.update*` -> `rtc_stats / vad / gaze / log` 系イベントへ寄せる
  - `DialogManager.*` getter 群 -> `settings` オブジェクト生成へ寄せる

### 7.10 Phase 0 完了判定（レビュー観点）

- コード構造チェック
  - `SincroController` の行数・責務が実際に減っている
  - `RTCTalkClient` / `UserMediaManager` / `CharacterGaze` への接続点が controller 単位で分離されている
  - 新規 controller が React 非依存になっている

- 挙動チェック（最低）
  - `simple-vrm` で Start/Stop が従来通り動作
  - マイク/カメラ取得失敗時のエラー表示が維持される
  - `text_ch` / `telop_ch` が従来通り `TalkManager` に流れる
  - CharacterGaze + AutoMute の基本動作が維持される（有効時）

- ドキュメントチェック
  - `frontend_ui.md` に現行実装との差分（新規 controller 入口）を追記
  - 本書の分割案から逸脱した場合は、理由を変更履歴に残す

### 7.11 `SincroController` の UI manager 呼び出し一覧（Phase 0 作業メモ）

- 目的:
  - React 導入前に、現行 `SincroController` が UI 層へ依存しているポイントを洗い出し、置換順を決める

- `DialogManager` 参照（設定入力の読み取り）
  - 初期設定反映:
    - `enableNoiseSuppression()`
    - `enableEchoCancellation()`
    - `enableAutoGainControl()`
    - `enableVadGate()`
    - `enableVenueNoiseMode()`
    - `enableCharacterGaze()`
  - RTC 開始時:
    - `talkMode()`
  - CharacterGaze / AutoMute:
    - `enableCharacterGaze()`
    - `enableAutoMute()`
  - 移行メモ:
    - React 化後は `DialogManager` getter 群を `AppSettings` オブジェクト生成へ集約する

- `DebugConsoleManager` 呼び出し（表示更新 + UIイベント受け口）
  - 初期表示値の投入:
    - `setLocalAudioFilterConfig(...)`
    - `setLocalVadRmsThreshold(...)`
    - `setLocalVadThresholdMode(...)`
    - `setLocalLearnedVadTuning(...)`
    - `setLocalLearnedVadStrictMode(...)`
    - `setLocalLearnedVadPerformanceMode("balanced")`
  - UI 操作コールバック登録（Debug UI -> Core）
    - `setLocalAudioFilterChangeCallback(...)`
    - `setLocalVadThresholdModeChangeCallback(...)`
    - `setLocalLearnedVadPerformanceModeChangeCallback(...)`
    - `setLocalLearnedVadTuningChangeCallback(...)`
    - `setLocalLearnedVadStrictModeChangeCallback(...)`
    - `setLocalVadRmsThresholdChangeCallback(...)`
  - Core 状態更新（Core -> Debug UI）
    - `updateLearnedVadState(...)`
    - `updateLocalVadState(...)`
    - `setLocalAudioTrack(...)`
    - `updateFaceXLog(...)`
    - `updateFaceYLog(...)`
    - `updateFacing(...)`
    - `updateCharacterEyeStatus(...)`
  - 移行メモ:
    - Phase 0 では `DebugConsoleManager` を `SincroUiBridge` 配下に寄せる
    - Phase 2 で React Debug UI へ置換し、callback登録の責務を `SincroAudioInputController` へ移す

- `ChatMessageManager` 呼び出し（ユーザー向けメッセージ表示）
  - エラー表示:
    - `writeErrorMessage(...)`（config取得失敗）
    - `writeErrorMessage(...)`（getUserMedia失敗）
  - 移行メモ:
    - React UI 導入後は `error_message` / `system_message` イベントへ寄せる
    - `SincroVRMInitializer` 側の挨拶メッセージ出力も合わせて整理対象

- DOM 直接操作（UI/描画境界の暫定依存）
  - `document.querySelector("#eyeTarget")`
  - `setAttribute("fill" | "cx" | "cy", ...)`
  - 移行メモ:
    - `SincroCharacterGazeController` に局所化し、最終的には React UI イベント描画へ置換
    - ただし描画負荷を考慮し、Phase 1/2 では即時置換しなくてもよい

- 優先度（置換順）
  - 1. `ChatMessageManager`（イベント化しやすい）
  - 2. `DebugConsoleManager` の「表示更新」系（イベント化）
  - 3. `DialogManager` getter 群（設定オブジェクト化）
  - 4. `DebugConsoleManager` の「UI操作コールバック」系（Reactフォームへ置換）
  - 5. `#eyeTarget` の DOM 直接操作（後回し可）

### 7.12 Phase 0-1 実装開始用変更セット（`SincroRtcSessionController` 抽出）

- 目的:
  - `SincroController` から RTC セッション生成/開始/停止の責務を先に分離し、最初の安全な分割PRとする

- この変更セットで扱う対象（In Scope）
  - `RTCTalkClient` の生成、`start()` / `stop()` 呼び出し
  - `text_ch` / `telop_ch` 受信コールバックの `TalkManager` 連携
  - `SincroRTCConfigManager` の参照と設定取得失敗時のエラーハンドリング経路
  - ローカル音声トラックを `DebugConsoleManager.setLocalAudioTrack(...)` へ渡す処理

- この変更セットで扱わない対象（Out of Scope）
  - `UserMediaManager` の設定反映・VAD callback 配線
  - `CharacterGaze` の起動と AutoMute 制御
  - `DialogManager` の設定読み取り整理（`AppSettings` 化）
  - React コンポーネント導入、Vite React plugin 導入
  - DebugConsole UI の React 化

- 想定する新規/変更ファイル（最小）
  - 新規:
    - `sincromisor-frontend/src/ts/App/SincroRtcSessionController.ts`
  - 変更:
    - `sincromisor-frontend/src/ts/SincroController.ts`
  - 原則変更しない:
    - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
    - `sincromisor-frontend/src/ts/RTC/TalkManager.ts`
    - `sincromisor-frontend/src/ts/RTC/SincroRTCConfigManager.ts`

- 新規 `SincroRtcSessionController` の責務（初版）
  - `constructor(...)`
    - `DebugConsoleManager`, `ChatMessageManager`, `TalkManager`, `SincroRTCConfigManager` を受け取る or 内部取得
  - `start(audioTrack: MediaStreamTrack, talkMode: string): void`
    - config 存在チェック
    - `setLocalAudioTrack(...)`
    - `RTCTalkClient` 生成
    - text/telop callback 配線
    - `RTCTalkClient.start()`
  - `stop(): void`
    - `RTCTalkClient.stop()`
  - （任意）`setMute(mute: boolean): void`
    - 後続の AutoMute 移管を見据えて薄い委譲だけ用意してよい

- `SincroController` 側の変更方針（初回PR）
  - 残す責務:
    - `UserMediaManager` の設定反映と callback 配線
    - `getUserMedia` 実行
    - `CharacterGaze` 起動
  - 移す責務:
    - `startRTC()` の本体処理（`RTCTalkClient` 生成/開始）
    - `stopRTC()` の本体処理（停止委譲）
    - `setTextChannelCallback()` / `setTelopChannelCallback()`（private helper）

- PR の受け入れ条件（この変更セット専用）
  - 構造:
    - `SincroController` から `RTCTalkClient` 直接生成コードが消えている
    - `SincroRtcSessionController` が React 非依存である
  - 挙動:
    - `simple-vrm` で Start -> RTC接続 -> text/telop受信 -> Stop が従来通り
    - config取得失敗時 / getUserMedia失敗時のエラーメッセージ表示が回帰しない
  - 影響範囲:
    - `UserMediaManager` / `CharacterGaze` 周辺の挙動に変更が入っていない

- レビュー時の確認ポイント（差分が膨らみやすい箇所）
  - `RTCTalkClient` の callback 配線が `TalkManager` へ正しく残っているか
  - `talkMode()` の取得タイミングが変わっていないか
  - `DebugConsoleManager.setLocalAudioTrack(...)` の呼び出しタイミングが遅れていないか
  - `stopRTC()` が null 安全に呼べるか（Start 前/失敗時を含む）

- 推奨コミット分割（小さく進める場合）
  - Commit 1: `SincroRtcSessionController` 追加（未使用）
  - Commit 2: `SincroController` から RTC 開始/停止を委譲
  - Commit 3: 軽微な整理（命名・コメント・型補足）

## 8. 設定・デプロイ

- 環境変数:
  - 原則変更なし（サーバー配布 `config.json` を継続利用）
- 設定ファイル:
  - `sincromisor-frontend/vite.config.js`（React plugin 追加、MPA は維持）
- 導入状況（2026-02-22 時点）:
  - `react` / `react-dom` は導入済み（`^19.2.4`）
  - `@vitejs/plugin-react-swc` は未導入（Phase 1 で追加予定）
- 起動方法:
  - `cd sincromisor-frontend && npm run dev`
- デプロイ/ローカル実行手順:
  - 段階移行中も `npm run build` を通す
  - React 導入後は移行対象ページと既存ページの両方を確認する
- 互換性に影響する設定変更:
  - Vite MPA entry 名変更は既存URLに影響するため慎重に扱う
  - Babylon 依存を削除する前に、対応ページの代替実装提供または廃止告知を行う

## 9. 監視・運用

- ログ設計:
  - 既存の `ChatMessageManager` / `DebugConsoleManager` のログ表示要件を移行時の受け入れ条件に含める
- メトリクス:
  - 既存 `getStats()` 可視化項目を維持（React化で削らない）
- 障害時の切り分け手順:
  - 1. 非移行ページで再現するか確認（Core起因かUI起因か切り分け）
  - 2. `config.json` 取得、ICE状態、DataChannel open を確認
  - 3. React UI 表示更新のみの問題か、RTC/音声処理まで影響しているか切り分け
- よくある失敗と対処:
  - React 導入時に UI 再描画でイベント登録が二重化する
  - React state と既存 singleton manager の二重状態管理で表示不整合が起きる
  - 移行途中に Babylon ページのビルドが壊れるため、通常系と experimental 系の確認を分ける

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 変更なし（上位構成に依存）
- 秘密情報の扱い:
  - 変更なし。フロントに長期秘密情報を保持しない
- 入力検証:
  - React 化してもサーバー送信 payload の検証責務は現行方針を維持
- 脅威と対策:
  - UI 再構成時の XSS 回避のため、メッセージ描画時の文字列挿入方法を明示的に管理する
- 監査ログ（必要な場合のみ）:
  - 現時点では対象外

## 11. テスト方針

- テスト観点:
  - UI移行で RTC / 音声 / デバッグ機能が回帰しないこと
  - Babylon隔離で通常系ページのビルド・起動が安定すること
  - Looking Glass VRM1.0 対応で既存体験が最低限維持されること
- 単体テスト:
  - まずは複雑化しやすい UI state 変換・イベント変換ロジックから導入を検討
- 結合テスト:
  - React UI + Core（RTC/Media）の連携確認を優先
- E2Eテスト:
  - 個人開発負荷を考慮し、まずは手動テスト手順を整備
- 負荷テスト（必要な場合のみ）:
  - 現時点では対象外
- 受け入れ条件:
  - `npm run build` 成功
  - 移行対象ページで Start -> RTC接続 -> text/telop受信 -> Stop が動作
  - デバッグコンソールの主要表示（RTCログ/VAD/メーター）が維持される

## 12. 既知課題・リスク

- 既知課題:
  - 既存 UI manager が singleton + DOM 直操作前提のため、React と直接併用しにくい
  - `SincroController` の責務が広く、移行初期の境界設定を誤ると再配線コストが増える
- 技術的負債:
  - Babylon.js legacy と Three.js/VRM1.0 が同一プロジェクト内で混在
  - MPA 各ページごとの初期化コード分散
- リスク一覧:
  - UI移行中の二重状態管理によるバグ
  - React 導入と Looking Glass 移植を同時に進めた場合の切り分け難化
  - Babylon 削除前に experimental ページの利用者影響を見落とす
- 軽減策:
  - UI移行・描画移植・依存削減をフェーズ分離する
  - 最初は 1 ページ（`simple-vrm`）のみで React 導入を検証する
  - 非移行ページを残して比較・切り戻し可能にする

## 13. 代替案と設計判断

- 検討した代替案:
  - プレーン TypeScript のまま整理を継続する
  - Vue / Svelte を採用する
  - Next.js 等のフルスタックフレームワークへ移行する
- 採用しなかった理由:
  - プレーン TypeScript 継続は UI 拡大時の保守負担軽減が限定的
  - Vue / Svelte も有力だが、情報量・周辺事例の多さで React を優先
  - Next.js は本件（既存 Vite MPA + WebRTC/3D）に対して構成が大きくなりやすい
- 最終判断:
  - `React + Vite + TypeScript` を最小依存で導入し、UI 層から段階移行する
  - MPA 構成は当面維持し、Router / 大規模 state 管理は必要になるまで導入しない

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-22 | 初版作成（React段階移行、Babylon切り離し、Looking Glass VRM1.0対応方針） |
| 2026-02-22 | フェーズ別実施手順（Phase 0-4）、初期タスク分解、設計判断ルールを追加 |
| 2026-02-22 | `SincroController` 分割案、UIイベント境界、Phase 0 完了判定を追加 |
| 2026-02-22 | `SincroController` の UI manager 呼び出し一覧を追加、React/ReactDOM `^19.2.4` 導入状況を反映 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/frontend_ui.md`
  - `documents/design/frontend_character.md`
  - `documents/design/networking_rtc.md`
- 参照実装:
  - `sincromisor-frontend/src/ts/SincroController.ts`
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-frontend/src/ts/SincroLegacy/Scene/SincroGlassScene.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMScene/VRMScene.ts`
- 外部リンク:
  - Looking Glass WebXR docs: https://docs.lookingglassfactory.com/developer-tools/webxr
