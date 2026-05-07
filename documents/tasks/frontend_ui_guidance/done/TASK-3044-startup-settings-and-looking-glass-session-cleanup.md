# TASK-3044 開始時設定の整理と Looking Glass セッション文言分離

- 作成日: 2026-05-07
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3041`
- 依存: `TASK-3043`

## 目的

過去のデバッグ用途の名残と思われる `enableTalk` / `enableInspector` などの開始時設定を整理し、Looking Glass の開始・終了と会話接続の概念が混ざらないようにする。

## 背景

- ユーザー方針として、talk は原則常に有効とする。
- `enableTalk` はキャラクター描画デバッグ時代の名残の可能性があり、通常UIに出す必要が薄い。
- `enableInspector` は Babylon.js 標準機能由来の可能性があり、Three.js 経路では意味がない可能性が高い。
- `SincroVRMInitializer` では startup capabilities が `false` にされており、現行 simple-vrm では startup toggles が未接続として扱われている。
- Looking Glass には開始・終了の概念があるが、会話セッションとは別概念であり、文言上で `セッション` と呼ぶと混乱しやすい。

## スコープ

- `enableTalk` のUI露出整理
- `enableInspector` のUI露出整理
- `StartupSettingsSection` / `DialogStartupSettingsSection` の必要性判断
- `startupSettingsCapabilities` の扱い
- Looking Glass の状態表示と反映タイミング文言

## 非対象

- WebRTC 接続通知文言の変更
- Looking Glass の起動・終了処理の挙動変更
- VRM360 / Looking Glass の描画処理そのもの
- `enableVR` の実装可否判断を超える大規模再設計

## 実装タスク

1. `enableTalk` は原則常時有効とし、通常UIから切り替え項目として出さない。
2. `enableInspector` が Three.js 現行経路で機能していない場合、通常UIから削除または capability false のまま完全非露出化する。
3. `StartupSettingsSection` と `DialogStartupSettingsSection` が全項目非表示になる場合、カードや空状態文言も出さない。
4. `開始前だけ効く項目` は必要な場合のみ `開始時の設定` として扱う。
5. `変更を反映するには、停止してからもう一度開始してください。` などの再開始文言は、本当にその画面上で意味がある時だけ表示する。
6. Looking Glass 状態カードの `セッション状態`、`次回セッション`、`未反映の変更` 系文言を見直し、会話接続と混ざらない表現へ変更または削除する。
7. Looking Glass の開始・停止ボタンは残し、会話の開始・停止とは別の操作として分かるようにする。
8. `lookingGlassConfigStatus` の表示は、必要な状態だけを簡潔に出す。

## 実装対象候補

- `sincromisor-frontend/src/react/simple-vrm/SimpleVrmControlPanel.tsx`
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- `sincromisor-frontend/src/react/dialog/ConfigurationDialogSettingsPanel.tsx`
- `sincromisor-frontend/src/ts/SincroVRM/SincroVRMInitializer.ts`
- `sincromisor-frontend/src/ts/SincroVRM/SincroVRM360Initializer.ts`
- `sincromisor-frontend/src/ts/App/SincroAppStartupSettings.ts`
- `sincromisor-frontend/src/ts/App/SincroAppController.ts`

## 完了条件

- 通常UIに `会話機能を準備する` が出ない。
- Three.js 経路で意味がない `開発者向け表示確認` が通常UIに出ない。
- startup capability がない時に、開始時設定カードや空状態文言が表示されない。
- Looking Glass の開始・終了と、会話接続の開始・停止が文言上で混ざらない。
- 接続通知チャット文言は現状どおり残っている。

## 確認観点

- `simple-vrm` の接続ページに不要な開始時設定が出ない。
- `vrm360` / `looking-glass-vrm` で必要な開始・停止操作が消えていない。
- Looking Glass 表示で `セッション` という語が会話接続と混同される形で出ていない。

