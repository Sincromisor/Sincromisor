# 段階 5 メンテナンス切替手順書

## 目的

通常プロファイルのPion `sincro-rtc` で1 往復を確認し、利用再開後の安定性を観測する。
実測値と未観測事項は[Gate 5結果](../../../tasks/sincro-rtc/task-260822233904-pion-phase-5-maintenance-cutover/artifacts/gate-5-result.md)へ記録する。

この手順は[運用移行と現行版の修正で対応](rollout-and-operations.md)のプロファイル、ネットワーク、終了処理契約に従う。
フロントエンドと下流Python サービスはすでに起動済みの画像を使い、切替で再ビルドしない。
停止切替のため、接続中セッションは失われ、利用者は再接続が必要である。

## 切替前確認

メンテナンス開始を告知し、通常の実環境Docker Compose用環境変数を読み込む。ネットワーク設定を再監査しない。
PionがreadyになりChromeで接続できることを、固定UDP ポート、NAT、ファイアウォールを含む環境前提の確認とする。

## Pion通常起動と準備状態

新規セッションを止め、終了時間切れ後に既存セッションを終了する。セッションの移送はしない。

### 検証用VPSの旧サービスを止める（一回限り）

`work/vps.md` の検証用VPSは、更新前改訂番号のプロジェクト `sincromisor` で旧サービス
`sincro-rtc-pion` がTCP 8001と`SINCRO_PION_MEDIA_UDP_PORT`（現在3479/udp）を公開している。
この手順は**Pion通常サービスを含むコミットをVPS チェックアウトへ反映する前**に実行する。メンテナンス告知で
新規セッションを止め、固定エンドポイントの`/statuses`で`"sessions":0`を確認してから、更新前のDocker Compose定義で停止する。

```sh
# 更新前のVPS checkoutで実行する。外部Consulは10.39.2.8:8500を継続利用する。
curl --fail --silent --show-error \
  https://sincromisor-staging.negix.org/api/v1/RTCSignalingServer/statuses
docker compose -p sincromisor --profile pion stop -t 6 sincro-rtc-pion
test -z "$(docker ps --filter publish=8001 --format '{{.Names}}')"
test -z "$(docker ps --filter publish=3479/udp --format '{{.Names}}')"
```

ここでTCP 8001とUDP メディアポートが解放されるまで、新サービスを起動せず利用を再開しない。次にVPS チェックアウトへ
Pion通常サービスを含むコミットを反映し、`SINCRO_PION_CONSUL_HTTP_HOST=10.39.2.8` と
`SINCRO_PION_SERVICE_BIND_HOST=10.39.2.1` を維持したまま新画像をビルドする。以降のコマンドは更新後のDocker Compose定義で実行する。

```sh
docker compose -p sincromisor --profile rtc build sincro-rtc
docker compose -p sincromisor --profile rtc up -d --no-deps sincro-rtc
curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

成功判定は`/health/ready`と`/statuses`がHTTP 200を返すこととする。
PionはConsul登録と起動時の依存関係検証後、非`draining`時だけreadyになる。準備状態失敗、ポート競合、または
Consul登録失敗では動作確認へ進まず、証拠を保存してPionを現行版の修正で対応する。

## 共通ブラウザ UI 動作確認

Pionで、固定エンドポイントとGate 3で成立済みのChromeを使い、次の手順を1回行う。
フロントエンドと下流Python サービスは、切替前から起動している画像をそのまま使い、再ビルドしない。

1. `simple-vrm`ページを開き、マイク権限を許可してUIから会話接続を開始する。診断 ConsoleのICE 状態が
   `connected`または`completed`になることを確認する。
2. 通常の短い発話を1回行い、会話の完了を待つ。実下流の利用者・応答本文は可変であるため、固定文と比較しない。
3. ブラウザ UIで利用者テキスト、応答テキスト、テロップが表示され、合成音声が非無音で再生されることを確認する。
4. UIから通常終了し、`/statuses`で有効セッションが収束することを確認する。

既存Gate 3 Playwright テストは模擬サービスの固定文を検査するため、Gate 5の判定には使わない。
新しいブラウザ検証基盤、入力注入、ブラウザの組み合わせは追加しない。会話本文、音声、セッション ID、SDP、候補は
Git 成果物へ保存しない。

## Pion 動作確認

Pion起動後に[共通ブラウザ UI 動作確認](#共通ブラウザ-ui-動作確認)を1回実行する。

対象`session_id`でPion ログを絞り、`recognizer_result_received`、`processor_request_sent`、
`processor_result_received`、`synthesizer_result_received`の最後の到達段階を確認する。正常段階の直前に
最初の`pipeline_reset_requested`があれば、その`service`と有限の`cause`から閉じた下流接続を確認する。
段階・リセットログには本文・VoiceText・音声・未加工の送受信データを出力しないため、Docker Compose ログやGit 成果物へそれらを転載しない。

指標とDocker Compose ログは原因調査に必要な最小範囲だけを、Git管理外の
`work/private-artifacts/task-260822233904-pion-phase-5-maintenance-cutover/`へ保存する。セッション ID、SDP、
候補、会話、音声送受信データをGit 成果物や結果成果物へ転載しない。

`reason=codec_error` を確認した場合は、同じログの `codec_error_kind` と `codec_error_reason` を記録して後続タスクを判断する。
`codec_error_reason` は `empty_voice`、`decoded_pcm_invalid`、`speaking_time_mismatch`、`mora_timing_invalid`、
`input_timing_invalid`、`unknown` の固定値だけを使う。`unknown` は `unsupported`、`limit`、`timeout`、`process`、
復号コンテキスト不正、または非`DecodeError`を含む。送受信データを転載せず非公開成果物で再現条件を確認してからタスク化する。
セッション IDと音声送受信データは、種別を記録する場合もGit 成果物へ転載しない。

```sh
EVIDENCE_DIR=work/private-artifacts/task-260822233904-pion-phase-5-maintenance-cutover
mkdir -p "${EVIDENCE_DIR}"
curl --fail --silent --show-error http://127.0.0.1:8001/metrics >"${EVIDENCE_DIR}/pion-metrics.prom"
docker compose --profile rtc logs --no-color sincro-rtc >"${EVIDENCE_DIR}/pion.log"
```

## Gate判定と再実行

Gate 5の移行必須条件は、通常プロファイルのPionで現行フロントエンドから接続し、1 往復の会話、テキスト、テロップ、非無音音声が成立すること、
Pion セッション終了後に有効セッションと下流接続が収束することだけとする。公開UDP / NAT / ファイアウォールはこれらを観測する環境前提である。

aiortc動作確認、Pion プロセス異常終了自動復帰、長時間連続稼働、性能比較、障害注入、ブラウザの組み合わせの拡張、Docker挙動調査、環境の網羅監査、
新しいブラウザ正否判定器はGate 5に含めない。移行必須条件の未達だけをFAILとし、未検証の追加要件をFAIL原因にしない。
移行必須条件を観測できない場合はPASSにせず、必要な観測点と解除条件を記録してGate タスクを`blocked`にする。

Pionの移行必須条件を観測できるメンテナンス環境で、この手順書を最初から実行する。観測期間は利用者が段階 6着手を判断するまで継続する。
