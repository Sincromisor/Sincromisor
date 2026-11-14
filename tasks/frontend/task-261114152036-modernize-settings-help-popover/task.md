# 説明ポップアップの移動操作を保ち標準APIへ整理する

## 背景・目的

SettingsHelpTooltipはボタンのmouseleaveで、移動先が説明本体でなければ即座に閉じる。CSSの疑似要素で隙間を補っているが、2026-11-14のChrome確認では、マイク入力の説明ボタンから説明本文の中央へ30段階で斜め移動すると表示が消えた。既存のtooltip.hover()による確認では途中の移動経路を検証していない。

## 完了条件

- [x] ホバーで開いた説明へ、斜め移動とボタン・本文間の移動で到達できる。本文上では説明が消えない。
- [x] 最初のクリック・タッチ・フォーカスで説明を開き、ホバー直後のクリックでも閉じない。Escapeと外側操作で閉じられる。
- [x] Popover APIとCSS Anchor Positioningへ配置・重なり順・閉じる処理を整理し、不要になったportal切替・スクロールごとの座標計算・監視を削除する。
- [x] 起動前のモーダル内と常設設定の双方で、説明が切れず、名前・関連付け・フォーカスを保つ。狭い画面と上下端で本文を読める。
- [x] 対象ブラウザー方針に基づき機能対応を確認する。Interest Invokersを使う場合は機能検出し、非対応時にも必要なホバー・クリック・キーボード操作を維持する。

## 設計判断・範囲

[対象ブラウザー](../../../documents/design/frontend/pages.md#対象ブラウザーとcss)と既存のWCAG 2.2 AA方針を適用する。標準APIへの移行だけでホバー保持が満たされるとは判断せず、移動経路を確認する。条件付きの代替処理は必要なものだけ残し、全ブラウザー対応のための無条件な依存追加は行わない。右側ツールメニューは別タスクとする。

[Modern Web Guidanceのツールチップガイド](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/interest-triggered-tooltips)を、ホバー保持・クリック併用・機能検出の判断に使う（2026-11-14参照）。

## 主な変更箇所

[説明部品](../../../sincromisor-frontend/src/features/settings/react/primitives/settingsHelp.tsx)、[共通部品CSS](../../../sincromisor-frontend/src/features/settings/react/primitives/settingsPrimitives.css)、[操作試験](../../../sincromisor-frontend/tests/ui/settingsInteraction.spec.ts)。

## 確認方法

既存の説明操作試験を維持し、クリックでフォーカスを与える前の純粋なホバーから、mouse.moveのstepsを使って本文へ移動する回帰試験を加える。起動前と常設設定の代表経路で、モーダル内の表示、Escape、タッチ、画面端の配置を確認する。

## 文書同期

[共通枠組み](../../../documents/design/frontend/app-shell.md)と[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の該当する責務・挙動を同期する。外部RTC契約は変更しない。

## 実装・確認結果

説明を`popover="hint"`とCSS Anchor Positioningへ移し、portal切り替え、スクロール座標計算、外側クリック・リサイズ監視を削除した。クリックを開く操作に固定し、toggle通知から開閉状態を同期する。ネイティブInterest Invokersを機能検出し、非対応時だけホバー・フォーカスと本文への移動猶予を補う。親モーダル・パネルのEscape処理と競合しないよう、実際のPopover状態を確認して説明だけを閉じる。

Chromeの設定操作試験7件、型検査、対象Biome、変更Markdown確認が成功した。起動前・常設設定、幅1440px・320px、高さ480px、30段階の斜め移動、ネイティブ・代替操作を確認した。Chrome 157の機能検出でPopover hint・Interest Invokers・Anchor Positioning・配置反転の対応を確認した。最低対象Chromium 150でのPopoverと配置の採用根拠は[Chromeのhint説明](https://developer.chrome.com/blog/popover-hint)と[Anchor Positioning説明](https://developer.chrome.com/blog/anchor-positioning-api/)（2026-11-14参照）による。共通枠組み・設定UI設計を同期した。コメント点検: PASS。

OBS同梱ブラウザーでの実行は未確認。Node/npmは既存環境で確認し、指定版では未確認。
