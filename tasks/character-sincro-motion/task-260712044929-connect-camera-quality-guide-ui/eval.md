# Evaluation: task-260712044929-connect-camera-quality-guide-ui

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `SincroAppEvent` に `camera-quality-changed`（`CameraQualityScore` / `observedAtMs`）と payload なしの `camera-quality-reset` が追加されている。
- [✓] production Pose / fallback callback は `SincroCameraQualityRuntime` の結果を event hub へ発火する。`timing.receivedAtPerformanceMs` がある場合はその値を `observedAtMs` として引き継ぐ。
- [✓] camera refresh / stop、talk mode を含む gaze settings 変更、tracking stop / runtime error、controller clear で reset が発火または panel state が直接初期化され、stale message を破棄する。
- [✓] panel handler が保持する camera guide は `PanelCameraGuideState` のみで、raw score / reason code を保持しない。
- [✓] `CameraQualityGuideCard` は connection status 内の diagnostics grid 直前に配置され、先頭 guide text 一件だけを描画する。score / component / reason code は props と markup に露出しない。
- [✓] `good` / message なし / reset は即時非表示になる。
- [✓] reducer は `observedAtMs` だけを clock とする。初回 bad 即時、初回 warn 500 ms、表示中 1,000 ms hold と候補 500 ms の AND 条件、同 status 別 message / bad 同士の切替、時刻逆行時の候補破棄と表示維持を実コードで確認した。
- [✓] hold と candidate の競合は、candidate を hold 中にも蓄積し、両条件を満たした最初の観測 event でのみ切り替える。現在表示と同一の status / message が再来した場合は競合 candidate を破棄する。
- [✓] reset reducer は guide state だけを初期化する。production owner の `resetObserveOnlyPipeline()` は従来の observe-only pipeline / debug summary reset に camera quality reset を同居させるが、既存の retarget 表示・VRM 適用済み姿勢を変更しない契約コメントと一致する。
- [✓] good / warn / bad、message 切替、reset、chat mode の component/state tests が追加されている。attempt 2 では、visible state を作った実 panel handler に `camera-quality-reset` を入力して非表示を検証する test と、`sincro` → `chat` の実 settings diff を production owner / emitter に通して reset event を検証する test が追加された。
- [✓] `tracking.md` と `app-shell.md` は表示条件、抑制規則、reset lifecycle と同期している。
- [✓] TypeScript production comment audit は指定列を持ち、event clock、Pose / reset lifecycle、state boundary、hysteresis、public component contract を実コードと照合できる。attempt 2 の抽出 owner には camera source 境界と Pose tuning 除外理由を説明する契約コメントがある。

## 前回 FAIL の解消確認

- panel reset: `createSimpleVrmPanelRuntimeEventHandlers()` の実 `camera-quality-changed` handler で bad guide を表示した後、実 `camera-quality-reset` handler で state が消えることを確認している。handler 配線を壊すと test が失敗する。
- chat mode reset: `compareDialogGazeSettings()` で `sincro` → `chat` の差分を生成し、controller が利用する `resetSincroMotionForGazeSettingsChanges()` と sink が利用する `emitCameraQualityReset()` を通して event を検証している。production controller / sink も同じ抽出関数を呼ぶため、対象条件と event 契約の回帰を検出できる。
- 抽出による実装変更は既存条件分岐と event 発火の名前付き境界化に限定され、reset の対象や副作用を拡張していない。

## テスト結果

- `npm run gate`（評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-ffe36ffa5fef-bHWbgN`、commit `ffe36ffa5fef8556e16f8e6de1a4de00c2803c0b`、clean）: PASS。
- gate 内訳: `gate:lint` CACHE HIT PASS、`gate:build` CACHE HIT PASS、`gate:test` CACHE HIT PASS（506 passed / 2 skipped）。
- カバレッジ評価: observedAtMs clock、candidate / hold、逆行、guide markup、panel reset handler、sincro → chat production reset owner の主要受け入れ分岐は十分に覆われている。独立 acceptance test の追加は不要と判断した。

## ドキュメント整合性

- `documents/design/frontend/character/tracking.md` は表示対象、observed clock、hysteresis、mode / camera / runtime reset を記載しており実装と一致する。
- `documents/design/frontend/app-shell.md` は diagnostics grid 直前への一件表示と controller clear を含む抑制条件を記載しており実装と一致する。
- backend / WebRTC / compose / env 契約変更はない。

## 残課題（FAIL の場合）

- なし。

## その他所見

- 実カメラでの目視確認は未実施だが、本タスクの deterministic な UI state / lifecycle 契約は unit / state test と build で検証されており、PASS を妨げない。
