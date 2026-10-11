# 確認上の制約

## 既存試験の環境依存

Go試験は`TMPDIR=/private/tmp GOCACHE=/private/tmp/sincro-rtc-integration-gocache`で実行した。
macOSの既定一時ディレクトリでは、`harnessenv`の既存比較が`/var`と実体の`/private/var`を区別して失敗するため、実体パスを使用した。
ループバック待ち受けを使う試験はサンドボックス外で実行した。

`consuldev`では、模擬子プロセスの準備完了を120msで待つ既存試験が不安定だった。
改名後は`TestOriginalAndCleanupFailuresPreserveBothSentinels/registration-and-deregister`で、登録段階へ到達する前に`ErrReadiness`となった。
変更前のHEADを`git archive`で一時ディレクトリへ取り出し、旧`-tags=gate3`で比較した。
1回の実行は成功し、5回の限定実行では同じテスト・同じ120msの準備時間切れが再現した。
改名後の初回実行では`TestReadinessFailuresAreFiniteAndCleanupOwnedProcess/timeout`でも、準備完了前のSIGTERMに起因する`ErrCleanup`の併発を観測した。

Consulの起動・終了処理と期限・合否条件は変更していない。試験用サービスID、import、タグ、コメントのみの変更であることを差分で確認し、既存の環境依存を理由とした試験の期限変更は行わなかった。

## 未実行の確認

実ブラウザーを含む`TestFrontendBrowserHarness`は、ConsulとFFmpegがPATHになく、新しい環境変数で実行環境が準備されていないため未実行。
新タグでのコンパイルと静的検査、Playwrightの設定読み込みと1件の試験検出までを確認した。会話1往復の実行成功は今回の確認結果には含まれない。
