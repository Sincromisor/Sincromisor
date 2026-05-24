# TASK-260525010933 settings page section builder commonization

- 作成日: 2026-05-25
- ステータス: Done
- 優先度: Medium
- 関連: `TASK-3046`, `TASK-260525010931`, `TASK-260525010932`

## 目的

起動前 dialog と simple-vrm 系常設設定パネルで並行実装されている設定ページ構成・section wrapper を整理し、画面固有差分を保ったまま共通の page / section builder へ寄せる。

## 背景

- `simpleVrmSettingsPages.tsx` と `configurationDialogSettingsPages.tsx` は、会話 / デバイス / 音声 / 表示のページ構成がほぼ同型である。
- simple-vrm 側の接続ページは `simpleVrmControlPanelPages.tsx` が `simpleVrmSettingsPages.tsx` の戻り値に追加しているため、共通 builder 化では connection の組み込み地点も対象に含める必要がある。
- `BasicSettingsSection` と `DialogBasicSettingsSection`、`MicSettingsSection` と `DialogDeviceSettingsSection` / `DialogMicSettingsSection`、`StartupSettingsSection` と `DialogStartupSettingsSection` が近い責務を持っている。
- `SettingsShell` と `features/settings/react/fields` は既に共通化されているため、残りの肥大は「ページ組み立て」と「画面別 wrapper」に寄っている。

## 方針

- 共通 field group は `features/settings/react/fields` に残す。
- 共通 section / page builder は `features/settings/react/sections` または `features/settings/react/pages` に置く。
- dialog と常設パネルの文脈差分は variant / copy / density / footer / extra section として表現する。
- VRM file picker、Looking Glass 専用ページ、常設パネルの start / stop 表示などは画面固有として残す。

## スコープ

- conversation / devices / audio / display / connection のページ定義共通化
- section category wrapper の共通化
- device refresh message 表示ロジックの共通化
- startup option hint と connection status label の共通化
- inline style ベースの簡易 card / hint / button group を settings primitives または CSS class へ寄せる

## 非対象

- 設定項目そのものの追加削除
- SettingsShell の大幅再設計
- Debug console の設定 UI
- VRM file drag & drop の共通化
- Looking Glass 専用設定値の挙動変更

## 実装タスク

1. `simpleVrmSettingsPages.tsx`、`simpleVrmControlPanelPages.tsx`、`configurationDialogSettingsPages.tsx` の page id / label / title / section 対応表を作る。
2. `createCoreSettingsPages()` のような共通 builder を追加し、画面固有 section を差し込める形にする。
3. `SettingsCategorySection` と `DialogSettingsCategory` を共通化する。
4. `BasicSettingsSection` と `DialogBasicSettingsSection` を共通 section へ寄せる。
5. device page / audio page / display page の wrapper を、共通 section + variant props へ寄せる。
6. `connectionStatusLabel()` と startup option hint 生成を共通 helper に切り出す。
7. 画面固有に残すべき VRM / Looking Glass / footer / action button を明確に分離する。
8. 不要になった page / section component を削除または薄い facade にする。

## 想定変更箇所

- `sincromisor-frontend/src/features/settings/react/pages/*`
- `sincromisor-frontend/src/features/settings/react/sections/*`
- `sincromisor-frontend/src/pages/simpleVrm/react/simpleVrmSettingsPages.tsx`
- `sincromisor-frontend/src/pages/simpleVrm/react/simpleVrmControlPanelPages.tsx`
- `sincromisor-frontend/src/pages/simpleVrm/react/simpleVrmConnectionPage.tsx`
- `sincromisor-frontend/src/pages/simpleVrm/react/components/*SettingsSection.tsx`
- `sincromisor-frontend/src/features/dialog/react/configurationDialogSettingsPages.tsx`
- `sincromisor-frontend/src/features/dialog/react/configurationDialogConnectionPage.tsx`
- `sincromisor-frontend/src/features/dialog/react/components/dialogSettingsFormSections.tsx`

## 完了条件

- 会話 / デバイス / 音声 / 表示 / 接続ページの基本構成が共通 builder から作られている。
- simple-vrm 側で `simpleVrmControlPanelPages.tsx` が担っている connection / Looking Glass 差し替えの組み込み地点が、共通 builder 化後も明確に残っている。
- dialog と常設パネルの差分が、variant / extra section / footer など読み取りやすい形で残っている。
- `connectionStatusLabel()` の重複がない。
- device refresh message の生成が重複していない。
- 既存のページ順、初期ページ、主要な表示文言が意図なく変わっていない。

## 確認

- `cd sincromisor-frontend && npm run build`
- 起動前 dialog の会話 / デバイス / 音声 / 表示 / 接続ページを目視確認する。
- simple-vrm の会話 / デバイス / 音声 / 表示 / 接続ページを目視確認する。
- vrm360 と looking-glass-vrm の初期ページと専用ページが崩れていないことを確認する。

## 実施メモ

- `TASK-260525010931` と `TASK-260525010932` のあとに着手する。
- props が増えすぎる場合は、無理に1 component 化せず page builder と小さな section helper の共有に留める。
- 2026-05-25: `features/settings/react/pages/coreSettingsPages.tsx` を追加し、conversation / devices / audio / display / connection の page id / label / title / description を共通 builder から生成するようにした。
- 2026-05-25: `SettingsCategorySection`、`SettingsBasicSection`、接続状態ラベル、開始前変更ヒント、デバイス再読み込みメッセージを `features/settings/react/sections` へ移し、dialog と simple-vrm の重複を削減した。
- 2026-05-25: `npm run build` と `npm run check` を通過。
