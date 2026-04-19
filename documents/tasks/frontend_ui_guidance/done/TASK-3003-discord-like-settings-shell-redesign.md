# TASK-3003 Discordライク設定シェル再設計

- 作成日: 2026-04-19
- ステータス: Done
- 優先度: High

## 目的

設定UIを、PC版Discordライクな `左カテゴリナビ + 右詳細ペイン` の構造へ再設計し、一般ユーザーが項目を探しやすく、現在状態を理解しやすい UX に改善する。

## 背景

- 現行の設定UIは、カテゴリカードを縦方向に積み上げる構成が中心で、全体像と現在地を把握しづらい。
- 起動前 dialog と開始後の設定パネルで文言や導線の考え方が近づいてきた一方、レイアウトと情報の優先順位はまだ統一されていない。
- `WebRTC 開始 / 停止` のような即時アクションが設定項目と近接しており、「値を調整する場所」と「接続を実行する場所」が混在して見える。
- 音声デバイス選択まわりは失敗コストが高いが、現在の選択結果、入力確認、再読み込み、テスト導線がまとまっておらず、確信を持って設定しづらい。
- 想定ユーザー層は Discord などの PC 向け通話UIに慣れている可能性が高く、探索性の高い左右分割型の設定画面との親和性が高い。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3000-settings-panel-and-debug-console-role-separation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3001-settings-menu-segmentation.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3002-settings-and-debug-console-ux-polish.md`

## スコープ

- 起動前設定 dialog の React UI を、上部ヘッダー + 左カテゴリナビ + 右詳細ペイン構造へ再編する
- 開始後の設定パネル（`SimpleVrmControlPanel` 系）を、同じ情報設計とカテゴリ体系へ寄せる
- 一般ユーザー向けカテゴリを `会話`、`音声`、`表示`、`起動`、`接続` に再編する
- `詳細設定` と `開発者向け` の境界を再整理する
- `接続` カテゴリに接続状態の要約カードと Start/Stop/再接続導線を集約する
- `音声` カテゴリにデバイス選択、入力レベル、一覧更新、テスト導線、音声調整を集約する
- 文言、状態表示、補助文の方針を起動前 dialog と開始後設定パネルでそろえる
- 設計文書への反映

## 非対象

- WebRTC シグナリング仕様や payload の変更
- 新規音声処理アルゴリズムの追加
- Debug Console の診断ロジックそのものの再設計
- モバイル専用の最適化実装
- デバイス選択の永続化方式変更

## 対応方針

1. 設定UIの「探索のしやすさ」を最優先にし、カテゴリ現在地が常時見える左右分割型レイアウトへ切り替える。
2. 起動前 dialog と開始後設定パネルで、カテゴリ名、状態カード、項目順、補助文のルールを共通化する。
3. 設定変更と即時アクションを分離し、接続操作は `接続` カテゴリへ集約する。
4. 音声設定は「選択して終わり」にせず、入力レベル、テスト、再読み込みを同じ画面内にまとめる。
5. 開発者向け情報は通常設定から分離し、一般ユーザー向け画面では技術用語の露出を抑える。

## 実装タスク

1. 起動前 dialog 用に、`SettingsShell` 相当の共通レイアウトコンポーネントを追加し、ヘッダー、左ナビ、右詳細ペインを構成する。
2. `ConfigurationDialogSettingsPanel` を、現在の縦積みカテゴリカードから、アクティブカテゴリ切替型のページ表示へ再編する。
3. 開始後の `SimpleVrmControlPanel` / `Vrm360ControlPanel` / `LookingGlassVrmControlPanel` を、同じカテゴリ体系とページ構成へ寄せる。
4. `音声` ページを新設または再編し、マイク選択、一覧再読み込み、入力レベル、マイクテスト、音声調整を一体表示する。
5. `接続` ページを新設または再編し、接続状態カード、接続開始/終了、再接続、補助メッセージを集約する。
6. `WebRTC 開始 / 停止` などのラベルを、一般ユーザー向け画面では目的ベースの文言へ見直す。
7. `会話`、`表示`、`起動`、`詳細設定`、`開発者向け` の各ページを、見出し + 1文説明 + フォーム + 区切り線の構成で統一する。
8. 起動前 dialog と開始後設定パネルの状態表示をそろえ、接続状態、マイク状態、再生先状態を共通の badge / status card 表現で表示する。
9. 既存の `DialogSettingsFormSections`、`SettingsSections`、`PanelControls` の責務を見直し、UIシェル層とフォーム部品層を分離する。
10. CSS を、レイアウト用とフォーム用で分離し、PC前提の左右分割レイアウトと狭幅時の縮退ルールを定義する。
11. `documents/design/frontend_ui.md` に、Discordライク設定シェル方針、カテゴリ再編、状態カード、接続操作分離の方針を反映する。

## 想定変更箇所

- `sincromisor-frontend/src/react/dialog/ConfigurationDialogSettingsPanel.tsx`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- `sincromisor-frontend/src/react/dialog/components/DialogSettingsSections.tsx`
- `sincromisor-frontend/src/react/dialog/configurationDialogSettings.css`
- `sincromisor-frontend/src/react/simple-vrm/SimpleVrmControlPanel.tsx`
- `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `sincromisor-frontend/src/react/simple-vrm/components/PanelControls.tsx`
- 必要に応じて `sincromisor-frontend/src/react/app/**`
- 必要に応じて `sincromisor-frontend/src/styles/sincroConfigurationDialog.css`
- `documents/design/frontend_ui.md`

