# TASK-3031 settings form primitive と inline style 削減

- 作成日: 2026-04-30
- ステータス: Done
- 優先度: Medium

## 目的

起動前 dialog と開始後設定パネルで重複している form / toggle / button / help / section card の見た目を共通 primitive へ寄せ、inline style と文脈別 CSS の分散を減らす。

## 背景

- `SettingsShell` によりカテゴリナビと詳細ペインは共通化されているが、項目単位の field、button、toggle、help badge、hint、section card は `DialogSettingsFormSections.tsx`、`SettingsSections.tsx`、`panelStyles.ts` に分散している。
- 起動前 dialog と開始後設定パネルは同じ設定値を扱うため、primitive の差分がそのまま UI 不整合や修正漏れになりやすい。
- `UI_TUNING` に一部 spacing 値は集約されているが、見た目責務が TS inline style と CSS にまたがって残っている。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/open/TASK-3027-overlay-chrome-commonization-epic.md`

## 先行条件

- `TASK-3028` から `TASK-3030` までの overlay chrome 整理が完了していることが望ましい。

## スコープ

- form field / select / button / toggle / help / hint / section card の primitive 整理
- 起動前 dialog と開始後設定パネルの見た目差分削減
- inline style の CSS component 化
- `UI_TUNING` に残すべき調整値と CSS token に寄せる値の整理

## 非対象

- 設定項目の追加削除
- 設定値の反映ロジック変更
- `SettingsShell` の大幅な情報設計変更

## 実装タスク

1. `DialogSettingsFormSections.tsx` と `simple-vrm/components/SettingsSections.tsx` の inline style を棚卸しする。
2. `SettingsField`、`SettingsToggle`、`SettingsButton`、`SettingsHint`、`SettingsSectionCard` などの共通 primitive 候補を定義する。
3. 低リスクな button / hint / section card から共通 component 化する。
4. dialog 固有文言と panel 固有文言は props で残し、見た目だけを共通化する。
5. `panelStyles.ts` に残る root/button/miniCard/miniLog のうち、共通 primitive に移せるものを整理する。

## 想定変更箇所

- `sincromisor-frontend/src/react/settings-primitives/*`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/react/simple-vrm/panelStyles.ts`
- `sincromisor-frontend/src/react/app/uiTuning.ts`
- `sincromisor-frontend/src/react/overlay/overlay.css` または新規 primitive CSS

## 完了条件

- 起動前 dialog と開始後設定パネルで主要 form primitive が共有されている
- inline style が明確に減り、残る inline style は状態依存値や一時的な layout 値に限定されている
- button / toggle / help / hint のサイズや色が文脈ごとに不必要にずれていない
- 設定値の反映挙動が既存と変わっていない

## 確認

- `cd sincromisor-frontend && npm run build`
- 起動前 dialog と右側設定パネルで、会話 / 入出力デバイス / 音声 / 表示 / 接続の主要項目を操作できることを確認する

## 実施メモ

- このタスクは見た目責務の整理が目的であり、設定ロジックのリファクタを混ぜない。
- すべての inline style を一度に消す必要はない。次回以降の調整先が明確になる粒度を優先する。
