# TASK-3046 settings field group commonization

- 作成日: 2026-05-07
- ステータス: Done
- 優先度: Medium
- 関連: `TASK-3031`, `TASK-3043`

## 目的

起動前 dialog と simple-vrm 系常設設定パネルで二重化している設定 field / field group を共通化し、画面固有の layout / footer / 専用操作に引き摺られて設定項目の実装が重複する状態を減らす。

## 背景

- `SettingsShell` と `settings-primitives` により、カテゴリナビや input / select / toggle などの低レベル UI は共通化されている。
- しかし `react/simple-vrm/components/SettingsSections.tsx` と `react/dialog/components/DialogSettingsFormSections.tsx` では、同じ設定値を扱う field 群が画面別 section component の中に残っている。
- 現状の粒度は「常設パネル用 section」「起動前 dialog 用 section」が中心で、画面固有の違いと純粋に共通な設定 field が同じ component に混ざっている。
- そのため、`titleText`、`talkMode`、マイク入力、カメラ入力、音声補正、キャラクター表示、開始時設定などが同じ意味を持つにもかかわらず、文言、help、hint、disabled、`onApplySettings` 配線の変更漏れが起きやすい。

## 方針

- `SettingsShell`、画面ごとのページ構成、footer、VRM file 選択、Looking Glass 操作などは画面固有として残す。
- 設定1項目、または小さな field group の粒度で共通 component を作る。
- 共通 field group は `settings-primitives` を使い、画面別 section は layout / density / 見出し / 表示対象の選択に責務を絞る。
- 文言を完全に同一化すべきではない箇所は props で差し替え可能にし、共通化によって dialog と常設 panel の導線差分を失わない。

## スコープ

- 共通 field / field group の抽出
  - `TitleTextField`
  - `TalkModeField`
  - `AudioInputDeviceField`
  - `VideoInputDeviceField`
  - `AudioProcessingToggles`
  - `CharacterDisplayToggles`
  - `StartupBehaviorFields`
- 共通 help text / hint 生成 / device selection hint / selected device id normalization の整理
- `DialogSettingsFormSections.tsx` と `SettingsSections.tsx` の重複削減
- 起動前 dialog と常設 panel の UI 表示差分を維持したまま、設定値反映の配線を共有 component 側へ寄せる

## 非対象

- `SettingsShell` の大幅な情報設計変更
- 設定値の追加削除
- `SincroAppController.applySettings()` の仕様変更
- WebRTC / media device / VRM file cache の動作変更
- Looking Glass 専用設定値の共通化。ただし将来共通 field 化できるよう境界を乱さない

## 実装タスク

1. `SettingsSections.tsx` と `DialogSettingsFormSections.tsx` で、同一設定値を扱う field と画面固有 layout を棚卸しする。
2. `react/settings-fields/` などの配置を検討し、共通 field / field group の責務境界を決める。
3. `settingHelp` を共通化し、画面固有の言い回しが必要な場合だけ props で上書きできる形にする。
4. `DeviceSelectionHint` と `normalizeSelectedDeviceId` を共通 field 層へ移す。
5. `TitleTextField` と `TalkModeField` から抽出し、dialog / panel の会話 section へ適用する。
6. `AudioInputDeviceField` と `VideoInputDeviceField` を抽出し、device selection の hint / refresh 結果表示が既存と同等であることを確認する。
7. `AudioProcessingToggles` と `CharacterDisplayToggles` を抽出し、density / label / hint の差分を props で表現する。
8. `StartupBehaviorFields` を抽出し、起動中 / 次回起動反映 / restart required の表示差分を保つ。
9. dialog 用 section と panel 用 section は、共通 field group の組み合わせと画面固有 layout だけを持つ形へ薄くする。
10. 抽出後に不要になった重複 type / helper / help text を削除する。

## 想定変更箇所

- `sincromisor-frontend/src/react/settings-fields/*` または同等の新規共通 field 配置
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- `sincromisor-frontend/src/react/settings-primitives/SettingsPrimitives.tsx`
- `sincromisor-frontend/src/react/app/appSettingsTypes.ts`
- `sincromisor-frontend/src/react/simple-vrm/panelTypes.ts`

## 完了条件

- 起動前 dialog と常設設定パネルで、主要な設定 field / field group が共通 component から描画されている。
- 画面固有 component は、ページ構成、セクション見出し、密度、footer、VRM file 選択、Looking Glass 操作などの固有責務に絞られている。
- `settingHelp`、device hint、selected device id normalization の重複がなくなっている。
- 設定値の保存・反映・disabled 状態・hint 表示の挙動が既存と変わっていない。
- 抽出後も dialog と常設 panel の文脈差分が潰れていない。

## 確認

- `cd sincromisor-frontend && npm run build`
- 起動前 dialog で会話 / デバイス / 音声 / 表示 / 接続の主要項目を操作できることを確認する。
- simple-vrm の常設設定パネルで会話 / デバイス / 音声 / 表示 / 接続の主要項目を操作できることを確認する。
- vrm360 / looking-glass-vrm で常設設定パネルの初期ページと Looking Glass 専用操作が崩れていないことを確認する。

## 実施メモ

- 低レベル primitive の追加よりも、設定 field の意味単位を揃えることを優先する。
- 一度にすべての section を畳み込まず、会話 field、device field、toggle group の順に小さく進める。
- 共通化により props が過剰に増える場合は、その field group は無理に1つへまとめず、さらに小さい field 単位で共有する。
- ソースコードを変更した場合、UI構造の方針変更として `documents/design/` の該当設計文書更新が必要か確認する。

## 完了メモ

- `src/react/settings-fields/SettingsFields.tsx` を追加し、主要な設定 field / field group と help / device hint / selected device id normalization を共通化。
- `DialogSettingsFormSections.tsx` と `SettingsSections.tsx` は、共通 field group の組み合わせと画面固有の layout / density / 見出しに責務を縮小。
- `documents/design/frontend_ui.md` に settings field 層の責務境界を追記。
- 確認: `cd sincromisor-frontend && npm run build`
