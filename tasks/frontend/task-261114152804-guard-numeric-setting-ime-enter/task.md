# 数値設定のIME変換確定で入力を早期適用しない

## 背景・目的

2026-11-14のmodern-web-guidanceのlegacy-scanで、NumericSettingFieldのEnter処理がime-safe-enter-submitの候補として検出された。実装はEnterのkeydownで無条件にblur()を呼び、onBlurが設定値を適用する。共通のSettingsInputや呼出し側にもIME変換中の判定はない。

ChromeでLooking Glassの「タイルの高さ」を512から999へ編集中に、keyがEnter、isComposingがtrue、keyCodeが229の合成KeyboardEventを送ると、フォーカスが外れ、設定値が999へ確定した。これは合成イベントによる処理経路の再現であり、実OSのIME操作や各ブラウザーの変換イベント順序は未確認である。

## 完了条件

- [ ] IME変換中のEnterでは、独自のblur()とそれに伴う設定適用を行わず、入力欄のフォーカスと編集中の値を保持する。
- [ ] ReactのnativeEvent.isComposingを確認し、EnterでnativeEvent.keyCodeが229の場合も独自の確定処理から除外する。変換確定自体のブラウザー処理を妨げない。
- [ ] 変換中でない通常のEnterと利用者によるフォーカス移動では、従来どおり値を確定する。通常のEscapeによる取消し、空欄・未完成値の復元、数値の正規化、プリセット反映を維持する。
- [ ] 回帰試験で変換中イベントが設定値を変更しないことと、変換終了後の通常Enterで確定できることを確認する。

## 設計判断・範囲

NumericSettingField内のキー処理を局所的に修正する通常変更とし、既存の入力途中の状態管理とonBlurの適用経路を再利用する。時間差で変換終了を推測するタイマーや新しい依存は追加しない。入力型の変更、数値設定全体の再設計、ほかのキー操作の変更は対象外とする。

[Modern Web GuidanceのIMEガイド](https://developer.chrome.com/docs/modern-web-guidance/guides/forms/ime-safe-enter-submit)の変換中判定と229の補助判定を適用する（2026-11-14参照）。送信フォームではないため、ガイドの送信ボタン追加やrequestSubmitへの置換は適用しない。

先行するポップアップ改善タスクとは依存しない。同じ操作試験ファイルを編集する場合は既存変更を維持する。

## 主な変更箇所

- [NumericSettingField](../../../sincromisor-frontend/src/app/settings/react/components/numericSettingField.tsx)
- [数値欄の利用箇所](../../../sincromisor-frontend/src/app/settings/react/components/lookingGlassSettingsSection.tsx)
- [共通入力部品](../../../sincromisor-frontend/src/features/settings/react/primitives/settingsFieldControls.tsx)は属性がそのまま渡ることを確認する対象とする。
- [設定操作試験](../../../sincromisor-frontend/tests/ui/settingsInteraction.spec.ts)

## 確認方法

既存のLooking Glass数値欄の試験を再利用する。確定値512から999へ編集し、isComposing=trueのEnterと、isComposing=falseかつkeyCode=229のEnterをそれぞれ送る。いずれもフォーカス・編集中の999を保ち、アプリ側の確定値は512のままであることを確認する。その後の通常Enterで999が適用されることを確認する。

通常のEnter・Escape・Tab・空欄・負数・プリセットの既存試験も実行する。実OSのIMEで確認できる場合は変換確定後も編集を続けられることを補足確認し、未実行なら合成イベントの確認と区別して記録する。実機Looking Glassや複数OSの網羅試験は必須にしない。

## 文書同期

[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の数値欄の確定規則へ、IME変換確定のEnterでは設定を適用しないことを補足する。保存形式・RTC契約は変更しない。
