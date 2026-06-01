# TASK-2000 デバイス選択設定モデル追加

- 作成日: 2026-04-19
- ステータス: Done
- 優先度: High

## 目的

マイク入力デバイスと視線検出用カメラの選択状態を、起動前設定と設定パネルで共通に扱えるようにする。

## 関連設計

- `documents/design/frontend_ui.md`

## スコープ

- `audioInputDeviceId` / `videoInputDeviceId` を settings の正式な一部として追加
- Dialog / AppController / React settings snapshot の型拡張
- 設定適用経路の拡張
- UI state / hint でデバイス未解決や無効選択を扱える余地の整理

## 非対象

- 実際の `enumerateDevices()` 呼び出し
- `getUserMedia` 制約への反映
- デバッグコンソールのプレビュー改善

## 実装タスク

1. `SincroAppSettingsSnapshot` に `audioInputDeviceId` / `videoInputDeviceId` を追加する。
2. `DialogStateStore` に対応する state を追加し、getter / setter を整備する。
3. `DialogManager` と `SincroAppDialogFacade` に公開 API を追加する。
4. `SincroAppSettingsSnapshotBuilder` と `SincroAppSettingsApply` に新項目を通す。
5. React 側の `ApplySettingsFn` 利用箇所で新項目を扱えるようにする。
6. 必要に応じて `settings_ui_hints` にデバイス関連メッセージを拡張できる形に整理する。

## 想定変更箇所

- `sincromisor-frontend/src/ts/App/SincroAppTypes.ts`
- `sincromisor-frontend/src/ts/UI/DialogStateStore.ts`
- `sincromisor-frontend/src/ts/UI/DialogManager.ts`
- `sincromisor-frontend/src/ts/App/SincroAppDialogFacade.ts`
- `sincromisor-frontend/src/ts/App/SincroAppSettingsSnapshotBuilder.ts`
- `sincromisor-frontend/src/ts/App/SincroAppSettingsApply.ts`
- `sincromisor-frontend/src/react/app/appSettingsTypes.ts`

## 完了条件

- デバイス選択状態が settings snapshot に含まれる。
- 起動前設定と設定パネルで同じ設定キーを共有できる。
- 新規項目追加によって既存設定適用が壊れない。

## 確認

- `settings_snapshot` に新項目が流れることを確認する。
- React 設定 UI から `applySettings(...)` で新項目が反映できることを確認する。
