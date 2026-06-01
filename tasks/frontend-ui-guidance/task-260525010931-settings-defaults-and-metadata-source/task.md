# TASK-260525010931 settings defaults and metadata source

- 作成日: 2026-05-25
- ステータス: Done
- 優先度: High
- 関連: `TASK-3046`

## 目的

フロントエンド設定値の既定値・型・適用処理・snapshot 生成に散っている同じ知識を正本化し、設定項目を追加・変更するたびに複数ファイルを手作業で同期する状態を解消する。

## 背景

- `simpleVrmPanelDefaults.ts`、`configurationDialogStateDefaults.ts`、`dialogStateStore.ts` に同じ設定既定値が重複している。
- `enableVadGate` は React 側 fallback が `false`、`DialogStateStore` が `true` で、既に値の不一致が発生している。
- Looking Glass 設定も React fallback と runtime config の既定値が一致していない。`lgTargetY` / `lgTargetZ` / `lgTargetDiam` は snapshot builder が runtime config を読むため、fallback だけ正本化しても初期表示と実設定のズレが残る。
- `SincroAppSettingsSnapshot`、`SincroAppDialogFacade`、`buildSincroAppSettingsSnapshot()`、`applySincroAppSettingsPartial()`、`DialogManager` getter / setter に同じ設定キー一覧が展開されている。
- 現状では、設定追加時に default / type / getter / setter / apply / snapshot / UI disabled をすべて目視で追う必要がある。

## 方針

- `src/app/settings/` 配下に設定メタデータの正本を置く。
- まずは既定値と UI fallback の重複解消を優先し、過度な汎用 framework 化は避ける。
- 設定値ごとに、既定値、数値 clamp、適用先、起動時のみ反映かどうかを追える形にする。
- UI disabled は値の既定値と混ぜず、初期利用可能状態が判明するまで無効化する policy として別に扱う。
- `DialogStateStore` は設定の保存先として残してよいが、初期値の手書き複製はやめる。
- Looking Glass は `lookingGlassRuntimeConfig.ts` の runtime default と settings fallback の関係を明示し、どちらが正本かを決める。

## スコープ

- `SincroAppSettingsSnapshot` の既定値を正本化する。
- `SincroAppSettingsUiState` / `SincroAppSettingsUiHints` / startup status / startup capabilities の fallback を共通化する。
- `DialogStateStore` の `values` 初期値を共通定義から生成する。
- `DialogStateStore` の `disabled` 初期値と React fallback の `defaultSettingsUiState` は、値の default ではなく UI policy として棚卸しする。
- `buildSincroAppSettingsSnapshot()` と `applySincroAppSettingsPartial()` の設定キー分岐を、メタデータまたは小さなカテゴリ定義へ寄せる。
- `enableVadGate` の既定値不一致を解消し、どちらが意図した値かを実装上明確にする。
- Looking Glass runtime default と React fallback default の不一致を解消し、初期表示と snapshot builder の値を一致させる。

## 非対象

- 設定 UI の見た目変更
- 新しい設定項目の追加
- WebRTC endpoint / payload 変更
- サーバー側設定契約の変更
- localStorage 等の永続化方式変更

## 実装タスク

1. `simpleVrmPanelDefaults.ts`、`configurationDialogStateDefaults.ts`、`dialogStateStore.ts`、`lookingGlassRuntimeConfig.ts` の重複値を比較し、不一致を一覧化する。
2. `src/app/settings/sincroAppSettingsDefaults.ts` など、設定既定値の正本ファイルを追加する。
3. React fallback で使う settings / uiState / uiHints / startup status / startup capabilities を正本から参照する。
4. `DialogStateStore` の設定値初期値を正本から生成する。
5. `DialogStateStore` の disabled 初期値と React fallback disabled 値を比較し、値 default ではなく availability policy として整理する。
6. `enableVadGate` の既定値を決め、変更理由をコメントまたはタスク完了メモに残す。
7. Looking Glass runtime default と React fallback default の正本を決め、`lgTargetY` / `lgTargetZ` / `lgTargetDiam` を含む初期値のズレをなくす。
8. 数値設定の clamp 範囲を `applySincroAppSettingsPartial()` から追いやすい形に整理する。
9. 設定追加時の更新箇所が減ったことを README または設計文書更新要否として確認する。

## 想定変更箇所

- `sincromisor-frontend/src/app/settings/sincroAppSettingsDefaults.ts`
- `sincromisor-frontend/src/app/settings/sincroAppSettingsApply.ts`
- `sincromisor-frontend/src/app/settings/sincroAppSettingsSnapshotBuilder.ts`
- `sincromisor-frontend/src/character/lookingGlass/lookingGlassRuntimeConfig.ts`
- `sincromisor-frontend/src/features/dialog/model/dialogStateStore.ts`
- `sincromisor-frontend/src/features/dialog/react/configurationDialogStateDefaults.ts`
- `sincromisor-frontend/src/pages/simpleVrm/react/simpleVrmPanelDefaults.ts`
- `sincromisor-frontend/src/app/controller/sincroAppTypes.ts`

## 完了条件

- settings snapshot の既定値が単一の正本から参照されている。
- Dialog、React fallback、Looking Glass runtime config の既定値不一致がなくなっている。
- disabled 初期値は設定値 default と分離され、availability policy として意図が説明されている。
- 設定値を1つ追加する際に必要な更新箇所が、現状より明確かつ少なくなっている。
- `enableVadGate` の既定値が統一されている。
- `lgTargetY` / `lgTargetZ` / `lgTargetDiam` を含む Looking Glass 初期表示が runtime snapshot と一致している。
- 既存の起動前 dialog / 常設設定パネルの初期表示が変わらない、または意図した差分として説明されている。

## 確認

- `cd sincromisor-frontend && npm run build`
- 起動前 dialog の各設定初期値を目視確認する。
- simple-vrm 常設設定パネルの各設定初期値を目視確認する。
- `enableVadGate` の初期値が意図通りであることを確認する。
- Looking Glass 設定の初期表示が runtime config 由来の snapshot と一致することを確認する。

## 実施メモ

- 最初のタスクとして着手する。以降の UI 共通化は、この設定正本を前提に進める。
- ソースコードを変更した場合、`documents/design/frontend/` または設定契約を説明する設計文書の更新要否を確認する。
- `sincroAppSettingsDefaults.ts` を追加し、settings snapshot / DialogStateStore / React fallback / Looking Glass runtime の既定値を集約した。
- `enableVadGate` は初回利用時の誤検出を避けるため初期 OFF に統一した。
- Looking Glass は runtime 側の実機向け既定値（Target Y `0.85` / Target Z `0.2` / Target Diam `1.5`）を正本にした。
- `documents/design/frontend/app-shell.md` と `documents/design/frontend/settings-and-debug-ui.md` を更新した。
- 確認: `npm run check` / `npm run build`。Playwright で startup dialog の音声タブと looking-glass-vrm の設定パネル初期値を確認した（backend 未起動のため `config.json` 404 は想定内）。
