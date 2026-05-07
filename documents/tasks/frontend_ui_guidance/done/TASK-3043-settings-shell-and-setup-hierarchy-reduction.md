# TASK-3043 SettingsShell と設定/セットアップ画面の階層削減

- 作成日: 2026-05-07
- ステータス: Open
- 優先度: High
- 親タスク: `TASK-3041`
- 依存: `TASK-3042`

## 目的

`SettingsShell`、常設設定パネル、初回セットアップで増えすぎた説明階層を削り、カテゴリ、入力ラベル、ボタン、状態表示だけで理解できるUIへ簡素化する。

## 背景

- 現在は shell header、page header、section card header が重なり、同じ意味の説明が複数回表示される。
- レビューでは「UIを見れば分かるものはテキストにしない」「無意味な階層が多すぎる」という指摘がある。
- 初回セットアップでは `この画面で...確認します`、`左のカテゴリ...下の開始ボタン...` など、レイアウトや内部フローの説明が目立つ。
- 常設設定パネルでも `同じ分類`、`ここで調整`、`このページ` といった内部構造の説明が多い。

## スコープ

- `SettingsShell` の header / page header / card header 表示方針
- 常設設定パネルの `会話` / `デバイス` / `音声` / `表示` / `接続`
- 初回セットアップの `会話` / `デバイス` / `音声` / `表示` / `接続`
- `SettingsSectionCard` の description 任意化または削除
- 起動前ダイアログのフッター説明削減

## 非対象

- WebRTC 接続ロジック
- メディアデバイス選択ロジック
- 接続通知チャット文言
- Looking Glass 起動・終了機能そのもの

## 実装タスク

1. `SettingsShellPage.description` を任意化し、説明不要なページでは表示しない。
2. `SettingsSectionCard.description` を任意化し、説明不要なカードでは表示しない。
3. shell の `badge` / `description` は原則表示しない方向へ寄せる。
4. 常設設定パネルのタイトルを `基本設定` に寄せる。
5. 常設設定パネルの会話カードは `会話` にし、説明文は削除する。
6. デバイスページは `マイクとカメラ` / `デバイス` の文言へ整理し、説明文を削る。
7. 音声ページは `マイク補正` と `ノイズや反響に合わせて声の拾い方を調整します。` を必要最小限で扱う。
8. 表示ページは `キャラクターとアニメーション` に寄せ、重複する `キャラクター表示` カード見出しは削除する。
9. 接続ページは `接続状態の確認と開始・停止` だけを説明として残し、状態カード内の `現在の状態` や診断誘導カードを削除する。
10. 初回セットアップのタイトル、リード、ページ説明、カード説明のうち `備考=不要` のものを削除する。
11. 初回セットアップで必要な見出しは `会話`、`マイクとカメラ`、`デバイス`、`マイク補正`、`キャラクター表示とVRMモデル`、`接続状態` 程度へ絞る。
12. `途中で離れる場合は...` や `ESC キー...` など、UI制約説明が不要なものを削除する。

## 実装対象候補

- `sincromisor-frontend/src/react/settings-shell/SettingsShell.tsx`
- `sincromisor-frontend/src/react/settings-primitives/SettingsPrimitives.tsx`
- `sincromisor-frontend/src/react/simple-vrm/SimpleVrmControlPanel.tsx`
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/react/dialog/ConfigurationDialogSettingsPanel.tsx`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- `sincromisor-frontend/src/react/settings-shell/settingsShell.css`
- `sincromisor-frontend/src/react/dialog/configurationDialogSettings.css`

## 完了条件

- 設定パネルで、同じカテゴリについてページ説明とカード説明が二重に出ない。
- 初回セットアップで、内部フローやレイアウト位置を説明する文言が表示されない。
- `基本設定` の中で、会話・デバイス・音声・表示・接続が簡潔に扱われる。
- `接続` ページでは、接続状態と開始・停止の操作が分かる最小限のUIになっている。
- 削除後の余白が間延びせず、ヘッダー/カードの高さが不自然に残らない。

## 確認観点

- 起動前ダイアログを開いた時、長い説明文なしで操作対象が分かる。
- 右側設定パネルで、ページを切り替えた時に見出しや説明が過剰に増えない。
- mobile 幅で削除後のUIが詰まりすぎたり、逆に空白が残りすぎたりしない。

