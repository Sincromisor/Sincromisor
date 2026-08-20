## 試行 1（2026-08-09）

production環境のPion設定値とNAT/firewall control-planeがworktreeに提供されず、Gate 4はFAILとした。既存コンテナは停止せず、実装worktreeを再開用に保持する。解除条件と直接の証拠は[Gate 4結果](artifacts/gate-4-result.md)を参照する。

## 試行 3（2026-08-09）

VPSのproduction相当環境で実行した。Pion/aiortcの対象commit、各切替状態、Chrome smoke、Pion SIGKILL、復旧状態をprivate evidenceとして同一実行中に保存した。PionはChrome ICE `connected` まで到達したが、既存Gate 3 mock browser testではproduction相当下流の1 turnを判定できず、必須出力は未観測だった。さらに `restart: always` はSIGKILL後にrestart attemptを開始しなかった。共有環境はPion healthy・active session 0へ復旧した。証拠と解除条件は[Gate 4結果](artifacts/gate-4-result.md)を正本とする。コード変更は行っていない。

## 試行 3（2026-08-10）

限定後のGate 4で許可された既存browser UI観測手順をリポジトリと指定runbookから特定できなかったため、外部環境を変更せずblockedとした。固定文mock test、新規oracle、追加調査は実行していない。解除条件は[Gate 4結果](artifacts/gate-4-result.md)を正本とする。

## 試行 4（2026-08-21）

Pionの実環境1 turnと通常終了後の収束を確認した。aiortcは起動できたが、既知のpublic media UDP未公開制約によりbrowser接続が`disconnected`となった。ユーザー承認により、aiortc rollback後の会話成立をGate 4の必須条件から外し、Pion切替後はforward-fixする方針へ変更した。詳細な証拠と残リスクは[Gate 4結果](artifacts/gate-4-result.md)を正本とする。
