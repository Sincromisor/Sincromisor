# 共通設定を項目名と入力で理解できる表示に整理する

## 背景 / 目的

ユーザーの原則に従い、共通設定の項目名を言い直す常時説明を減らす。2026-10-24、HEAD `30ce9259`で、「音量を自動で整える」の直下に「マイク音量を自動で整えます。…」、「ノイズを抑える」の直下に「周囲のザーッというノイズを抑えます。…」などを確認した。390px幅では複数行の説明が操作領域を占める。

コード上では、機器選択欄に表示済みの名前も「選択中: …」として再掲される。

## 完了条件（受け入れ条件）

- [ ] 音声補正、キャラクター表示、顔・姿勢追跡、動作量は、短い項目名・チェック状態・数値・まとまりで用途が分かる。項目名の言い換えと一般的な利用例だけの常時説明を除く。
- [ ] 「自動でミュートする」「姿勢同期」「目線追跡」など対象が曖昧な項目は、必要な意味を項目名や配置へ反映する。全項目への「?」追加やアイコンだけへの置換で解決しない。
- [ ] 選択中のマイク・カメラ名は選択欄で示し、同じ名前だけを下へ再掲しない。機器不在・取得失敗・権限未許可・利用不可理由は該当時に対象入力の近くで分かる。
- [ ] 無効理由と判断に不可欠な制約は残す。詳しい調整の目安が必要な場合だけ既存の補足UIを使い、キーボードで到達できる。
- [ ] 起動前と常設設定に同じ整理が反映される。入力の名前・関連付け、保存値の精度、設定適用処理を維持する。
- [ ] 設計と項目一覧の用途を常時説明する現行記述を、項目名と構造を優先する方針へ同期する。

## 設計判断

説明の一括非表示ではなく、まず項目名とグループ境界を整える。操作判断に必要な違いを伝える説明だけを保持する。短い入力群を文章のための大きなカードにしない。

## スコープ境界

共通設定の音声・キャラクター・カメラ・機器選択が対象。体験選択は[体験選択の説明と再接続案内の重複を整理する](../task-261024195952-simplify-experience-guidance/task.md)、VRMは[起動前のVRM選択を一つの操作領域にまとめる](../task-261024195953-simplify-startup-vrm-selection/task.md)、Looking Glassは[Looking Glass設定の状態表示と反映案内を整理する](../task-261024195953-simplify-looking-glass-guidance/task.md)で扱う。音声処理、追跡条件、設定キー・既定値・保存形式は変更しない。

## 実装方針

- [共通入力群](../../../sincromisor-frontend/src/features/settings/react/fields/)の`audioProcessingToggles.tsx`、`characterDisplayToggles.tsx`、`cameraTrackingFields.tsx`、`autoMuteField.tsx`、`deviceSettingsFields.tsx`と`settingsHelp.ts`を見直す。
- [チェック項目](../../../sincromisor-frontend/src/features/settings/react/primitives/settingsTogglePrimitives.tsx)、[数値入力](../../../sincromisor-frontend/src/features/settings/react/primitives/settingsFieldControls.tsx)と同ディレクトリのCSSは、余白と残す理由の関連付けに必要な範囲で調整する。
- [機器選択状態](../../../sincromisor-frontend/src/features/media/devices/sincroMediaDeviceService.ts)は既存値を使い、UIに選択・検出状態を複製しない。

## テスト

変更対象の静的検査と型検査・ビルドを行う。`playwright-cli`で起動前詳細と常設設定の対象分類を通常幅と狭幅で確認し、項目の識別、無効理由、キー操作を確認する。機器選択は利用可能な選択と不在を固定データでも確認できる。関連する既存の設定・機器テストで値と処理の維持を確認する。

## ドキュメント同期の要否

[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)と[設定項目一覧](../../../documents/design/frontend/setting-and-debug-ui/settings-items.md)の「説明と状態の表示」「項目に添える説明」を同期する。過去の完了タスクの記録は書き換えない。
