# TASK-260525010934 debug settings control primitives commonization

- 作成日: 2026-05-25
- ステータス: Done
- 優先度: Medium
- 関連: `TASK-3047`

## 目的

Debug console の range / checkbox / preset button 群と settings UI primitives の重複を整理し、調整項目が増えても panel component が肥大しにくい構造にする。

## 背景

- `features/settings/react/primitives/settingsFieldControls.tsx` に `SettingsRange` がある一方、debug 側には `features/debug/react/components/rangeControl.tsx` が別実装として存在する。
- `sincroPoseRetargetControls.tsx`、`gazeTuningControls.tsx`、`audioPanelLearnedVadTuning.tsx` では range control が多数手書きされている。
- `audioPanelVadControls.tsx` と `audioPanelAdvancedControls.tsx` には checkbox label の手書きが残っている。
- debug panel は今後も調整値が増えやすいため、配列定義から描画できる形にすると肥大を抑えやすい。

## 方針

- 見た目を settings UI と完全同一にする必要はないが、低レベルの labeled range / checkbox / preset button の責務を共通化する。
- debug 固有の className / density は props で渡せるようにする。
- まずは debug 側の repeated JSX を減らし、設定 UI 全体への影響を小さくする。
- settings primitives を直接広げるより、まず debug 専用 adapter を残して置き換える方針を優先する。
- 数値の丸め・clamp は既存 manager 側の責務を変えない。

## スコープ

- `RangeControl` と `SettingsRange` の責務比較
- 汎用 `LabeledRange` / `LabeledCheckbox` / `PresetButtonGroup` の追加検討
- pose retarget / gaze tuning / audio VAD tuning の range 定義配列化
- debug panel 内 checkbox の共通 component 化
- 既存 debug CSS class との接続整理

## 非対象

- DebugConsoleManager の state 構造変更
- 調整パラメータの追加削除
- settings shell への debug panel 統合
- runtime tuning の保存方式変更

## 実装タスク

1. debug panel 内の range / checkbox / preset button 実装を一覧化する。
2. settings primitives をそのまま使える箇所と、debug 専用 adapter を残すべき箇所を分ける。
3. 原則として `features/debug/react/components` に debug adapter を追加し、settings primitives への影響が小さい場合だけ共通 primitive 化を検討する。
4. `sincroPoseRetargetControls.tsx` の repeated `RangeControl` を定義配列から描画する。
5. `gazeTuningControls.tsx` と audio tuning panel の repeated range を定義配列から描画する。
6. debug checkbox label の手書きを共通 component へ置き換える。
7. 旧 `RangeControl` が不要なら削除し、必要なら薄い adapter にする。

## 想定変更箇所

- `sincromisor-frontend/src/features/debug/react/components/rangeControl.tsx`
- `sincromisor-frontend/src/features/debug/react/components/*`
- `sincromisor-frontend/src/features/debug/react/panels/sincroPoseRetargetControls.tsx`
- `sincromisor-frontend/src/features/debug/react/panels/gazeTuningControls.tsx`
- `sincromisor-frontend/src/features/debug/react/panels/audioPanelVadControls.tsx`
- `sincromisor-frontend/src/features/debug/react/panels/audioPanelLearnedVadTuning.tsx`
- `sincromisor-frontend/src/features/debug/react/panels/audioPanelAdvancedControls.tsx`
- `sincromisor-frontend/src/features/settings/react/primitives/settingsFieldControls.tsx`

## 完了条件

- debug panel の repeated range JSX が大幅に減っている。
- checkbox / preset button の基本形が共通 component から描画されている。
- debug panel の見た目と操作挙動が既存同等である。
- 新しい tuning range を追加する際、定義配列に項目を足すだけで済む箇所が増えている。

## 確認

- `cd sincromisor-frontend && npm run build`
- Debug console の audio / gaze / sincro motion panel で range と checkbox を操作できることを確認する。
- simple-vrm 画面で debug console を開き、主要 panel が表示崩れしないことを確認する。

## 実施メモ

- 設定 UI 本体の共通化とは独立して進められる。
- ただし settings primitives を変更する場合は、起動前 dialog と常設設定パネルへの影響を必ず目視確認する。
