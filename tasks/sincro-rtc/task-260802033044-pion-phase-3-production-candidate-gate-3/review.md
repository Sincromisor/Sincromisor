# レビュー: task-260802033044-pion-phase-3-production-candidate-gate-3

## 判定

APPROVED

## 理由・申し送り

- Gate 3は、既存repository testと現行Frontendによる1 turnのbrowser smokeでPion移行経路を確認する。
- 固定WAVはbrowser入力が非無音PCMとして下流へ届くことだけを確認し、SpeechExtractorの品質評価には使わない。
- test用の発話境界判定、2 turn、強制ICE restart、FD/socket baseline、Gate専用proxy・report・resource collectorは削除する。
- transientな失敗を1回だけで製品FAILへ固定せず、原因を直した最終コードで必須commandを再実行する。
- ICE restart、複数turn、詳細resource収束、production相当networkは既存repository testまたはPhase 4で確認する。
