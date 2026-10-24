# Looking Glass設定の状態表示と反映案内を整理する

## 背景 / 目的

2026-10-24、HEAD `30ce9259`のLooking Glass設定では、停止中にも「表示状態」「停止中」、「反映タイミング」「変更の反映待ちなし」のカードと「これらの値は、次回の Looking Glass 起動時に適用されます。」が表示される。コード上では変更時に反映タイミングの値・詳細が加わり、同じ手順が重なる。「ピンボケ気味の場合は…」も全項目の前に常時表示される。

ユーザーの原則に従い、状態を操作とまとめ、必要な反映案内だけを一度示す。

## 完了条件（受け入れ条件）

- [ ] 表示状態は開始・停止操作の近くで一度示し、ラベル・値・同義の詳細をカードで重ねない。停止・開始中・表示中・復旧・失敗は識別できる。
- [ ] 変更がない通常時に「反映タイミング」「変更の反映待ちなし」の説明専用カードを出さない。次回開始で適用する設定であることは設定群の短い見出しなどで分かる。
- [ ] 反映待ちの場合は、次回開始か停止・再開始が必要かを既存状態から一度だけ案内する。値・詳細・固定文で同じ手順を繰り返さない。
- [ ] ピンボケ時の一般的な調整案内は常設の独立段落から外し、必要な項目の既存補足へまとめる。各数値の名前・単位と操作は維持する。
- [ ] エラー固有の理由・障害コードを失わず、通常状態も色だけに依存しない。保存と描画への適用を混同しない。

## 設計判断

専用の`lookingGlassConfigStatus`を使い、UIで反映待ちを再判定しない。別のカードへの文言移動だけで終えず、操作と状態の配置を整理する。

## スコープ境界

専用カテゴリの状態・反映案内・補足が対象。カテゴリ見出しは[設定と開発者ツールで選択中カテゴリの重複見出しを整理する](../task-261024195952-remove-redundant-panel-headings/task.md)で扱う。プリセット値、描画、機器接続、開始・停止イベント、設定保存は変更しない。

## 実装方針

- [状態と操作](../../../sincromisor-frontend/src/app/settings/react/lookingGlassControlPage.tsx)の`LookingGlassStatusSummary`と`LookingGlassActionButtons`を見直す。
- [専用設定群](../../../sincromisor-frontend/src/app/settings/react/components/lookingGlassSettingsSection.tsx)の`LookingGlassSectionHeader`と[項目補足](../../../sincromisor-frontend/src/features/settings/react/fields/settingsHelp.ts)を整理する。
- [共通状態カード](../../../sincromisor-frontend/src/features/settings/react/shell/settingsShell.tsx)へ変更が必要なら他の利用側も確認する。専用表示のための共通状態モデルは増やさない。

## テスト

変更対象の静的検査と型検査・ビルドを行う。`playwright-cli`で変更なし・次回反映・再開始必要・失敗の表示を確認する。固定データを使ってよく、文言整理のための専用機器での実描画試験は必須にしない。通常幅と狭幅で操作、数値入力、理由が読めることを確認する。

## ドキュメント同期の要否

[設定UI設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)と[設定項目一覧](../../../documents/design/frontend/setting-and-debug-ui/settings-items.md)のLooking Glass状態・反映タイミングの表示を同期する。外部契約は変更しない。
