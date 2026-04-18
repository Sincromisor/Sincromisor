# TASK-2002 起動前設定ダイアログへのデバイス選択追加

- 作成日: 2026-04-19
- ステータス: Open
- 優先度: High

## 目的

起動前設定ダイアログから、利用するマイク入力デバイスと視線検出用カメラを明示選択できるようにする。

## 関連設計

- `documents/design/frontend_ui.md`

## スコープ

- `ConfigurationDialogSettingsPanel` への device selector UI 追加
- 起動前設定用 hook へのデバイス一覧接続
- 選択状態と settings snapshot の同期
- 選択中デバイスが無効な場合の案内表示

## 非対象

- 実行中のトラック差し替え
- Debug Console の selector 追加

## 実装タスク

1. 起動前設定 UI にマイク入力 selector を追加する。
2. 起動前設定 UI に視線検出用カメラ selector を追加する。
3. デバイス一覧取得 hook を接続する。
4. 選択変更で `applySettings(...)` が呼ばれるようにする。
5. 無効な deviceId が残っている場合のヒント表示を追加する。
6. Start ボタン周辺の文言と導線が破綻しないことを確認する。

## 想定変更箇所

- `sincromisor-frontend/src/react/dialog/ConfigurationDialogSettingsPanel.tsx`
- `sincromisor-frontend/src/react/dialog/useConfigurationDialogSettingsState.ts`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- `sincromisor-frontend/src/react/dialog/configurationDialogSettings.css`

## 完了条件

- 起動前設定ダイアログでマイクとカメラを選択できる。
- 選択値が settings snapshot に反映される。
- デバイス未接続や無効選択が UI 上で分かる。

## 確認

- ダイアログで選んだデバイスが state に反映されることを確認する。
- 既定ブラウザ設定とは別のデバイスを選択できることを確認する。
