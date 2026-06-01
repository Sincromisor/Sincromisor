# TASK-3007 設定シェルのサイドバー安定化未達と summary 過多の是正

- 作成日: 2026-04-19
- ステータス: Done
- 完了日: 2026-04-19
- 優先度: High

## 目的

`TASK-3006` 実装後も残っている `サイドバー挙動の不安定さ`、`summary 過多による本文位置の揺れ`、`非操作要素の誤認`、`固定の確認済み文言` を是正し、`simple-vrm` を最優先対象として、当初想定していた `固定位置に整然と並ぶカテゴリ一覧` と `切替時に揺れない本文構造` を実現する。

## 背景

- `TASK-3006` では `入出力デバイス` カテゴリの新設や `起動` の吸収は行われたが、レビュー結果では最重要課題だった `サイドバーの安定化` が未達である。
- 現行実装では、`sticky` 指定を用いた見た目上の固定が導入されている一方で、右ペインが `header -> summary -> content` の可変積み上げ構造のままであり、カテゴリ切替時に本文開始位置が大きく上下する。
- そのため、ユーザーが不快に感じているのはサイドバー自体のスクロール追従だけではなく、`左のカテゴリ一覧と右の本文の位置関係が毎回変わること` による視線移動ストレスである。
- さらに、summary カードは `情報量を減らす` 目的に反して増えすぎており、CTA 近傍で十分に伝わる内容や本文と重複する内容まで上段で再掲している。
- `接続` ページでは `確認済み` の固定チェックリストが残っており、実状態を表していない文言が誤案内を生んでいる。
- 状態カードの面表現も依然として強く、特に肯定系カードが `押せそうなボックス` に見えるため、`非操作要素がボタンに見えないようにする` という `TASK-3006` の目的を十分に満たしていない。
- その結果、`TASK-3006` は `Done` 扱いになっているものの、完了条件の中心であった `サイドバーの位置と本文開始位置の安定` が実現できていない。

## 関連設計

- `documents/design/frontend_ui.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3004-initial-setup-wizard-and-dialog-close-semantics.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3005-initial-setup-and-settings-layout-refresh.md`
- `documents/tasks/frontend_ui_guidance/done/TASK-3006-simple-vrm-device-category-and-stable-sidebar-layout.md`

## スコープ

- 共通 `SettingsShell` の右ペイン構造見直し
- `simple-vrm` と初回セットアップにおける summary 表示の削減と整理
- サイドバーと本文開始位置の安定化
- `接続` ページの責務縮小
- 固定 `確認済み` 文言の廃止または状態連動化
- 非操作要素の見た目の調整
- `TASK-3006` 完了判定の補正に必要な設計文書更新

## 非対象

- WebRTC や音声処理ロジックそのものの変更
- `入出力デバイス` カテゴリ導入の巻き戻し
- Debug Console の構造刷新
- `vrm360` や `looking-glass-vrm` の全面的なレイアウト再設計

## 対応方針

1. `サイドバー安定化` を `sticky にすること` ではなく、`カテゴリ切替時に左ナビと右本文の位置関係が大きく変わらないこと` と再定義する。
2. 共通 `SettingsShell` の `summary` を本文とは別の可変ブロックとして積む構造を見直し、本文開始位置が揃うレイアウトへ修正する。
3. `summary` は必要最小限に絞り、本文や CTA の近くで十分に伝わる情報は重複表示しない。
4. `接続` ページは、接続確認と開始/停止操作に責務を絞り、状態カードやチェックリストの過剰な再掲をやめる。
5. 実状態に紐づかない `確認済み` 文言は原則廃止し、残す場合は状態連動の実装を必須とする。
6. 非操作要素は押せる見た目を避け、情報面・セクション面・ボタンの視覚的差を明確にする。
7. `TASK-3006` の `Done` 扱いで断定した設計記述は、今回の是正内容に合わせて更新する。

## 是正チェックリスト

### 1. サイドバーと本文位置の安定化

- [ ] `SettingsShell` の右ペインが、カテゴリごとに大きく異なる積み上げ構造になっていない
- [ ] 本文開始位置がカテゴリ切替時に大きく上下しない
- [ ] サイドバーの外枠位置、上端、幅がカテゴリ切替で揺れない
- [ ] `sticky` は補助挙動に留め、主目的である `位置関係の安定` を構造で達成する
- [ ] `simple-vrm` 初回セットアップで、`会話・入出力デバイス・音声・表示・接続` が固定位置に整然と並ぶ

### 2. summary 削減と役割整理

- [ ] `summary` は本当に必要な項目だけに絞る
- [ ] ページごとにカード枚数や高さが大きくばらつかない
- [ ] CTA 近傍で十分に伝わる内容を status card で重複表示しない
- [ ] `開始できます` のような主CTA近傍情報は、上段カードではなく CTA 周辺へ寄せる
- [ ] `接続` ページで `RTC 状態` など一般ユーザーに不要な要約を減らす

### 3. 接続ページの整理

