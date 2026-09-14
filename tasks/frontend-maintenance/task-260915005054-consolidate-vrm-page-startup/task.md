# VRMページの起動処理をアプリ層へ移して共通化

## 背景 / 目的

SincroVRMInitializer は character/scene にあるが、アプリ生成、機器確認、設定復元、挨拶、ダイアログ操作、サムネイル保存を調停する。また、通常・360度・Looking Glassの各初期化処理に、シーン開始後の保持・姿勢設定・通常設定反映が重複する。

2026-09-15のフロントエンド整理提案に基づく起票。調査時のHEADは `f5dd6d37dbe6ddcde4a2e5fe6e9ce059222acddf`。

優先度: 中。作業区分: 統合変更。

依存なし。

## 完了条件（受け入れ条件）

- [ ] 3種類のページ初期化処理と配置済みDOM参照の契約が app 側にあり、character のシーンからアプリ起動処理を参照しない。
- [ ] シーンの開始・保持・姿勢設定・通常設定同期の手順が共通実装にあり、派生処理はシーンの種類・ページ既定値・固有起動設定を指定する。
- [ ] 配置完了→機器利用可否→設定復元→購読とキャッシュ復元→手動またはOBS開始の順と、初期化失敗時に開始しない挙動を維持する。
- [ ] 通常ページの初期上半身構図、各ページのXR設定とLooking Glass導線、挨拶・シーンの重複起動抑止、サムネイル表示と自前URLの解放を維持する。

## 設計判断

app/bootstrap に既存初期化処理を移す。継承構造を利用してシーン生成の差分と共通開始手順を分ける。シーン自身の描画・XR・リソース所有権は移さず、購読の寿命も変えない。汎用ページ登録機構や新しい設定形式は作らない。

## スコープ境界

基底と2派生の初期化処理、各ページ入口、Reactの配置通知契約、参照テスト・文書を対象にする。設定モデルと較正の所有者変更は別タスクに従い、実装済みなら新しい窓口を利用する。

## 実装の参照先

- [sincroVrmInitializer.ts](../../../sincromisor-frontend/src/character/scene/sincroVrmInitializer.ts)
- [sincroVrm360Initializer.ts](../../../sincromisor-frontend/src/character/vrm360/sincroVrm360Initializer.ts)
- [sincroLookingGlassVrmInitializer.ts](../../../sincromisor-frontend/src/character/lookingGlass/sincroLookingGlassVrmInitializer.ts)
- [bootstrapSincroPageAppShell.tsx](../../../sincromisor-frontend/src/app/shell/bootstrapSincroPageAppShell.tsx)
- [sincroPageAppShell.tsx](../../../sincromisor-frontend/src/app/shell/sincroPageAppShell.tsx)
- [mainVrm.ts](../../../sincromisor-frontend/src/pages/simpleVrm/mainVrm.ts)
- [mainVrm360.ts](../../../sincromisor-frontend/src/pages/vrm360/mainVrm360.ts)
- [mainVrmLookingGlass.ts](../../../sincromisor-frontend/src/pages/lookingGlassVrm/mainVrmLookingGlass.ts)

## 確認方法

vrmInitialization と sincroAppController の既存テストで3ページの既定値、OBS開始の順序、初期化失敗と重複開始を確認する。`npm --prefix sincromisor-frontend run build` を実行し、開発環境の通常ページで開始からシーン表示を一度確認する。新たなLooking Glass実機対応や性能測定は要求しない。

実装時の確認範囲は [タスク管理](../../README.md) に従う。確認結果は実装時に記録する。起票段階で実装確認済みとは扱わない。

## ドキュメント同期

初期化処理の所属とページ差分の責務を同期する。公開URL・通信契約・設定名を維持する。

- [app-shell.md](../../../documents/design/frontend/app-shell.md)
- [pages.md](../../../documents/design/frontend/pages.md)
- [overview.md](../../../documents/design/frontend/character/overview.md)
