# TASK-2003 設定パネルへのデバイス選択追加

- 作成日: 2026-04-19
- ステータス: Open
- 優先度: High

## 目的

運用中の正式な設定経路として設定パネルからもデバイス選択を行えるようにし、起動前設定との整合を取る。

## 関連設計

- `documents/design/frontend_ui.md`

## スコープ

- `SimpleVrmControlPanel` 系 settings UI への selector 追加
- 起動前設定と同一 settings snapshot / applySettings の利用
- 設定パネルでの軽量な選択状態表示
- Gaze カメラ用途であることが伝わる文言整備

## 非対象

- 実行中のトラック再取得そのもの
- audio monitor / face preview の実装詳細変更

## 実装タスク

1. 設定パネルのマイク設定セクションにマイク selector を追加する。
2. キャラクター設定または専用セクションに視線検出用カメラ selector を追加する。
3. `useSimpleVrmPanelState` 側でデバイス一覧を購読する。
4. 起動前設定と同じ設定キーで値を読み書きする。
5. selector の説明文を「正式な設定経路」として分かる内容へ整える。

## 想定変更箇所

- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/react/simple-vrm/useSimpleVrmPanelState.ts`
- `sincromisor-frontend/src/react/simple-vrm/SimpleVrmControlPanel.tsx`
- `sincromisor-frontend/src/react/vrm360/Vrm360ControlPanel.tsx`
- `sincromisor-frontend/src/react/looking-glass-vrm/LookingGlassVrmControlPanel.tsx`

## 完了条件

- 設定パネルからマイクとカメラの選択変更ができる。
- 起動前設定と設定パネルで選択状態が一致する。
- UI 上で用途が誤解されにくい。

## 確認

- 起動前設定で変更した内容が設定パネルにも反映されることを確認する。
- 設定パネルで変更した内容が再度開いた起動前設定にも反映されることを確認する。
