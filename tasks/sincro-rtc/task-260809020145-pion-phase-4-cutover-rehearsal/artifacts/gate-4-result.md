# Gate 4 結果

## 実行情報

- commit: `9408dd6e5fca32b2e6973950d10627556182baaa`
- 実行日時: 2026-08-09T23:11:17+09:00 から 23:14:55+09:00
- 実行者: Codex
- 環境: `gloria@malvales.hachune.net` の `/tmp/sincromisor-gate4-rehearsal`。public IPv4、TCP 8001、固定 UDP 3479、VPS VPN 経由の既存下流 4 service を使用した。
- 判定: FAIL

## 段階結果

### Pion 切替、Chrome smoke、収束

- Pion は `running/healthy`、readiness HTTP 200、`/statuses` は `sessions: 0`、`sincro_rtc_sessions_active 0` で開始した。
- public HTTPS origin の Chrome fake microphone smoke は offer/candidate と ICE `connected` まで到達した。しかし既存 Gate 3 browser test が要求する mock 固定文は 60 秒以内に表示されず、1 turn の利用者/応答 text、telop、非無音の合成音声を確認できなかった。
- browser test 終了後のPion lifecycle logでは `connected` の後に `disconnected` を記録した。終了後に active session は 0 へ収束した。
- Firefox は Chrome の必須 1 turn が不成立となった時点で追加実行しなかった。

### Pion process restart

- `docker kill sincromisor-sincro-rtc-pion-1` 後、container は `restart=always` にもかかわらず `exit=137`、`restart_count=0` のまま自動復帰せず、readiness は unavailable だった。
- `docker compose --project-name sincromisor --profile pion up -d --no-build --no-deps sincro-rtc-pion` で手動復旧し、ready、`sessions: 0` に戻した。

### aiortc rollback

- Pion 停止後、`docker compose --project-name sincromisor --profile full up -d --no-build --no-deps sincro-rtc` で aiortc を起動した。対象commitはPionと同じで、statusは `sessions: 0`、`SINCRO_CONSUL_AGENT_HOST` は VPS VPN の既存 Consul endpoint を参照していた。Frontend と下流 service は rebuild していない。
- Chrome fake microphone smoke は実行したが、既存 Gate 3 browser test の mock 固定文を満たさず、応答 text、telop、非無音の合成音声を確認できなかった。Firefox は同じ必須条件が Chrome で不成立のため未実行とした。
- aiortc 停止後に Pion を再起動し、最終状態は Pion `running/healthy`、readiness HTTP 200、`/statuses` は `sessions: 0`、`sincro_rtc_sessions_active 0` である。

## 証拠、直接原因、復旧

- private evidence: VPS の `work/private-artifacts/task-260809020145-pion-phase-4-cutover-rehearsal/attempt-2-20260809T141117Z/` に次を保存した。`01-pion-before.txt`、`02-pion-chrome-sanitized.log`、`03-pion-chrome-command.txt`、`04-pion-crash.txt`、`05-pion-manual-recovery.txt`、`06-aiortc-rollback-ready.txt`、`07-aiortc-chrome-sanitized.log`、`08-aiortc-chrome-command.txt`、`09-final-pion-recovery.txt`。session ID、SDP、candidate、会話、音声 payload は保存・転載していない。
- 直接原因 1: production相当下流を対象にした既存browser testはGate 3のmock固定文を検査するため、実環境の 1 turn 出力を受け入れ条件として判定できず、必要なtext/telop/audioが未観測のままになった。
- 直接原因 2: Pion containerのDocker restart policyはSIGKILL後のrestart attemptを開始せず、restart条件を満たさなかった。
- 復旧: shared service影響を止めるため、Pionを `--no-build --no-deps` で再起動してhealthy・active session 0へ戻した。
- 解除条件: production相当下流をそのまま観測できる既存runbookのsmoke手順と、SIGKILL後にrestart policyが実際にPionを自動復帰するDocker/compose状態を用意してから、本runbookを最初から再実行する。

## 試行 3（2026-08-10）

- 判定: blocked
- 実行前に既存browser手順を確認したが、production相当のbrowser UIで利用者/応答text、telop、非無音音声を観測する
  既存手順はリポジトリと指定runbookに存在しなかった。確認できた過去browser testはmock固定文を前提としており、
  限定後のGate 4では使用禁止である。
- Pion開始、Chrome smoke、aiortc rollback、Docker/network調査、Firefox、SIGKILL、反復試験は実行していない。
  したがって共有環境はこの試行による変更を受けていない。
- 解除条件: 実下流を使い、固定本文に依存せずbrowser UIで必要な3出力を観測する既存の最小手順を参照可能にする。
  その後、限定runbookを最初から1回だけ実行する。

## 試行 4（2026-08-21）

- commit: `7f4324673d1b025353a98681130c3d94f6f0735f`
- 実行日時: 2026-08-21 JST。UTC logの開始は16:13:05、Pion smokeは16:15:26、aiortc診断開始は16:15:49、
  aiortc readyは16:16:03、接続失敗の確認は16:19:16である。
- 環境: VPSのproduction相当環境。Frontendと下流serviceはrebuildしていない。
- 判定: PASS

### Pion browser UI smoke、収束

- Pion smoke前後にcontainerは`healthy`、readinessはHTTP 200、`/statuses`は`sessions: 0`であり、Chrome UIではICE `connected`、
  利用者text、応答text、telop、非無音の合成音声、通常終了を確認した。
- 通常終了後のstage countはrecognizer 2、processor request 2、processor result 2、synthesizer 1、reset 0、close 1である。
  Pion停止は1.75秒で完了し、sessionと下流接続は収束した。

### aiortc起動診断と最終復旧

- aiortcは起動して`healthy`、`/statuses`は`sessions: 0`となった。しかしpublic経路のbrowser接続は
  `disconnected`となり、確認後の`/statuses`は`sessions: 3`だった。これは既知のmedia UDP未公開制約と整合する。
- ユーザー承認により、aiortcの会話成立はGate 4の合否条件から外し、Pion切替後の障害はforward-fixする方針へ変更した。
  aiortc起動確認は診断情報に留める。
- aiortc停止後にPionを起動し、最終状態はPion `healthy`、readiness HTTP 200、`/statuses`は`sessions: 0`である。

### 証拠と残リスク

- private evidence: VPSの`work/private-artifacts/task-260809020145-pion-phase-4-cutover-rehearsal/attempt-4-20260821/`に保存した。
  session ID、会話本文、音声payload、SDP、candidateはGit artifactへ転載していない。
- 残リスク: aiortcはpublic media UDP未公開のため会話接続できない。この経路はPion切替後の運用rollback先ではない。
