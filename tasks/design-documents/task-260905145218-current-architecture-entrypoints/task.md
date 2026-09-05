# 初動ガイドと設計索引を現行構成へ同期

## 背景 / 目的

2026-09-05、HEAD `1801836a8f75691d08e691471a681ccd50eb7c73` と作業ツリーの初動ガイドを確認した。サーバーをPythonだけで説明し、WebRTC変更先として削除済み `RTCSignalingServer.py` を指している。一方、現行RTCはGo/Pionである。設計索引にも、削除済みBabylon.js実装を削除予定として扱う説明が残る。

後続エージェントの調査先・変更範囲の誤認を防ぐため、現在有効な入口文書だけを実体に合わせる。根拠は既存実装と、ローカル／オンプレミスでのサービス提供というユーザー要求である。

## 完了条件（受け入れ条件）

- [x] AGENTS.mdの概要・ディレクトリマップ・WebRTC変更時の確認先が、Go/Pion RTC、Python下流サービス、現行フロントの実在する配置に一致する。詳細な契約は既存正本へ誘導する。
- [x] 設計索引の削除済み・廃止予定の説明を実際のファイルと依存関係で区別する。Babylon.jsの古い削除予定を修正し、Nue-ASRなど存在するが廃止予定の実装まで削除済みと書かない。
- [x] 初動ガイドと全体構成に、ローカル／オンプレミス提供を前提とし、外部サービスのAPIを採用前提にしないことを短く明記する。Difyは管理下の環境へ配置できる既存構成として扱う。
- [x] ページ構成とREADMEのビルド対象説明を `vite.config.js` に照合し、通常ビルド・実験用ページの説明を一致させる。
- [x] 変更した入口にあるコードパス・相対リンクが解決でき、現行仕様として削除済みPython RTCへ誘導しない。変更MarkdownのPrettier確認を行う。

## 設計判断と範囲

通常の文書修正として扱う。既存の作業規約を増やさず、構成・導線・提供前提の誤りだけを修正する。履歴資料、完了タスク、ADRの過去時点の記述は書き換えない。全面的な日本語化やコメント監査、タスク完了規則の改定、本番コードの再構成は対象外である。

起票時点でAGENTS.mdにユーザーの未コミット変更がある。実装時は最新差分を読み、ユーザーの変更を保持した局所編集を行う。既存変更を巻き戻したり、無関係な差分を自分の成果へ含めたりしない。

対象:

- [初動ガイド](../../../AGENTS.md)
- [設計索引](../../../documents/design/index.md)
- [全体構成](../../../documents/design/architecture/overview.md)
- [ページ構成](../../../documents/design/frontend/pages.md)
- [README](../../../README.md)のビルド対象説明のみ

確認先:

- [RTCサービス設計](../../../documents/design/backend/services/sincro-rtc.md)
- [Go起動入口](../../../sincromisor-server/sincro-rtc/cmd/sincro-rtc)
- [RTCシグナリング](../../../sincromisor-server/sincro-rtc/internal/signaling)
- [フロントのビルド設定](../../../sincromisor-frontend/vite.config.js)
- [フロント依存関係](../../../sincromisor-frontend/package.json)

READMEの起動・Dify・ネットワーク案内は [ローカル起動手順タスク](../../infrastructure/task-260905145218-local-startup-prerequisites/task.md) が扱う。同じファイルを変更するため、両タスクを並行実装する場合は差分を分離する。実装上の依存関係はない。

## 確認方法

`rg --files`、参照先の存在確認、ビルド設定との照合、変更MarkdownのPrettier確認を行う。アーカイブや過去タスク内に旧名が残ることは失敗条件にしない。文書のみの変更のため、GPU・ネットワーク疎通・フロント全テストは完了条件にしない。確認結果をタスク記録へ残す。

## 実施結果

通常の文書修正として実施。Viteの6入力と公開経路、Go/Pionの起動・シグナリング・RTC・パイプラインの配置、NeMo・Nue-ASR・旧MinIOの残存、Babylon.js依存の削除を照合した。変更した入口文書の相対リンクと追加したコードパスの存在確認、Prettier、索引検査に合格。`tasks:check` は既存の `task-260904005741-fix-face-landmarker-timestamp` に `review.md`・`impl.md`・`eval.md` がないため失敗した。今回のタスクの不整合は報告されていない。文書点検: PASS。コード変更はなく、GPU・通信・フロント全試験は対象外。AGENTS.mdの既存変更は作業ツリーに保持し、今回の局所変更だけをコミットする。
