# VRMページの初期化と自動開始を明示的な段階へ分ける

## 背景・目的

`SincroVRMInitializer`のコンストラクターで購読・キャッシュ復元・OBS自動開始を行い、派生ページの既定値やsimple-vrmのURL設定はその後に適用される。DOM待機の置換前に、設定確定と起動の順序を明示する。

元候補: `work/frontend-refacter.md` の番号6。優先度: 中。作業経路: 高リスク変更（設定と自動開始の順序）。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] コンストラクターからOBS自動開始が除かれ、初期設定確定→初期化→必要時の自動開始をコード上で追える。
- [x] simple-vrmの既知`talkMode`値と派生ページ既定値が、手動開始・OBS自動開始のいずれでも開始時に適用済みとなる。これは従来のOBS経路で適用が後になる順序を是正する内部起動順序の変更として記録する。
- [x] 開始操作が重なってもシーン・挨拶を重複生成せず、初期化失敗時に部分的な開始へ進まない。

## 変更範囲・方針

- 依存を組み立てる生成処理と、購読・機器利用可否・キャッシュ復元を始める明示的初期化処理を分ける。ページ既定値と許可されたURL設定を確定してからOBS自動開始を判断する。
- 既存bootstrapはDOM待機を維持し、新しい段階を既存3ページから必ず呼ぶ。設定をDOM配置より前へ移す変更は次タスクへ残す。
- 開始はSincroAppController.startの既存重複抑止を使い、挨拶・シーン開始・ダイアログ終了を1回に保つ。初期化の失敗はページ入口で報告し、失敗した初期化から開始しない。キャッシュ取得失敗は既存どおりログと代替表示で継続する。

対象外: DOM待機の置換、通信成功まで待つ起動方式への変更、VRMロードの再試行機構、サムネイル保存方式変更。

主な参照元・変更箇所:

- [sincroVrmInitializer.ts](../../../sincromisor-frontend/src/character/scene/sincroVrmInitializer.ts)
- [sincroVrm360Initializer.ts](../../../sincromisor-frontend/src/character/vrm360/sincroVrm360Initializer.ts)
- [sincroLookingGlassVrmInitializer.ts](../../../sincromisor-frontend/src/character/lookingGlass/sincroLookingGlassVrmInitializer.ts)
- [mainVrm.ts](../../../sincromisor-frontend/src/pages/simpleVrm/mainVrm.ts)
- [mainVrm360.ts](../../../sincromisor-frontend/src/pages/vrm360/mainVrm360.ts)
- [mainVrmLookingGlass.ts](../../../sincromisor-frontend/src/pages/lookingGlassVrm/mainVrmLookingGlass.ts)
- [sincroAppController.ts](../../../sincromisor-frontend/src/app/controller/sincroAppController.ts)

## 依存関係

- [姿勢設定とシーンの接続をアプリ側へ集約する](../task-260914172951-bridge-pose-settings/task.md) の完了後に着手する。

## 確認方法

- 実際のページ初期化の組み立てを使い、派生ページ設定・URL値・OBSフラグ・重複開始を小さな結合テストで確認する。RTC接続は代替し、起動順序を観測する。
- 開発サーバーの3ページで起動前設定を各1回確認し、通常ページの開始を確認する。OBSはobsstudioの存在を模擬し、本物のOBSを必須にしない。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。
- 起票時に独立レビューを行う。実装時は高リスク変更の手順に従い、独立評価と `npm run gate` に加えて上記の接続確認を行う。

## 文書同期

- [app-shell.md](../../../documents/design/frontend/app-shell.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。
- [pages.md](../../../documents/design/frontend/pages.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

ページ既定値と許可済みURL設定を初期化へ渡し、機器利用可否確認・設定適用・購読とキャッシュ復元・OBS自動開始を明示した。従来は自動開始後だった派生設定とURL値が開始前に適用される内部起動順序へ是正した。DOM待機は本タスクでは維持した。

- 実際の3ページ入口による手動／OBS、既知・不正URL値、重複開始、初期化失敗とキャッシュ失敗を確認した。型確認を含むビルドと全テスト624件が成功（既存2件スキップ）。独立評価PASS。
- ブラウザーで3ページの起動前設定、OBS模擬開始時の会話モード、再開始時に挨拶とシーンが増えないことを確認した。機器・RTC開始は代替した。
- 全体ゲートは既存の対象外Markdown整形不整合を残す。対象文書の整形と個別のビルド・全テストは成功した。
- 設計同期・コメント点検: PASS。既知の実装上の残リスクはない。
