# Review: task-260802033044-pion-phase-3-production-candidate-gate-3

## 判定

NEEDS_REVISION

直接依存のharnessが未レビュー・未実装で、Gateのcommand、injection、観測、artifact契約がまだ確定していない。
加えて現仕様のままではcanonical Gate 3の未観測条件を残してPASSでき、current designを切替前にPion正本へ誤更新し得る。

## 指摘事項

- [High] 直接依存
  `task-260802182106-pion-gate-3-production-validation-harness` は
  `meta.yaml:4-10`で`status: open`、`review: null`、`verdict: null`であり、
  `review.md:3-5`、`impl.md:3-5`も未記入、`artifacts/harness-contract.md`も存在しない。
  一方、本タスクは`task.md:12-14,35-38,53-55,62,66`で、その未確定成果物に固定command、
  deadline、injection、production観測点、artifact schemaを全面的に委ねている。
  これは`tasks/AUTHORING-CHECKLIST.md` 4.1の「直接依存がownership、timeout、
  production test seamを確定する場合は後続を先にAPPROVEDにしない」に該当する。
  harness taskを独立review、実装、評価PASS、mergeまで完了し、実在する
  `artifacts/harness-contract.md`と固定commitを照合した後に本タスクを再レビューすること。

- [High] Gate 3の全称inventoryが欠けており、canonicalな必須条件を未観測のままPASSできる。
  `task.md:59`は`documents/migration/pion/implementation-phases.md:132-143`だけを参照して
  直後の`:144`を落としており、受け入れ条件にも
  abnormal close時の全pipeline client / codec / PeerConnectionのexactly-once close（`:135`）、
  RTP / RTCP loop終了・packet loss・reorder drop・NACK / PLC・pacing lagの観測（`:138`）、
  新規session停止後のclose-timeout drain（`:141`）、aiortc rollback確認（`:144`）がない。
  また`task.md:15-22`は
  `documents/migration/pion/validation-plan.md:45-84`の一部scenarioしか固定しておらず、
  initial Offer single-flight、request ID衝突/tombstone、future revision、並行/失敗update、
  body/SDP/candidate/queueの境界matrix、DataChannel属性、pipeline reset後の旧generation排除、
  backoff継続などをPASS inventoryへ結び付けていない。
  `task.md:53-55`の「1対1対応」はsection名だけでは機械照合できないため、正本の各必須項目について
  owner、harness scenario、production観測点、一意な期待値、artifact行を列挙し、全項目PASSだけが
  Gate 3 PASSになるよう固定すること。Phase 4以降へ移す条件があるなら、task内で黙って除外せず
  migration正本側のphase boundaryも先に整合させること。

- [High] PASS時のcurrent-design更新方針が、実際の切替phaseと文書正本の役割に矛盾する。
  `task.md:80-83`はGate 3 PASS時点でPionをproduction candidateとして
  `documents/design/backend/services/sincro-rtc.md`へ反映し、Python現行backendをrollback対象とするが、
  現行composeはPython `sincro-rtc`を起動しており（`compose/sincro-rtc.yml:4-35`）、
  Pionをstable endpointへ切り替えてPythonをrollback専用にするのは
  `documents/migration/pion/implementation-phases.md:165-173`のPhase 5である。
  `documents/design/documentation-guide.md:7,19-22,28-43`もCurrent Designを現在有効な実装構造の正本とする。
  Gate 3ではPion candidateの実測結果と次phase可否をtask artifact / migration roadmapへ記録し、
  Pythonを現行正本から外さないこと。Pionのcurrent-design反映をGate 3で行う別判断なら、
  compose上のcurrent runtimeおよびPhase 5/6の同期時期との矛盾を解消する受け入れ条件が必要である。

- [High] Gate 3の`PASS|FAIL`とtask evaluatorの`PASS|FAIL`が同じ語で使われ、FAIL artifactを
  正しく作成した場合にtaskを完了扱いにするのか、未達として再実装へ戻すのかが一意でない。
  `task.md:7-8,31,39-42`はGate FAILも成果物として成立させる一方、
  `tasks/README.md:301-314`ではevaluator FAILは再実装、PASSだけがcloseである。
  artifactに独立した`gate_3_result`を持たせ、各scenarioのFAIL / 未観測がGate resultへどう集約されるか、
  Gate FAIL時のevaluator verdictと次状態（環境再実行、production修正task、harness修正task、
  `task_revision_required`）を固定すること。Gate FAILをtask成功としてcloseしないなら、その旨も明記すること。

- [Medium] 公開artifactと非公開原本の分離が本タスク単体では固定されていない。
  `tasks/README.md:164-174`ではraw replay、trace、screenshot、個人情報を含み得る原本を
  `work/private-artifacts/<task-id>/`へ置き、task artifactには集計、hash、再現手順だけを置く。
  harness contractのartifact schemaに、公開するraw count / 集計logと、非公開にするPlaywright trace、
  browser capture、音声・本文を明示し、`artifacts/gate-3-result.md`からはSHA-256と保管場所だけを参照すること。

## 実装者への申し送り

- harness実装とGate実測を別タスクにし、Gate実行中のharness / production code・comment変更を禁止する
  `task.md:41-49,72-76`の境界は妥当である。依存完了後もこの境界を緩めず、必要な変更は別taskへ戻すこと。
- observability依存は`meta.yaml`で`done` / `APPROVED` / `PASS`であり、
  managed panicのproduction inventoryとfocused test記録は
  `task-260802032922-pion-phase-3-observability-gate-3/task.md:145-165,220-221`および
  `impl.md:100-108,157-158`に存在する。Gate artifactへ取り込む際は対象commit、実行command、
  test名、inventory別close reason / process継続結果を対応付け、単なる「依存PASS」参照で代替しないこと。
- production codeを変更しないためsource comment auditを対象外とする判断自体は
  `documents/rules/source-comments.md`と整合する。設計Markdownだけを変更し、
  code/comment差分が生じた時点で本タスクを停止すること。
