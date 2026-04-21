# Frontend React移行計画

Sincromisor フロントエンドを、既存機能を維持しながら段階的に React ベースへ移行するための計画文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/frontend_migration_react.md`
- 作成日: 2026-02-22
- 最終更新日: 2026-04-22
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

### 2.1 優先順位の更新（2026-02-22）

- 最優先タスク:
  - VRM 1.0（Three.js + `@pixiv/three-vrm`）の基本機能維持/改善
  - Looking Glass + VRM 1.0 実装（Babylon 依存を持ち込まない）
  - React 化（UI/制御境界の整理を含む）
- 方針変更:
  - Babylon.js legacy の置換は段階を細かく刻まず、通常導線・通常ビルドから先に切り離して高速に進める
  - legacy 機能は必要時のみ明示的にビルド/検証する

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

### 6.1 ページ分類と移行優先順位（2026-04-21）

- build の基準:
  - 通常開発では `npm run build` を使い、`main`、`simple-vrm`、`vrm360`、`looking-glass-vrm` だけを常時守る
  - `npm run build:all` は legacy/Babylon.js 検証が必要な時だけ使う
  - `vite.config.js` は `SINCRO_BUILD_LEGACY=1` の時だけ legacy input を追加し、通常 build では Babylon.js 系ページを入口ごと切り離す
- 優先順位:
  - 優先度 A: `main`、`simple-vrm`
    - 公開導線と通常会話の正規ルート。React / CSS / 文言整理の主対象
  - 優先度 B: `vrm360`、`looking-glass-vrm`
    - Three.js + VRM1.0 基盤の実験導線。通常ビルドには含めるが、環境依存前提で段階改善する
  - 優先度 C: `simple`、`glass`、`character`、`character-glass`、`area360`
    - Babylon.js legacy の検証ページ。通常導線から外し、比較確認専用に縮退する
  - 優先度 D: `single`、`double`
    - `deprecated`。即時凍結し、React 化や CSS 追従の対象にしない
- `single` / `double` の扱い:
  - 現行 standalone ページのまま維持しない
  - 将来要件が残る場合は、modern 側の page variant または overlay として再設計する
  - Babylon.js ベースの現行ページは退役候補として扱う
- 本書で参照する詳細な分類表の正本は `documents/design/frontend_ui.md` とする

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
    - `SincroLegacy/**` と `area360/**` を `legacy` として扱う方針を実装/文書で明示し、`single` / `double` は `deprecated` として凍結する
    - 通常系ページ（VRM1.0）と Babylon系ページのビルド確認手順を分ける
    - Babylon系ページの利用状況を確認し、代替実装または廃止順を決める
  - 受け入れ条件:
    - 通常系ページ開発時に Babylon 変更が不要な状態
    - 削除対象/維持対象が文書化されている
    - `single` / `double` を正規導線として守らないことが明文化されている

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
  - React/UI の新規ファイルは原則 `TypeScript`（`.ts` / `.tsx`）で実装し、props・state・イベントpayloadの型を明示する
  - RTC/Media/描画のロジック追加は Core/Renderer 側に閉じ込める

### 7.8 CharacterGaze 改善メモ（2026-02-22）

- 複数人検出時の「迷う」挙動を抑えるため、`CharacterGaze` に `FaceTargetSelector` を導入した。
  - 1人を選ぶスコア式（中央寄り/近さ/連続性/正面向き）
  - 保持時間 + 切替マージンによるヒステリシス
- カクつき対策として、6 keypoint（目/鼻/口/耳）の `x/y` に `OneEuroFilter1D` を適用した。
  - 低速時は平滑化、急な動きは追従性を優先
  - 微小揺れは deadband で無視
- Debug Console の Gaze タブに `Target` 行を追加し、簡易調整用に以下を表示する。
  - `対象:<index>`（選択中の候補）
  - `候補:<n>`（検出人数）
  - `固定中`（保持ロック中）
  - `停止中`（Gaze OFF）
- Debug Console の Gaze タブに `Gaze Tuning` を追加し、実行中に以下を調整できるようにした。
  - `Hold(ms)` / `Switch Margin` / `Relink Dist`
  - `OneEuro Min` / `OneEuro Beta`
  - `Deadband`
- `Target` 表示には選択スコア（`score:0.xx`）を含め、切替挙動の調整をしやすくした。
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

### 7.9.1 React UI の残存 direct manager 依存棚卸し（2026-04-22）

| 対象 | 旧 direct dependency | React が必要だったもの | 分類 | 現在の扱い |
| --- | --- | --- | --- | --- |
| `src/react/chat/SincroChatView.tsx` | `ChatMessageManager.getManager()` | チャット履歴 snapshot、system icon 更新、旧 DOM 描画停止、`renderMode` 付き更新イベント | `既存 bridge へ移行` | `appController.chat.getMessageViewSnapshot()`、`appController.chat.getSystemIconUrl()`、`appController.chat.setDomRenderingEnabled(...)`、`chat_system_icon` / `chat_message` / `system_message` / `error_message` へ移行済み |
| `src/react/telop/SincroTelopView.tsx` | `TalkManager.getManager()` | telop text segment snapshot、旧 footer DOM 描画停止、`telop_message` 購読 | `bridge/state 拡張後に移行` | `appController.state.getTelopTextSegmentsSnapshot()`、`appController.chat.setTelopDomRenderingEnabled(...)`、`telop_message` へ移行済み |
| `src/react/dialog/**`, `src/react/simple-vrm/**`, `src/react/looking-glass-vrm/**`, `src/react/vrm360/**` | なし（すでに `SincroAppController` 経由） | 設定 snapshot、dialog UI 状態、lifecycle / connection / LG 状態 | `維持` | direct manager 依存なしを継続 |

- React UI の現行ルール:
  - 新規 React コンポーネント / hook は manager singleton を直接 import・`getManager()` しない。
  - 読み取りは `appController.state`、会話表示系の操作は `appController.chat`、dialog 操作は `appController.dialog`、停止などの接続操作は `appController.rtc`、診断UI配線は `appController.debug` を使う。
  - active controller 差し替えに備え、React 側の購読は `SincroAppController.getCurrent()` / `subscribeCurrent()` または `subscribeActiveSincroAppEvents(...)` を正規経路とする。
- スコープ外として残すもの:
  - `TalkManager` / `ChatMessageManager` の direct 参照は Core / legacy / renderer 側に残るが、React UI の direct dependency とは分けて扱う。
  - legacy ページの整理や manager 自体の削除は別タスクで判断する。

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

### 7.10.1 Phase 0 実装進捗（2026-02-22）

- 実装済み（挙動維持を優先した抽出）
  - `SincroAppController`（薄いFacade）
    - UI層（現行Initializer / 将来React）から使う入口を固定
    - `start()` / `stop()` API を公開（現段階では `SincroController` への委譲中心）
    - `subscribe(...)` の最小土台を実装（lifecycle イベントのみ）
    - `setStartHooks(...)` を実装し、initializer 側のUI副作用（挨拶/シーン起動/ダイアログ閉じ）を段階的に移管可能にした
  - `SincroRtcSessionController`
    - `RTCTalkClient` 生成/開始/停止
    - `text_ch` / `telop_ch` の `TalkManager` 連携
    - `setLocalAudioTrack(...)` 反映
    - AutoMute 用 `setMute(...)` 委譲
  - `SincroAudioInputController`
    - `UserMediaManager` 生成
    - `DialogManager` 設定の `UserMediaManager` 反映
    - `DebugConsoleManager` と VAD/学習VAD callback 配線
    - `getUserMedia` 実行とエラー表示
  - `SincroCharacterGazeController`
    - `CharacterGaze` 起動
    - 視線状態の Debug 表示更新
    - `#eyeTarget` DOM 更新（暫定維持）
    - AutoMute イベントから `setMute` への橋渡し

- 現在の `SincroController` の主責務（簡素化後）
  - manager/controller の組み立て
  - `start()` での audio / rtc / gaze controller の起動順制御
  - `talkMode` の引き渡し
  - stop 操作の委譲
  - 注: UI向けイベント購読は `SincroAppController` 側へ段階的に引き上げる方針

- 残タスク（Phase 0 で推奨）
  - `SincroUiBridge` の導入方針を確定（既存 UI manager 併存期間の整理）
  - `SincroAppController.subscribe(...)` のイベント種類拡張（chat/error/rtc/vad/gaze）
  - `SincroAppController` の責務拡張（`applySettings` 方向）
  - `SincroController` と `SincroVRMInitializer` の責務境界を再定義（Start/Stop/初期メッセージ）

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

### 7.13 Phase 1 実装開始用変更セット（`simple-vrm` React最小PoC）

- 目的:
  - 既存 MPA と Core 実装を維持したまま、`simple-vrm` で React UI を最小導入し、移行方式を検証する

- この変更セットで扱う対象（In Scope）
  - `@vitejs/plugin-react-swc` の導入と `vite.config.js` への適用
  - `simple-vrm` 用 React エントリの追加（既存ページを置換または並行）
  - Start/Stop、接続状態、最小メッセージ表示の React UI 実装
  - 既存 Core（`SincroController` または Phase 0で抽出した controller 群）への接続
  - 既存 DebugConsole の暫定共存（必要なら表示は既存のまま）

- この変更セットで扱わない対象（Out of Scope）
  - DebugConsole 全面React化
  - 設定ダイアログ全面React化（詳細設定UI・VAD調整UI）
  - `main`, `single`, `double`, `vrm360` 等の他ページの React 化
  - Babylon.js 依存ページの整理/削除
  - Looking Glass VRM1.0 移植

- 想定する新規/変更ファイル（例）
  - 新規:
    - `sincromisor-frontend/src/simple-vrm/main-react.tsx`（仮）
    - `sincromisor-frontend/src/react/simple-vrm/SimpleVrmApp.tsx`（仮）
    - `sincromisor-frontend/src/react/shared/types.ts`（必要な場合のみ）
  - 変更:
    - `sincromisor-frontend/vite.config.js`（React plugin 追加）
    - `sincromisor-frontend/src/simple-vrm/index.html`（React mount point の追加/調整）
    - `sincromisor-frontend/package.json`（`@vitejs/plugin-react-swc` 追加後）
  - 原則変更しない:
    - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
    - `sincromisor-frontend/src/ts/RTC/UserMediaManager.ts`
    - `sincromisor-frontend/src/ts/RTC/LearnedVadWorkerClient.ts`

- React PoC の最小UI要件（Phase 1 の完成ライン）
  - 必須表示:
    - Start ボタン
    - Stop ボタン
    - 接続状態表示（文字列で可）
    - チャット/システム/エラーの最小ログ表示
  - 任意（あれば良い）:
    - 現在の talk mode 表示
    - Character 有効/無効の表示
  - 非対象（Phase 2 へ送る）:
    - DebugConsole 詳細UI
    - VAD チューニングUI
    - 設定ダイアログ全項目

- React PoC の接続方式（推奨）
  - 方式A（推奨・低リスク）:
    - React UI は `SincroAppController` / `SincroController` を呼び出すだけ
    - 既存 `DialogManager` / `DebugConsoleManager` は暫定共存
    - React は「最小の操作UI + 表示UI」のみ担当
  - 方式B（限定的に可）:
    - `ChatMessageManager` の出力だけイベント化し、React のログ表示に流す
    - DebugConsole は既存DOMのまま維持
  - 避ける方式:
    - React 導入初回PRで `DialogManager` / `DebugConsoleManager` を同時に全面置換する

- `simple-vrm` ページの移行パターン（選択肢）
  - パターン1（推奨）:
    - `simple-vrm/index.html` は維持
    - React mount point を追加し、既存DOMと併存させる
    - 問題がなければ後続で既存DOMを縮退
  - パターン2:
    - `simple-vrm/index.html` の UI 部分を React mount に置換
    - 3D描画用のコンテナ DOM は既存IDを維持
  - 判断基準:
    - 切り戻しやすさを優先するならパターン1
    - 差分量を減らしたいならパターン2（ただし回帰確認が増える）

- PR の受け入れ条件（この変更セット専用）
  - ビルド/起動:
    - `npm run build` が成功
    - `simple-vrm` が dev/build 両方で開ける
  - 挙動:
    - React UI から Start/Stop が実行できる
    - `text_ch` / `telop_ch` 由来の表示が最低限確認できる
    - 既存 DebugConsole（暫定共存時）が機能を失っていない
  - 非回帰:
    - 非移行ページ（少なくとも `main` または `simple`）がビルドできる
    - WebRTC payload / endpoint に変更が入っていない

- レビュー時の確認ポイント
  - `vite.config.js` の MPA entry が壊れていないか
  - React plugin 追加で既存 HTML partial plugin の挙動に影響が出ていないか
  - React mount 先と既存 DOM ID が衝突していないか
  - Start/Stop のイベント登録が二重化していないか
  - StrictMode の有無による副作用二重実行の影響を考慮しているか

- 推奨コミット分割（小さく進める場合）
  - Commit 1: `@vitejs/plugin-react-swc` 導入 + `vite.config.js` 設定
  - Commit 2: `simple-vrm` 用 React mount と最小表示（ダミー表示）
  - Commit 3: Start/Stop 接続
  - Commit 4: 最小メッセージ表示 + 調整

### 7.13.1 Phase 1 実装進捗（2026-02-22）

- 実装済み（PoC最小段階）
  - `vite.config.js` に `@vitejs/plugin-react-swc` を適用
  - `simple-vrm/index.html` に React mount point を追加（既存UIと併存）
  - `simple-vrm/main-react.tsx` を追加し、React パネルをマウント
  - `src/react/simple-vrm/SimpleVrmControlPanel.tsx` を追加（旧 `SimpleVrmReactPanel.tsx` を正式名へリネーム）
    - `SincroAppController.subscribeCurrent(...)` で active controller を監視
    - `SincroAppController.subscribe(...)`（lifecycle + system/error/chat + VAD/Gaze/RTC event）を表示
    - Start/Stop は `SincroAppController` 直接操作に統一（controller 未接続時は disabled）
  - `ChatMessageManager` に購読フックを追加（既存DOM描画は維持）
  - `ChatMessageManager` に履歴スナップショット保持 + DOM描画ON/OFF切替を追加し、React描画移行中でも既存 `write*` API を維持したまま表示層を差し替えられるようにした
  - `SincroAppController.subscribe(...)` へ chat/system/error イベントを接続
  - `DebugConsoleManager` に購読フックを追加（既存Debug表示は維持）
  - `SincroAppController.subscribe(...)` へ local VAD / learned VAD / Gaze / RTC event log / ICE / signaling を接続
  - `SincroAppController` 側で簡易 `connection_state`（idle/starting/connecting/connected/degraded/...）を導出し、React PoC はそれを優先表示
  - `SincroAppController` に `settings_snapshot` / `applySettings(...)` の最小基盤を追加
    - 現在対応: `titleText`, `talkMode`, `enableCharacter`, `enableTalk`, `enableCharacterGaze`, `enableAutoMute`, `enableNoiseSuppression`, `enableEchoCancellation`, `enableAutoGainControl`, `enableVadGate`, `enableVenueNoiseMode`, `enableInspector`, `enableVR`
  - `DialogManager.subscribeSettingsChange(...)` を追加し、既存ダイアログ操作の変更も `settings_snapshot` として React 側へ同期可能にした
  - `SincroAppController` に `settings_ui_state`（既存ダイアログの disabled 状態）を追加し、React PoC の入力可否を既存 UI 制約と同期
  - `DialogManager.updateCharacterStatus(...)` / `updateUserMediaAvailabilityStatus(...)` などの status 更新でも `settings_ui_state` が追従するよう通知を追加し、disabled 状態同期の取りこぼしを低減
  - `SincroAppController` に `settings_ui_hints`（disabled 理由の補足）を追加し、React PoC の Character/Gaze/AutoMute 設定で理由表示を開始
  - `SincroAppController` に `startup_settings_status`（`enableTalk` / `enableInspector` / `enableVR` の変更差分）を追加し、React PoC で `running` 中は再起動推奨、`stopped/idle` では「次回起動で反映予定」として表示
  - `SincroAppController` に `startup_settings_capabilities`（ページ別の有効性）を追加し、initializer から登録する構成にした
    - `simple-vrm`（`SincroVRMInitializer`）では現行実装で `Talk/Inspector/VR` が scene 初期化へ未接続のため、React PoC 上では disabled + 注記表示
    - React PoC の startup settings は、通常表示を「サポート項目のみ」に絞り、未対応項目は `details` 展開時のみ確認できるよう整理
    - legacy（`SincroInitializer`）では `Inspector/VR` は scene 初期化に反映されるため有効、`enableTalk` は現状未使用として無効
  - `SincroAppController.applySettings(...)` 実行中の `settings_snapshot` 多重通知を抑制し、反映後に単発スナップショットを通知するよう整理
  - React PoC パネルから `titleText`、`talkMode`、主要マイク設定トグル、Character/Gaze/AutoMute、起動前設定トグル（Talk/Inspector/VR）を `applySettings(...)` 経由で変更可能にした（設定ダイアログDOM/ヘッダ表示を更新）
  - React PoC の settings UI を `PoCSettingsSections`（basic/mic/character/startup）へ分割し、起動前設定（Talk/Inspector/VR）は「再起動が必要な場合あり」の注記を追加
  - React PoC 実装ファイルを `jsx/js` から `tsx/ts` へ移行し、PoC用の共通型（`panelTypes.ts`）を追加
  - React パネルのユーザー向け表示ラベルから `PoC` 色を弱め、設定を上段・診断情報（status/logs）を `Diagnostics` 折りたたみへ整理
  - `SincroAppController` 購読ロジックを `useSimpleVrmPanelState` hook に抽出し、`SimpleVrmControlPanel` を表示組み立て中心へ整理（別ページ展開の再利用基盤）
  - React パネル内の `PoC*` コンポーネント/型名を `PanelControls`, `Diagnostics*`, `*SettingsSection`, `Panel*` 型へ整理し、PoC 段階の内部命名を縮小
  - `vrm360/index.html` にも React mount point と `main-react.tsx` を追加し、`SimpleVrmControlPanel` を横展開（同一 hook 基盤を再利用）
  - `src/react/vrm360/Vrm360ControlPanel.tsx` を追加し、`vrm360` はページ名だけ切り替えた薄いラッパー経由で React パネルを利用（ページ別調整の拡張点を用意）
  - `src/react/chat/SincroChatView.tsx` を追加し、`simple-vrm` / `vrm360` / `looking-glass-vrm` の `#sincroChatBox` を React 描画へ切り替え開始
    - 既存 `sincroChatBox.css` の class 構造を再利用
    - React マウント時に `ChatMessageManager.setDomRenderingEnabled(false)` を呼び、二重描画を回避
    - system アイコン差し替え（VRMロード後の更新）も `system_icon_changed` イベントで反映
    - `ChatMessageManager` の view snapshot/event に `renderMode`（`text` / `trusted_html`）を引き継ぎ、React 側で表示方針を明示（移行期間は既存互換優先で HTML 描画）
  - `src/react/telop/SincroTelopView.tsx` を追加し、`#sincroFooterBox` のテロップ表示を React 描画へ切り替え開始
    - `TalkManager` に telop DOM描画ON/OFF と telop text segment snapshot を追加
    - React マウント時に `TalkManager.setTelopDomRenderingEnabled(false)` を呼び、二重描画を回避
  - `src/react/dialog/ConfigurationDialogSettingsPanel.tsx` を追加し、設定ダイアログの主要セクション（基本設定 + マイク設定）を React 表示へ先行置換
    - 既存 dialog の `talkModeSelector` / `titleText` / `details.advancedSettings` は CSS で非表示化し、`DialogManager` 用の橋渡しDOMとして保持
  - 設定ダイアログの Character/Gaze/AutoMute と VRMモデル選択導線（`vrmFileInput` の proxy ボタン）も React セクションへ追加し、既存DOMは橋渡し用に非表示化
  - `DialogManager` に React 置換補助API（`setReactPrimarySettingsEnabled(...)`, `openVrmFilePicker()`）を追加し、React 側の直接DOM操作を縮小
  - `DialogManager` に `DialogVrmUiState`（dragover / VRM状態テキスト）の購読を追加し、React dialog UI で VRM更新・D&D状態を表示可能にした
  - `DialogManager` に `DialogUiState`（dialog open/close, 開始ボタン disabled/text）の購読を追加し、React dialog UI で細部状態も表示可能にした
  - `PopManager` に dialog pop イベント購読 + dialog pop DOM描画ON/OFF を追加し、`DialogPopMessages` で設定ダイアログ内の通知（VRM更新成功/失敗など）を React 描画へ切り替え開始
  - `useConfigurationDialogSettingsState` を `useSimpleVrmPanelState` 依存から分離し、`SincroAppController.subscribeCurrent/subscribe` + `DialogManager.subscribeVrmUiState/subscribeDialogUiState` を直接購読する dialog 専用hook に整理
  - `subscribeActiveSincroAppController` ユーティリティを追加し、active controller 差し替え時の購読張り替え/解放ロジックを `useSimpleVrmPanelState` と dialog hook で共有化
  - `ConfigurationDialogSettingsPanel` の dialog 専用見た目を `configurationDialogSettings.css` へ分離し、`sincroConfigurationDialog.css` から React panel 専用スタイルを撤去
  - dialog 用設定セクションの adapter（`DialogSettingsFormSections`）を追加し、`ConfigurationDialogSettingsPanel` から `simple-vrm` 用共有コンポーネントへの依存を局所化
  - `DialogSettingsFormSections` の主要セクション（basic/mic/character）を dialog 専用実装へ置き換え、shared panel component 依存をさらに縮小
  - `SincroAppController` に dialog bridge API（`setDialogReactPrimarySettingsEnabled`, `openDialogVrmFilePicker`）を追加し、dialog hook の `DialogManager` 直接依存を縮小
  - `SincroAppController` に dialog pop bridge（`dialog_pop_message`, `setDialogPopDomRenderingEnabled(...)`）を追加し、`DialogPopMessages` の `PopManager` 直接依存を解消
  - React 設定型（`ApplySettingsFn`, `SincroAppSettings*`）を `src/react/app/appSettingsTypes.ts` に切り出し、dialog UI が `simple-vrm/panelTypes` に依存しない構成へ整理
  - 起動前 dialog の `はじめる` / `×` / `もどる` を `ConfigurationDialogSettingsPanel` 側へ移し、visible UI を React 主導に整理
  - `configurationDialog.html` の旧入力群を `configurationDialog__bridgeDom` に集約し、`reactPrimarySettingsEnabled` 時は bridge DOM をまとめて非表示化
  - `DialogManager` に dialog 外側クリック（背景クリック）での close を追加し、Debug Console に近い操作感へ寄せた
  - `DialogStateStore` を追加し、`DialogManager` の主要 getter/setter（talkMode/title/checkbox 群）を DOM 直読み中心から内部状態参照へ移行開始（bridge DOM は同期先として維持）
    - disabled 状態（`settings_ui_state` の元データ）も `DialogStateStore` に保持し、bridge DOM の hidden/縮退の影響を受けにくい構成へ移行開始
    - `DialogUiState`（open / startButtonDisabled / startButtonText）も `DialogStateStore` に集約し、dialog UI状態と設定状態の管理を同一ストアへ寄せ始めた
    - `DialogVrmUiState`（dragover / VRM状態テキスト）も `DialogStateStore` に集約し、dialog 状態管理の一本化をさらに前進
  - `DialogManager` を state-first 化し、`setTalkMode` / `setTitleText` / checkbox setter 群は bridge DOM 非依存でも `DialogStateStore` を更新する構成へ変更
  - `configurationDialog__bridgeDom` は `vrmFileInput` のみを残す最小構成へ縮退（visible 設定 UI は React 側が正式経路）
  - `DialogBridgeDomAdapter` を追加し、dialog 本体/close操作/VRM file input/ヘッダー文言の DOM 依存を `DialogManager` から切り出し開始
  - `SincroVRMInitializer` / `SincroInitializer` の旧 `#sincroStart` クリック配線を削除し、起動前 dialog の開始操作を React UI -> `SincroAppController.start()` の単一路へ統一
  - `DialogBridgeDomAdapter` / `DialogManager` から旧 start ボタン関連の DOM bridge を削除し、開始ボタン文言/disabled は `DialogStateStore.DialogUiState` を正本化
  - `DialogManager` の `talkMode/titleText` setter と Character/Gaze/AutoMute の disabled 更新ロジックを store 正本化し、設定値系の `document.querySelector(...)` fallback を削除
  - `rtcStop` ボタン配線は `DebugConsoleManager` へ責務移管し、`DialogManager` から `document.querySelector(...)` を解消（dialog 本体の DOM 依存は `DialogBridgeDomAdapter` に隔離）
  - `DialogVrmFileService` を追加し、VRMファイル/サムネイルの Cache Storage 永続化（保存・読込・削除）を `DialogManager` から分離
  - `DialogVrmWorkflowService` を追加し、VRMファイル選択時の検証/保存/初期復元フローを `DialogManager` から分離（`DialogManager` は UI状態更新/Pop通知中心へ）
  - `DialogNotificationService` を追加し、dialog 内通知（`PopManager.writeDialogPop*`）を `DialogManager` から分離して `PopManager.getManager()` 直接依存を縮退
  - `SincroAppController` に dialog bridge API（`updateUserMediaAvailabilityStatus`, `updateCharacterAvailabilityStatus`, `isCharacterEnabled/isVREnabled/isInspectorEnabled`, `load/saveVrmThumbnailBlob`）を追加し、initializer の `DialogManager` 直接依存をさらに縮退
  - `SincroVRMInitializer` / `SincroLegacy/SincroInitializer` から `DialogManager` import/field を削除し、dialog 関連の参照を `SincroAppController` bridge（設定参照/可否反映/thumbnail cache/close）へ統一
  - `DialogManager.vrmUrl` の static 状態を instance の `selectedVrmUrl` に置換し、`SincroAppController.getSelectedVrmUrl()` 経由で initializer / VRM360 初期化へ渡す構成に整理
  - `DialogStateStore` に selected VRM URL を集約し、`DialogManager` の状態責務（設定値/UI状態/VRM UI状態/選択中VRM）を store 側へさらに寄せた
  - `DialogSettingsPolicy` を追加し、settings UI state/hints 生成と Character/Gaze/AutoMute の有効/無効ポリシーを `DialogManager` から分離
  - `SincroAppController` に `dialogBridge`（`appController.dialog.*`）を追加し、React dialog hook / dialog pop / initializer の呼び出しを段階的に集約（既存メソッドは互換のため残置）
  - `useConfigurationDialogSettingsState` / `DialogPopMessages` / `SincroVRMInitializer` / `SincroLegacy/SincroInitializer` / `SincroVRM360Initializer` の主要 dialog 呼び出しを `appController.dialog.*` へ寄せ、呼び出し側の責務を明確化
  - `SincroAppController` に `chatBridge`（`appController.chat.*`）を追加し、initializer の挨拶メッセージ出力・system icon 更新を `ChatMessageManager` 直接依存から段階的に移行
  - `SincroAppController` に `debugBridge`（`appController.debug.*`）を追加し、initializer の `RTC Stop` ボタン配線を `DebugConsoleManager` 直接依存から移行
  - `SincroAppController` の `dialogBridge` / `chatBridge` / `debugBridge` を通じて、initializer / React dialog hook / dialog pop の UI操作依存を段階的に集約（manager 直接依存の縮退を継続）
  - `SincroAppController` に `rtcBridge`（`appController.rtc.*`）を追加し、initializer の停止操作配線も bridge 群へ揃えて API を統一方向に整理
  - `DialogManager` の設定DOM同期系メソッド（bridge input 前提の change/input 監視など）を削除し、React dialog + state store + adapter の構成へ整理
  - `configurationDialog__bridgeDom` を最小 input/select/button/file 群に縮退し、ラベル/fieldset/戻るリンク等の可視UI要素は React 側へ寄せた
  - Debug Menu に `Open Startup Dialog` を追加し、`sincro:open-configuration-dialog` -> `SincroAppController.openConfigurationDialog()` 経由で起動前 dialog の再表示導線を追加
  - `main-react.tsx`（`simple-vrm` / `vrm360` / `looking-glass-vrm`）を動的 import 化し、Control Panel / Chat / Telop / Dialog UI を個別 chunk として分割
  - `vite.config.js`（modern-only build）に `manualChunks` を追加し、`react`, `three`, `three-vrm`, `mediapipe/onnxruntime`, `@lookingglass/webxr`, その他 vendor の分離を開始
  - `manualChunks` を追加調整し、`three/examples`, `three-vrm-animation`, `@mediapipe/*`, `onnxruntime-web` を分離（`vendor_three_examples`, `vendor_vrm_animation`, `vendor_mediapipe`, `vendor_onnxruntime`）
  - React チャットで `renderMode`（`text` / `trusted_html`）を `ChatMessageManager` の view snapshot/event から受け取りつつ、HTML描画許可を `system` / `reset` のみに制限（移行期の安全方針を明示）
  - VRM1.0 Looking Glass 専用の modern ページ `looking-glass-vrm/` を追加（`src/looking-glass-vrm/index.html`, `src/looking-glass-vrm/main-react.tsx`）
    - `main-vrm360.ts` を再利用して VRM360 + Looking Glass 起動ボタン連携を利用
    - `LookingGlassVrmControlPanel` で専用見出しを表示
  - Babylon-free Looking Glass 入口の初版として `src/ts/SincroVRM/LookingGlass/LookingGlassXRController.ts` を追加
    - `@lookingglass/webxr` polyfill 初期化 + `button#startLookingGlass` 連携 + Three.js `renderer.xr` セッション開始
    - `VRM360Scene.enableLookingGlassStartButton()` から有効化し、`SincroVRM360Initializer` で接続
  - `LookingGlassXRController` の状態を `window` カスタムイベント（`sincro:looking-glass-state`）で通知し、`SincroAppController` の `looking_glass_state` イベントとして React UI へ橋渡し
    - エラー時は `code`（`button_not_found` / `webxr_unavailable` / `session_start_failed` / `polyfill_init_failed`）を付与して表示・切り分けを容易化
    - 再試行/復帰待ち用に `recovering` 状態を追加（エラー後リトライ開始時、セッション終了後の再試行可能状態）
  - React パネル（`SimpleVrmControlPanel` / `Vrm360ControlPanel`）で Looking Glass 状態を上段表示および Diagnostics card に表示
  - React 設定パネルは常時表示をやめ、`sincroBody` の Debug Menu (`Open Settings Panel`) から開くモーダル式に変更
    - `DebugConsoleManager` が開閉を管理し、閉じる操作は右上Xボタンとメニュー外/パネル外クリックで統一
  - `LookingGlassVrmControlPanel` では `SimpleVrmControlPanel` の `variant="looking-glass-vrm"` を使い、Looking Glass 操作案内を上段に表示し、未サポート startup 設定が全件の時は startup セクション自体を省略
  - `LookingGlassRuntimeConfig`（VRM1.0 側 runtime config）を追加し、`SincroAppController.getSettingsSnapshot()/applySettings(...)` から Looking Glass パラメータを読み書きできるようにした
    - 現在対応: `lgTileHeight`, `lgNumViews`, `lgTargetY`, `lgDepthiness`, `lgFovyDeg`
    - `LookingGlassXRController` は polyfill 初期化時に runtime config を参照
    - `SincroAppController.applySettings(...)` 側で LG 設定の範囲丸め/step丸めを実施（入力揺れや範囲外値を吸収）
  - `LookingGlassRuntimeConfig` 更新時に `sincro:looking-glass-config-updated` イベントを発火し、`SincroAppController` が `looking_glass_config_status`（`pendingForNextSession`, `reloadRecommended`, `changedKeys`, `reloadRecommendedKeys`, `nextSessionKeys`）を React UI へ通知
    - `LookingGlassXRController` は config 更新イベントを監視し、非アクティブ時は次回開始に向けて polyfill 再初期化フラグを立てる（`sincro:looking-glass-polyfill-reinit-ready`）
    - 実行中セッション中の変更のみ `reloadRecommended` として扱い、セッション終了後は `nextSession` 扱いへ戻す
  - `looking-glass-vrm` の React UI に `looking glass settings` セクションを追加（次回セッション開始時に反映）
    - `looking-glass-vrm` では通常の `mic settings` / `character settings` を advanced 折りたたみに移して、LG設定を前面化
    - LG設定変更ステータスは項目別に「Reload recommended」「Next session」を表示
    - `talkMode` は `sincro` / `chat` 両ユースケース想定のため表示維持、`titleText` は `looking-glass-vrm` では非表示（必要性が低いため）
    - LG設定プリセット（`Default` / `Portrait` / `Wide`）を追加して実機調整を高速化
  - legacy `glass` / `character-glass` ページに `looking-glass-vrm` への移行案内バナーを追加
  - `TalkManager` に購読フックを追加し、`SincroAppController.subscribe(...)` へ `telop_message` を接続
  - React PoC パネルで `text/chat` 系ログと `telop` を別枠表示
  - React PoC パネルを `controls / status cards / logs` にコンポーネント分割（PoC段階の保守性改善）
  - `SincroVRMInitializer` / `SincroInitializer` は `SincroAppController` を先行生成し、Start時UI副作用を `setStartHooks(...)` で登録
    - React PoC の Start/Stop を `SincroAppController` 直操作に統一可能な構成へ移行

- 未実装（Phase 1 継続）
  - `connection_state` の文言/状態遷移を実運用向けに整理（再接続・初回待機の表現調整）
  - React UI での telop / 詳細チャット表示の整形改善（現在はPoCログ）
  - React PoC パネルの見た目調整（PoC inline style からCSS/テーマ変数化するか判断）
  - 起動前設定トグルの実反映タイミングを `SincroAppController` / initializer で明確化（現状は再起動推奨表示まで）
  - `vrm360` 向け React パネルの設定項目をページ特性に合わせて調整（現状は `Vrm360ControlPanel` で見出しのみ差し替え）
  - `looking-glass-vrm` 向けに、設定項目の追加整理（例: LG専用設定群の新設）を行う
  - Looking Glass 設定の適用タイミングの厳密化（polyfill 再初期化を含む挙動の実機検証と、必要なら再初期化失敗時のフォールバック設計）
  - Looking Glass + VRM1.0 の描画/UX 実装を `LookingGlassXRController` 初版から拡張（VRM360専用設定、復帰動線、エラー種別表示）

## 8. 設定・デプロイ

- 環境変数:
  - 原則変更なし（サーバー配布 `config.json` を継続利用）
- 設定ファイル:
  - `sincromisor-frontend/vite.config.js`（React plugin 追加、MPA は維持）
  - `sincromisor-frontend/tsconfig.modern.json`（default build 用。legacy/Babylon 系ソースを除外）
- 導入状況（2026-02-22 時点）:
  - `react` / `react-dom` は導入済み（`^19.2.4`）
  - `@vitejs/plugin-react-swc` は導入済み（`^4.2.3`）
- 起動方法:
  - `cd sincromisor-frontend && npm run dev`
- デプロイ/ローカル実行手順:
  - 通常確認（VRM1.0/React 優先）: `npm run build`（modern-only build）
  - `npm run build` は `tsc -p tsconfig.modern.json && vite build` を実行し、modern / experimental の 4 ページを基準に確認する
  - legacy/Babylon 含む確認が必要なときのみ: `npm run build:all`
  - `npm run build:all` は `tsc && SINCRO_BUILD_LEGACY=1 vite build` を実行し、legacy / deprecated ページも含めた回帰確認に使う
  - React 導入後は移行対象ページ（`simple-vrm`, `vrm360`, `looking-glass-vrm`）を優先確認する
  - `looking-glass-vrm` は当面 Experimental 導線として扱い、未動作環境がある前提で案内文を維持する
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

## 14. Looking Glass 実機確認前チェックリスト（最小）

- `npm run build` が成功している
- `index.html` から `looking-glass-vrm/` に遷移できる
- `looking-glass-vrm` で `Control Panel` が開ける（Debug Menu -> `Open Settings Panel`）
- `Control Panel` で `トークモード (talk mode)` と Looking Glass 設定の変更が反映される（`settings_snapshot` 更新）
- `Control Panel` 上段の Looking Glass 状態表示が更新される（未接続環境でも `idle/error` などの表示遷移を確認）
- `Diagnostics` 内で `LGコード` / `LG詳細` が表示できる（エラー時の確認先が機能する）
- `Debug Console` から `Start Looking Glass` ボタンが見える/押下できる（実機なし環境では失敗してもよい）
- `looking_glass_config_status` の文言（次回セッション反映 / 再読み込み推奨）が設定変更時に表示される

## 15. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-22 | 初版作成（React段階移行、Babylon切り離し、Looking Glass VRM1.0対応方針） |
| 2026-02-22 | フェーズ別実施手順（Phase 0-4）、初期タスク分解、設計判断ルールを追加 |
| 2026-02-22 | `SincroController` 分割案、UIイベント境界、Phase 0 完了判定を追加 |
| 2026-02-22 | `SincroController` の UI manager 呼び出し一覧を追加、React/ReactDOM `^19.2.4` 導入状況を反映 |
| 2026-02-22 | dialog 内部の責務分離を進行（`DialogEventHub` / `Dialog*Service` / `DialogSettingsPolicy` / `DialogBridgeDomAdapter` / `DialogStateStore` 集約）、`SincroAppController` の `dialog/chat/debug/rtc` bridge API と `SincroAppBridges.ts` 分離を反映 |
| 2026-02-22 | `SincroAppTypes.ts` を追加して `SincroAppController` から型/イベント定義を分離。React 側は `DialogManager` 直接依存なし（`appController.dialog` 経由）を確認 |
| 2026-02-22 | `SincroAppEventMappers.ts` を追加して managerイベント→`SincroAppEvent` 変換を分離。`SincroAppController` constructor の購読処理を `bindManagerSubscriptions()` へ整理 |
| 2026-02-22 | `SincroAppLookingGlassStateTracker.ts` を追加し、Looking Glass 状態/設定変更差分の追跡と `looking_glass_config_status` 判定を `SincroAppController` から分離 |
| 2026-02-22 | `SincroAppConnectionState.ts`（接続状態判定）、`SincroAppSettingsApply.ts`（`applySettings` 実処理）、`SincroAppBridgeFactories.ts`（dialog/chat/debug/rtc bridge実装）を追加し、`SincroAppController` を orchestration 中心に整理 |
| 2026-02-22 | `SincroAppStartupSettings.ts`（startup設定の再起動/次回起動判定）と `SincroAppSubscriptionSnapshot.ts`（購読直後の初期イベント送出）を追加し、`SincroAppController.subscribe()` / `getStartupSettingsStatus()` を薄く整理 |
| 2026-02-22 | `SincroAppSettingsSnapshotBuilder.ts`（settings snapshot 合成）と `SincroAppWindowEventBinder.ts`（window event 登録）を追加。未使用の `SincroAppController` 互換 wrapper メソッド群を整理し、`appController.dialog/*` などの bridge API 利用を前提に整理 |
| 2026-02-22 | `SincroAppUiStateSnapshotBuilder.ts` を追加し、Dialog由来UI状態（settings ui/dialog ui/vrm ui）の取得を helper 化。`bindManagerSubscriptions()` を chat/debug/talk/pop/dialog ごとに分割して `SincroAppController` の可読性を改善 |
| 2026-02-22 | `SincroAppEventHub.ts`（AppEvent listener管理）と `SincroAppControllerRuntime.ts`（manager bundle/bridge bundle 生成）を追加し、`SincroAppController` の constructor 初期化と emit 周辺を整理。UI状態 getter 群は `getUiStateSnapshot()` 経由に統一 |
| 2026-02-22 | `SincroAppActiveControllerRegistry.ts`（static active controller 管理）と `SincroAppLookingGlassEventFlow.ts`（LG window event 処理手順）を追加。`SincroAppController` の static 管理と LG handler 本文を短縮し、public API をセクションコメントで整理 |
| 2026-02-22 | `SincroAppDialogFacade.ts` で Dialog 境界型を明文化。`SincroAppEmitHelpers.ts` を追加して lifecycle/settings snapshot の emit 手順を helper 化。React 側は `subscribeActiveSincroAppEvents.ts` を追加して active controller + event購読の定型配線を共通化 |
| 2026-02-22 | `SincroAppDebugSubscriptionFlow.ts` を追加して debug購読の RTC state / connection state 更新手順を helper 化。`SincroAppController` に `state` bridge（snapshot getter 群の grouping）を追加し、React `useSimpleVrmPanelState` はイベント処理を handler map 化して if 連鎖を整理 |
| 2026-02-22 | `useConfigurationDialogSettingsState` も handler map 化し、`appController.state` から初期 snapshot / controller差し替え時 snapshot を取得する構成へ整理。`SincroAppController.bind*Subscriptions()` には emit順序意図のコメントを補強 |
| 2026-02-22 | `sincroAppStateSnapshotHydrators.ts` を追加して React hook 間の snapshot 反映（settings/dialog/startup status）を共通化。`SincroAppManagerSubscriptionBinder.ts` を追加して AppController の manager購読本文（chat/debug/talk/pop/dialog）を helper 化 |
| 2026-02-22 | `SincroAppManagerSubscriptionFacades.ts` を追加して manager購読binderの依存を facade 型へ寄せた。React 側は `panelLogHelpers.ts` で chat/system/error ログ追加処理を共通化。`SincroAppController` constructor は `initializeRuntime()` に分割して初期化の読み順を改善 |
| 2026-02-22 | `SincroAppControllerRuntime.ts` に `SincroAppControllerRuntimeBundle` 型を追加し、`initializeRuntime()` の返却型を明示。`panelLogHelpers.ts` の汎用 `prependCappedItem()` を `DialogPopMessages.tsx` に展開し、dialog pop 一覧の更新処理も共通化。`SincroAppManagerSubscriptionBinder.ts` の debug購読に emit順序意図コメントを補強 |
| 2026-02-22 | `dialogPopAnimationHelpers.ts` を追加して dialog pop の show/hide/remove タイマー処理を `DialogPopMessages.tsx` から分離。`SincroAppLookingGlassEventFlow.ts` に flow 用 params 型/ラッパーを追加して LG event handler 境界を明確化。`SincroAppController.initializeRuntime()` は `createSincroAppRuntimeBundle(...)` へ委譲して runtime bundle（manager + bridge + stateBridge）組み立てを `SincroAppControllerRuntime.ts` に集約 |
| 2026-02-22 | `DialogPopMessages.tsx` に dialog pop タイマー cleanup（unmount / active controller 切替時）を追加し、pending timer を `useRef` で管理して安全性を改善。`SincroAppLookingGlassEventFlow.ts` は `*Detail` 公開より `*Flow` 公開中心へ整理。`SincroAppController` の `setStartupSettingsCapabilities()` は state/capability 系の近くへ移動して public API の読み順を改善 |
| 2026-02-22 | `useDialogPopTimers.ts` を追加し、`DialogPopMessages.tsx` の pending timer 管理（登録/一括cleanup）を custom hook 化。`SincroAppLookingGlassEventFlow.ts` の `emitLookingGlassConfigStatus(...)` は flow context 型ベース引数へ統一。`SincroAppController` の private method 並びは event handler 群→初期化/bind 群→state helper 群の読み順を意識して整理を継続 |
| 2026-02-22 | `dialogPopAnimationHelpers.ts` に dialog pop timing 定数（show delay / hide transition）を導入し、`DialogPopMessages.tsx` の cleanup 余裕時間計算でも再利用。`SincroAppEmitHelpers.ts` に `emitSincroAppConnectionState(...)` を追加し、AppController の派生接続状態通知を helper 経由へ統一。`SincroAppLookingGlassEventFlow.ts` には `active` 時の config status 二重通知の意図（表示収束のための保守的通知）をコメントで明記 |
| 2026-02-22 | `DialogPopMessages.tsx` の表示件数 `3` を `dialogPopAnimationHelpers.ts` の `DIALOG_POP_TIMING.renderLimit` に集約。`SincroAppEmitHelpers.ts` に `emitSincroAppSettingsApplyEvents(...)` を追加し、`applySettings(...)` 後の settings/UI/startup/LG config 通知を helper 化。`SincroAppController` は `buildSettingsRelatedSnapshotPayload()` を追加して `emitSettingsRelatedSnapshots()` と `applySettings()` の payload 組み立て重複を削減 |
| 2026-02-22 | `SincroAppSettingsRelatedSnapshotBuilder.ts` を追加し、settings関連 payload（settings/uiState/uiHints/startupStatus）の組み立てを AppController から helper へ外出し。`DialogManager` は `updateCharacterStatus()` / `updateUserMediaAvailabilityStatus()` 内で `updateEnableCharacterGazeStatus()` / `updateAutoMuteStatus()` の中間通知を抑止して `settingsChange` の重複発火を削減。React 側の表示件数/タイミング定数は `react/app/uiTuning.ts` に集約を開始（chat/telop/rtc event log / dialog pop） |
| 2026-02-22 | `DialogEventHub` に current dialog/VRM UI state を getter から通知するヘルパを追加し、`DialogManager` の UI state emit を薄く整理。`SincroAppController.applySettings()` は `getSettingsSnapshot()` の結果を settings関連 payload builder に再利用して重複 snapshot 生成を削減。`UI_TUNING.controlPanel.diagnostics` を追加し、Diagnostics status/log セクションの gap・spacing・message log 高さなどの表示値を定数化して適用範囲を拡張 |
| 2026-02-22 | `DialogManager` の `setVrmStatusText()` / `setDialogStartButtonState()` に同値更新ガードを追加し、drag&drop/状態更新時の不要な UI state 通知を抑止。`SincroAppController` は settings関連 payload の短命キャッシュ（同期処理内のみ有効）を導入して `applySettings()` / `emitSettingsRelatedSnapshots()` 内の重複組み立てを抑制。`UI_TUNING.controlPanel` を拡張し、Control Panel 本体の section spacing / details 内余白も定数化して `SimpleVrmControlPanel.tsx` に適用 |
| 2026-02-22 | `SincroAppController.subscribe()` の初期スナップショット送出も settings関連 payload の短命キャッシュを利用するよう整理し、初回購読時の重複 snapshot 組み立てを削減。`DialogManager` の dialog open/close・VRM dragover/status・start button 状態更新には通知順序意図のコメントを補強。`SettingsSections.tsx` 側にも `UI_TUNING.controlPanel` を展開し、basic/mic/character/startup/LG 設定セクションの spacing を定数化 |
| 2026-02-22 | `UI_TUNING.controlPanel.settings`（help badge/tooltip/spacing 系）を追加し、`SettingsSections.tsx` の tooltip 表示位置・help badge サイズ・help label margin・各設定セクションの gap/margin に適用。`SincroAppController.start()` は起動時 snapshot を `emitLifecycle(\"starting\")` と startup settings 保存で再利用し、初期状態計算の重複を小さく削減 |
| 2026-04-22 | `SincroChatView` / `SincroTelopView` の direct manager 依存を整理し、React 側は active `SincroAppController` 経由で chat/telop を購読する構成へ移行。`SincroAppController` の `chat` / `state` bridge を拡張し、`chat_system_icon` event、chat view snapshot、telop snapshot、旧 DOM 描画停止操作を React から singleton 直参照せず扱えるようにした |
| 2026-02-22 | `UI_TUNING.controlPanel.styles` を追加し、`panelStyles.ts` の root/button/miniCard/miniLog の border radius / padding / font size / maxHeight を定数化。Control Panel の見た目調整点を `UI_TUNING` にさらに集約。`looking-glass-vrm` 向けの Control Panel 案内文（LGエラー時の誘導/再読込文言）も日本語表現を微調整 |
| 2026-02-22 | `UI_TUNING.controlPanel.styles` を拡張し、Control Panel 操作ボタン間隔・Diagnostics カード間隔・section title 余白も定数化。`PanelControls.tsx` と `DiagnosticsStatusCards.tsx` / `DiagnosticsLogSections.tsx` に適用し、`Start/Stop` や `recent messages` 等の表示を日本語寄り（開始/停止、最近の〜、メッセージ未着など）へ調整 |
| 2026-02-22 | `Control Panel` / `Diagnostics` の残り文言を日本語寄りに調整（`トークモード (talk mode)`、`診断情報`、`LGコード` / `LG詳細`、`Signaling状態` など）。Looking Glass 実機確認前の最小チェックリストを追加 |
| 2026-02-22 | `UI_TUNING.controlPanel.styles` / `UI_TUNING.controlPanel.settings` を追加拡張し、Control Panel 本体・Diagnostics・Settings 各セクションの spacing / tooltip / help badge 調整値を集約。`looking-glass-vrm` の LG エラー時案内文を日本語表現で微調整し、確認先（`LGコード` / `LG詳細`）を明示 |
| 2026-02-22 | `VRM360/SphereVideo.ts` の `hls.js` 読み込みを静的 import から `import(\"hls.js\")` の遅延読み込みへ変更し、VRM360 動画再生時以外の初期バンドル肥大化を抑制。`vite.config.js` の `manualChunks` も追加分割（`vendor_three_renderers` / `vendor_hls` / `vendor_yaml`）し、`vendor_misc` を縮小。`vendor_hls` は 500kB 超だが遅延読み込み chunk として分離 |
| 2026-02-22 | `looking-glass-vrm` 向けの文言をさらに日本語寄りに調整（`VRM360 設定パネル` / `Looking Glass VRM1.0 設定パネル` 等）。ピンボケ調整向けに Looking Glass 設定へ `Target Z` / `Target Diam` を追加し、`LookingGlassRuntimeConfig` / `SincroAppSettingsSnapshot` / `applySettings(...)` / `LookingGlassXRController` の polyfill オプションへ反映。実機調整用に `焦点調整用 (Focus)` プリセットも追加 |
| 2026-02-22 | `vendor_three_renderers` 分割は実行時に `Cannot access 'Je' before initialization`（three 内部初期化順）を誘発したため撤回。安定性優先で `three` 本体は単一 chunk に戻し、`hls.js` 遅延読み込み・`vendor_hls` 分離を継続 |
| 2026-02-22 | Looking Glass 実機で初回 `Start Looking Glass` のみ失敗する polyfill 制約（`isSessionSupported()` / `inline` session 事前呼び出し要求）に対処。`LookingGlassXRController` に初回ウォームアップ（`navigator.xr.isSessionSupported(\"immersive-vr\")`）を追加し、初回 `immersive-vr` セッション要求前に実行するよう更新 |
| 2026-02-22 | Looking Glass セッション終了時に polyfill の再初期化可能状態（polyfill initialized / warmup state）へ戻す処理を追加し、セッション中に変更した LG 設定をページ再読み込みなしで「終了後の再実行」で反映できるよう改善。Control Panel の案内文も「再読み込み推奨」から「セッション終了後に再実行」寄りに更新 |
| 2026-02-22 | `looking-glass-vrm` の Control Panel に `Looking Glass 開始` / `Looking Glass 停止` ボタンを追加。`LookingGlassXRController` は Debug Console ボタンに加えて window custom event（start/stop request）からも起動/停止できるようにし、`XRSession.end()` による停止機能を実装 |
| 2026-02-22 | `Start Looking Glass` ボタンを Debug Console から削除し、`looking-glass-vrm` の実行導線を Control Panel に一本化。`LookingGlassXRController.attachToStartButton()` は Debug Console ボタン未配置を正常系として扱うよう変更し、Control Panel の custom event 操作のみでも error 状態にならないよう調整 |
| 2026-02-22 | 右上 Debug メニューの `Open Startup Dialog` を削除（現行構成では利用価値が低く誤操作導線になりやすいため）。起動前設定の React dialog UI は枠線/背景/ヘッダー/開始ボタンの見た目を調整し、Control Panel / Debug Console とトーンを揃える方向で更新 |
| 2026-02-22 | 起動前設定の Character / Gaze の既定値を見直し、通常ページでは `Character=ON` / `Gaze=ON` を初期値に変更。`VRM360`（360deg camera）では `SincroVRM360Initializer` で `enableCharacterGaze=false` を明示適用し、Gaze は既定OFF・Character は既定ONを維持 |

## 16. 参照資料

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
