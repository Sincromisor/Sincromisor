## 試行 1（2026-08-09）

production環境のPion設定値とNAT/firewall control-planeがworktreeに提供されず、Gate 4はFAILとした。既存コンテナは停止せず、実装worktreeを再開用に保持する。解除条件と直接の証拠は[Gate 4結果](artifacts/gate-4-result.md)を参照する。

## 試行 3（2026-08-09）

VPSのproduction相当環境で実行した。Pion/aiortcの対象commit、各切替状態、Chrome smoke、Pion SIGKILL、復旧状態をprivate evidenceとして同一実行中に保存した。PionはChrome ICE `connected` まで到達したが、既存Gate 3 mock browser testではproduction相当下流の1 turnを判定できず、必須出力は未観測だった。さらに `restart: always` はSIGKILL後にrestart attemptを開始しなかった。共有環境はPion healthy・active session 0へ復旧した。証拠と解除条件は[Gate 4結果](artifacts/gate-4-result.md)を正本とする。コード変更は行っていない。
