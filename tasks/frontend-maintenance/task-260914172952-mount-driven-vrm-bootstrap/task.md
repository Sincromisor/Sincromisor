# Reactの配置完了からVRMページを初期化する

## 背景・目的

Reactとシーンの入口が別々に読み込まれ、シーンは`MutationObserver`と5秒の待機でキャラクターDOMを探している。配置完了から必要なDOM参照を渡す起動へ置き換える。

元候補: `work/frontend-refacter.md` の番号6。優先度: 中。作業経路: 高リスク変更（Reactとページ初期化の所有・実行順序）。

調査基点は `de180727eaa284a5c37648a23c8b5afa29e28d38`。`work/` はGit管理外の補助資料であり、本書の問題・範囲・確認方法だけで着手できる。先行タスクによる移動・改名後は、同じ責務の現行ファイルを対象にする。

## 完了条件

- [x] 初期化が配置済みの2つのDOM参照を受け取り、DOM探索や任意の待機時間に依存しない。
- [x] 3ページがそれぞれ1回起動し、初期設定→初期化→OBSまたは手動開始の順序を維持する。
- [x] パネル読込を遅延させても配置前に開始せず、読込拒否時は観測可能なエラーを残して開始しない。

## 変更範囲・方針

- React側でキャラクター領域と操作領域の配置完了を通知し、そのDOM参照を先行タスクの初期化へ渡す。ページごとの起動元を1箇所に定め、HTMLから旧入口も実行する二重起動を残さない。
- ページ固有シーン・設定を既存ページモジュールに残し、3ページすべてを新しい接続へ更新してからDOM探索・`MutationObserver`・専用待機タイマーを削除する。
- ページ側が1回の初期化を所有し、Reactの再描画や配置通知の再実行で新しいアプリを作らない。操作パネルの読込・描画準備が失敗した場合はエラーを報告し開始しない。MPA内のアンマウント・再生成機能は追加しない。

対象外: SPA化、ページ固有シーン統合、カメラやRTCの生存期間変更、ページ内シーン再生成・資源破棄API追加。

主な参照元・変更箇所:

- [bootstrapSincroPageAppShell.tsx](../../../sincromisor-frontend/src/app/shell/bootstrapSincroPageAppShell.tsx)
- [sincroPageAppShell.tsx](../../../sincromisor-frontend/src/app/shell/sincroPageAppShell.tsx)
- [sincroVrmInitializer.ts](../../../sincromisor-frontend/src/character/scene/sincroVrmInitializer.ts)
- [mainReact.tsx](../../../sincromisor-frontend/src/pages/simpleVrm/mainReact.tsx)
- [mainVrm.ts](../../../sincromisor-frontend/src/pages/simpleVrm/mainVrm.ts)
- [index.html](../../../sincromisor-frontend/src/pages/simpleVrm/index.html)
- [mainReact.tsx](../../../sincromisor-frontend/src/pages/vrm360/mainReact.tsx)
- [mainVrm360.ts](../../../sincromisor-frontend/src/pages/vrm360/mainVrm360.ts)
- [index.html](../../../sincromisor-frontend/src/pages/vrm360/index.html)
- [mainReact.tsx](../../../sincromisor-frontend/src/pages/lookingGlassVrm/mainReact.tsx)
- [mainVrmLookingGlass.ts](../../../sincromisor-frontend/src/pages/lookingGlassVrm/mainVrmLookingGlass.ts)
- [index.html](../../../sincromisor-frontend/src/pages/lookingGlassVrm/index.html)

## 依存関係

- [VRMページの初期化と自動開始を明示的な段階へ分ける](../task-260914172951-explicit-vrm-initialization/task.md) の完了後に着手する。

## 確認方法

- 実際のReactルートと初期化接続で、遅延したパネル読込・読込失敗・配置通知再実行を確認する。ブラウザーで確認する際はplaywright-cliスキルに従う。
- 3ページのDOM配置と起動前設定、通常ページの手動／OBS模擬開始を確認する。npm --prefix sincromisor-frontend run buildで6ページの出力と公開URL維持を確認する。
- 変更ファイルを対象にBiomeと`TypeScript`の型確認を行う。モジュール移動・改名またはページ入口を変更した場合は `npm --prefix sincromisor-frontend run build` も実行する。
- ブラウザー確認を実施する場合は `playwright-cli` スキルを使う。実写・カメラ原本を保存する必要がある場合はタスク管理の非公開領域の規則に従う。
- 起票時に独立レビューを行う。実装時は高リスク変更の手順に従い、独立評価と `npm run gate` に加えて上記の接続確認を行う。

## 文書同期

- [app-shell.md](../../../documents/design/frontend/app-shell.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。
- [pages.md](../../../documents/design/frontend/pages.md) の変更する責務・参照パス・起動順序に対応する記述を同期する。

通信契約と保存形式は変更しない。文書だけのタスクにせず、必要な実装・既存テストの追従・文書同期を同じタスクで完了させる。

## 実施結果

3ページのHTML入口を `mainReact.tsx` に統一し、操作パネル読込後のReact配置通知から2つのDOM参照を渡して初期化する。初期化は1回だけ試み、旧DOM探索・MutationObserver・5秒タイマーを削除した。読込・描画準備・初期化失敗は共通ログへ報告する。

- 実際のReactルートを使うブラウザーテスト3件が成功した。3ページのDOMと設定、通常ページの手動／OBS開始、パネル遅延・読込拒否・描画拒否、配置通知2回でも1回だけ初期化する条件を確認した。機器・RTCの開始だけを代替した。
- 型確認を含むビルドで6ページの出力と公開URLを確認した。全テスト624件が成功し、既存2件はスキップした。変更したTypeScriptのBiomeと文書の整形も成功した。
- `npm run gate` は既存の対象外Markdown整形不整合で失敗するため、対象確認・ビルド・全テストを個別に確認した。
- 設計同期・コメント点検: PASS。実機の360度・Looking Glass確認は未実施。独立評価は `eval.md` を参照する。

ブラウザー確認の再実行:

```sh
npm --prefix sincromisor-frontend run dev -- --host 127.0.0.1 --port 5176
cd sincromisor-frontend
PLAYWRIGHT_HTML_OPEN=never ../node_modules/.bin/playwright test tests/vrm/bootstrap.spec.ts --workers=1 --reporter=line
```
