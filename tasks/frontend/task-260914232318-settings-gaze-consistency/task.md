# 視線設定と自動ミュートの整合性を修正する

## 背景 / 目的

WebUIの設定を保存・復元する前提として、一括適用でも依存する値と操作可否が矛盾しない状態にする。
調査基点は `d3031df5`。`DialogManager.updateSettings()` は視線変更時に開始条件だけを再計算し、`updateAutoMuteStatus()` を呼ばない。[現行設計](../../../documents/design/frontend/setting-and-debug-ui/settings-design.md)の「視線無効時は自動ミュートをオフへ戻す」と一致しない経路がある。

## 完了条件

- [x] 視線をオフにすると自動ミュートの値もオフになり、操作不可になる。視線を再度オンにすると自動ミュートを操作できるが、勝手にオンには戻らない。
- [x] 視線と自動ミュートを同時に指定しても、プロパティの順序や変更前の操作可否で結果が変わらない。視線オン・自動ミュートオンの有効な組は反映し、視線オフ・自動ミュートオンの組は矛盾を残さない。
- [x] 端末・ページの利用不可による制限を維持する。初期化の利用可否更新でも、利用不能な視線機能が再度有効にならない。
- [x] 起動前後のUIへ値・操作可否・案内をまとめて通知し、購読者に途中の矛盾した状態を見せない。

## 変更範囲と方針

[設定更新](../../../sincromisor-frontend/src/features/dialog/model/dialogManager.ts)、[状態保持](../../../sincromisor-frontend/src/features/dialog/model/dialogStateStore.ts)、[依存規則](../../../sincromisor-frontend/src/features/dialog/model/dialogSettingsPolicy.ts)、必要なら[起動時の利用可否更新](../../../sincromisor-frontend/src/character/scene/sincroVrmInitializer.ts)を修正する。
全呼び出し元を確認し、既存の一括通知を利用して共通経路で直す。UIへの規則の複製、永続化、今回の視線・自動ミュートに不要な設定規則の変更は含めない。
[通常設定の保存](../task-260914232323-persist-webui-settings/task.md)が後続となる。

## 確認方法と文書同期

[既存の設定テスト](../../../sincromisor-frontend/src/features/dialog/model/__tests__/dialogSettingsAccess.test.ts)に、切り替え・一括指定・利用不可・通知の最小回帰確認を追加する。起動側を変更した場合は既存の接続経路も確認する。
変更範囲の静的検査とフロントエンドの型確認・ビルドを行う。設定UI設計の依存規則と実装を一致させる。通信契約、設定キー、既定値は変更しない。

## 実施結果

視線を先に確定して自動ミュートを適用し、ページと端末の利用可否を両方維持するよう共通経路を修正した。設定設計と変更理解範囲のコメントを点検済み。

- 対象テスト: 設定アクセスと3ページ起動の2ファイル・4件が成功。
- 対象Biome、TypeScript型確認を含むビルドが成功。
- 変更Markdownの整形・確認、タスク状態・索引検査が成功。
