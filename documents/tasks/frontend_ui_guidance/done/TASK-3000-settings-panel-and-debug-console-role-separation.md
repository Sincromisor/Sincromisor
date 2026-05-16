# TASK-3000 設定パネルと Debug Console の役割分離と言い換え整理

- 作成日: 2026-04-19
- ステータス: Done
- 優先度: High

## 目的

設定パネルを一般ユーザー向けの正式な設定 UI、Debug Console を開発者向けの診断 UI として明確に分離し、設定説明を「何が起きるか」「どんな場面で設定すべきか」が伝わる文言へ整理する。

## 背景

- 現状の設定パネルには、`正式な導線`、`診断用`、`未対応`、`このページで有効な起動時設定はありません` など、実装都合や内部構成を説明する文言が混在している。
- 設定パネルは一般ユーザー向けであるにもかかわらず、略語や内部用語が残っており、設定変更の効果が直感的に分かりにくい。
- Debug Console は開発者向けの技術 UI であり、技術用語や詳細ステータスを許容できる一方、通常ユーザー導線と混同されない見せ方が必要である。

## 関連設計

- `documents/design/frontend_ui.md`
- 必要に応じて設定 UI / 起動前ダイアログに関する関連設計

## スコープ

- 設定パネルの見出し、説明文、補助文言、トグル名、ヘルプ文の棚卸し
- Debug Console と設定パネルの役割定義の明文化
- 役割定義に沿った文言差し替え方針の作成
- 役割に合わない UI 要素の非表示または表現変更
- 起動前設定ダイアログと常設設定パネルの文言整合
- 設計ドキュメントへの反映

## 非対象

- Debug Console 自体の機能削減や廃止
- WebRTC / Audio / Gaze の診断項目の技術的再設計
- 設定値の保存仕様や通信仕様の変更

## 実装タスク

1. 設定パネル、起動前設定ダイアログ、Debug Menu、Debug Console に存在する文言を棚卸しし、一般ユーザー向け文言と開発者向け文言に分類する。
2. 設定パネルの責務を「一般ユーザーが動作を調整するための UI」として定義し、導線や内部実装を説明する文言を除去または言い換える。
3. Debug Console の責務を「開発者が接続・音声・視線・SDP を診断するための UI」として定義し、通常ユーザー向け UI との混同を避けるラベルへ整理する。
4. 設定項目のラベルとヘルプ文を、略語や内部名ではなく「設定すると何が変わるか」「どんな場面で有効か」で分かる表現へ改める。
5. `未使用`、`未対応`、`有効な起動時設定はありません` など、一般ユーザーに価値を提供しない文言やセクションは、非表示を含めて見直す。
6. 起動時設定や次回反映系の説明は、内部状態ではなくユーザーが取るべき行動が分かる文言へ改める。
7. Debug Menu 上の項目名を、対象ユーザーと役割が伝わる表現へ見直す。
8. `documents/design/frontend_ui.md` に、設定パネルと Debug Console の対象ユーザー、責務、文言設計方針を追記する。

## 想定変更箇所

- `sincromisor-frontend/src/partials/sincroBody.html`
- `sincromisor-frontend/src/partials/debugConsole.html`
- `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- `sincromisor-frontend/src/react/simple-vrm/SimpleVrmControlPanel.tsx`
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/react/dialog/ConfigurationDialogSettingsPanel.tsx`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- `documents/design/frontend_ui.md`

## 具体的な見直し観点

- 設定パネル:
    - `正式な導線`、`診断用` などの内部運用説明を削除する。
    - `NS`、`EC`、`AGC`、`VAD Gate`、`Venue`、`Character`、`Gaze`、`AutoMute` などのラベルを一般ユーザーが意味を推測できる表現へ改める。
    - `ページ起動時設定`、`初期化時に効く`、`次回起動時に反映` などを、ユーザー行動ベースの説明へ改める。
    - 意味のない空セクションや非対応項目の露出を減らす。
- Debug Console:
    - 開発者向け UI として、技術用語や詳細ステータスは維持してよい。
    - ただし通常ユーザー向け設定 UI と誤認しないタイトル、メニュー名、説明に整理する。

## 完了条件

- 設定パネルの主要文言が一般ユーザー向けに統一される。
- 設定説明が「何が起きるか」「どんな場面で使うか」を中心に記述される。
- Debug Console が開発者向け診断 UI であることが UI 上で分かる。
- 設定パネルと Debug Console の役割分離が設計ドキュメントに反映される。

## 確認

- 一般ユーザー視点で、設定パネル内の文言から内部事情を知らなくても設定意図を理解できることを確認する。
- 開発者視点で、Debug Console から診断に必要な技術情報へ引き続き到達できることを確認する。
- 設定パネルと Debug Console が UI 上で別用途として認識しやすいことを確認する。

## 実施メモ

- 初回棚卸し時点では、設定パネル側に `正式な導線`、`日常の設定変更`、`未使用`、`有効な起動時設定はありません` などの内部都合文言が複数残っている。
- Debug Console 側は技術用語を許容できるが、Debug Menu 上の名称や説明は通常ユーザー向け導線と誤認しない表現が望ましい。
- 2026-04-19: 設定パネル / 起動前設定 / Debug Menu / Debug Console の文言を整理し、一般ユーザー向け設定導線と開発者向け診断導線の役割をUI上で分離した。
- 2026-04-19: `documents/design/frontend_ui.md` に対象ユーザー、責務、文言設計方針を追記した。