## 具体的な見直し観点

- 情報設計:
  - 左ナビを見るだけで、設定の全体像と現在地が分かること
  - 各ページ先頭で「今どういう状態か」が把握できること
  - 一般設定と開発者向け設定が同じ重さで並ばないこと
- 操作導線:
  - 接続操作が設定項目に埋もれないこと
  - 音声デバイス選択後に、入力確認と復帰導線まで同じ場所で完結すること
  - 起動前 dialog と開始後画面で、同じカテゴリに同じ意味の項目があること
- 文言:
  - `WebRTC` のような技術用語を一般向け画面の主ラベルに出しすぎないこと
  - 補助文は長文カードではなく、各ページ冒頭の 1 文説明と項目直下の短文中心にすること
  - 状態表示は色だけではなく、文言でも理解できること
- レイアウト:
  - カード乱立を避け、`見出し + 区切り線 + フォーム` を基本とすること
  - 音声設定のような重要ページでは、ラベル列と入力列の視線移動が安定していること
  - 狭幅時は左ナビを縮退できるが、PC版では常時表示を基本とすること

## 完了条件

- 起動前 dialog と開始後設定パネルの両方で、カテゴリナビ付きの設定シェルが成立している。
- 一般ユーザー向け主要カテゴリが `会話`、`音声`、`表示`、`起動`、`接続` に整理されている。
- 接続操作が一般設定から分離され、`接続` ページまたは同等の専用導線に移っている。
- 音声ページで、デバイス選択、一覧更新、入力確認、テスト、音声調整がまとまって操作できる。
- 設定UI全体で文言方針と状態カード表現がそろっている。
- `documents/design/frontend_ui.md` に今回の再設計方針が反映されている。

## 確認

- PC画面で、設定カテゴリの現在地と全体像が一目で分かることを確認する。
- 音声設定で、マイク選択から入力確認まで迷わず辿れることを確認する。
- 接続状態が設定ページ上部の状態カードで把握でき、接続開始/停止の導線が設定項目と混同されないことを確認する。
- 起動前 dialog と開始後設定パネルで、同じカテゴリ名と文言方針が保たれていることを確認する。
- `looking-glass-vrm` などページ固有カテゴリが、通常カテゴリと混ざらず独立表示されることを確認する。

## 実施メモ

- 本タスクは、UIレビューとワイヤーフレーム検討で合意した Discordライク設定シェル案を、実装可能な単位へ落とし込むためのタスクである。
- 既存の `settings_snapshot / settings_ui_state / settings_ui_hints` の状態分離は活かし、状態管理よりも UIシェルとフォーム構成の再編を中心に進める。
- 起動前 dialog と開始後設定パネルで別々に最適化しすぎると文言乖離が起きやすいため、カテゴリとページ部品の共通化を優先する。