- [ ] `接続` ページは `接続確認と開始/停止操作` に責務を絞る
- [ ] `開始時の準備` は必要な時だけ本文内に出し、常時大きく再掲しない
- [ ] 固定の `確認済み` チェックリストは廃止するか、状態連動に改める
- [ ] `最終確認` の説明文は、ユーザーの行動を促す文言に絞る

### 4. 非操作要素の見た目整理

- [ ] status card がボタンや CTA のように見えない
- [ ] `good` / `warn` トーンの面表現が強すぎず、状態表示として認識できる
- [ ] セクション面と状態面の階層差が過剰でない
- [ ] ボタンだけが明確に押せる見た目になっている

### 5. 文言と完了判定の是正

- [ ] `会話・音声・表示` など旧カテゴリ前提の文言が残っていない
- [ ] `TASK-3006` で断定した完了形の説明が、今回の是正内容に合わせて補正される
- [ ] `documents/design/frontend_ui.md` に、`sticky` と `安定化` を混同しない構造方針を反映する
- [ ] 必要なら `TASK-3006` の完了条件未達を補足メモとして残す

## 実装タスク

1. `SettingsShell` の `pageHeader -> summary -> content` 構造を棚卸しし、本文開始位置が揃う構造へ再設計する。
2. `summary` を `本文先頭の可変ブロック` として扱う現行実装を見直し、必要なら本文内固定セクションまたは別の軽量表現へ置き換える。
3. 初回セットアップ `ConfigurationDialogSettingsPanel` の各カテゴリで、summary 項目を再棚卸しし、重複・冗長なカードを削る。
4. `simple-vrm` の `SimpleVrmControlPanel` でも同様に summary を再棚卸しし、一般ユーザー向けに不要な状態再掲を減らす。
5. `接続` カテゴリの内容を再構成し、開始/停止と最終確認に責務を絞る。
6. 固定 `確認済み` 文言を削除するか、状態連動のロジックを実装した上で表示する。
7. `SettingsStatusCard` と関連CSSの面表現を見直し、非操作要素が押せるボックスに見えないよう調整する。
8. 旧カテゴリ前提や重複している導入文・説明文を整理する。
9. `documents/design/frontend_ui.md` の `TASK-3006` 反映内容を見直し、今回の是正後の実態に合わせて更新する。
10. 必要に応じて `TASK-3006` の実施メモや関連記録に、未達だった論点と今回の是正理由を追記する。

## 想定変更箇所

- `sincromisor-frontend/src/react/settings-shell/SettingsShell.tsx`
- `sincromisor-frontend/src/react/settings-shell/settingsShell.css`
- `sincromisor-frontend/src/react/dialog/ConfigurationDialogSettingsPanel.tsx`
- `sincromisor-frontend/src/react/dialog/configurationDialogSettings.css`
- `sincromisor-frontend/src/react/simple-vrm/SimpleVrmControlPanel.tsx`
- 必要に応じて `sincromisor-frontend/src/react/dialog/components/DialogSettingsFormSections.tsx`
- 必要に応じて `sincromisor-frontend/src/react/simple-vrm/components/SettingsSections.tsx`
- `documents/design/frontend_ui.md`
- 必要に応じて `documents/tasks/frontend_ui_guidance/done/TASK-3006-simple-vrm-device-category-and-stable-sidebar-layout.md`

## 完了条件

- `simple-vrm` の初回セットアップと開始後設定で、カテゴリ切替時に左ナビと右本文の位置関係が大きく揺れない
- サイドバーの安定化が `sticky` 依存ではなく、構造上の安定として実現されている
- summary カードが必要最小限になり、本文や CTA と重複する情報が大きく減っている
- `接続` ページの責務が絞られ、固定の `確認済み` 文言が残っていない
- 非操作要素がボタンに見えず、状態表示・セクション・操作ボタンの視覚差が明確になっている
- `documents/design/frontend_ui.md` の記述が、是正後の実装実態と一致している

## 確認

- 初回セットアップで `会話`、`入出力デバイス`、`音声`、`表示`、`接続` を切り替えた時、サイドバーと本文開始位置が大きくずれないことを確認する
- `接続` ページで、`確認済み` の固定文言が表示されていないことを確認する
- `接続` ページで、開始可否や主操作が上段カードとフッターで二重に主張されていないことを確認する
- summary カードが、実際のボタンやリンクと誤認しにくいことを確認する
- `simple-vrm` の開始後設定でも、同様にカテゴリ切替時の位置揺れが抑えられていることを確認する

## 実施メモ

- 本タスクは、`TASK-3006` 実装レビューで指摘された `サイドバー安定化未達` と `summary 過多` の是正を扱う後続タスクである。
- `TASK-3006` ではカテゴリ再編自体は進んだが、最重要だった `切替時に揺れない構造` は達成できていなかった。
- 今回は `カテゴリ名の整理` よりも、`右ペイン構造の再設計` と `情報量の引き算` を優先する。
- 実装変更時は `documents/design/frontend_ui.md` の更新が必要になる。
