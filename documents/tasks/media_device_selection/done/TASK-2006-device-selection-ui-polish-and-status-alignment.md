# TASK-2006 デバイス選択 UI と開始可否ステータスの整合調整

- 作成日: 2026-04-19
- ステータス: Done
- 優先度: Medium

## 目的

設定パネルを正式導線、Debug Console を診断導線として整理し、選択デバイス基準で Start 可否やエラー表示が分かるようにする。

## 関連設計

- `documents/design/frontend_ui.md`

## スコープ

- Start ボタン可否判定の見直し
- 選択デバイスが無効・未接続・権限不足の場合のメッセージ整理
- 設定パネルと Debug Console の役割分担の明確化
- 設計ドキュメント更新

## 非対象

- デバイス列挙 service の新規 API 追加
- RTC / Gaze の根本的な再設計

## 実装タスク

1. `updateUserMediaAvailabilityStatus(...)` の判定を選択デバイス基準へ寄せる。
2. Start ボタンの disabled 理由と hint 表示を整理する。
3. 無効になった deviceId の扱いと復帰導線を明確にする。
4. Debug Console を診断・プレビュー用途に寄せ、設定パネルを正式導線として文言整理する。
5. `documents/design/frontend_ui.md` に device selection の責務分担を追記する。

## 想定変更箇所

- `sincromisor-frontend/src/ts/UI/DialogManager.ts`
- `sincromisor-frontend/src/ts/UI/DialogSettingsPolicy.ts`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `documents/design/frontend_ui.md`

## 完了条件

- Start 可否が選択デバイスの状態と一致する。
- 設定パネルが正式な設定導線として分かる。
- Debug Console の役割が診断用として整理される。
- 設計ドキュメントが更新される。

## 確認

- デバイス未接続時に適切なメッセージが出ることを確認する。
- 設定パネルと Debug Console の役割が UI 上で混同されにくいことを確認する。
