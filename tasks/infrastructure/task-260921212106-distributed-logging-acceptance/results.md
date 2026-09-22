# 分散ログの結合確認結果

## 判定と確認環境

2026-09-23 JST、実環境の結合確認を完了し、独立評価待ち。対象ソースは`e04cd872`。2026-09-22時点の「2台目の接続情報待ち」は解消した。独立したLinux/Dockerホストを管理ネットワークで接続し、`host-a`を全機能・中央、`host-b`をRTC専用VPSとして確認した。

実アドレス、公開URL、SSH接続先、実設定、未加工ログ、人工WAVはGit管理外の`work/private-artifacts/task-260921212106-distributed-logging-acceptance/`に保存した。公開するのは[匿名化した件数と照合結果](artifacts/acceptance-summary.json)と以下の記録だけである。元環境の履歴・設定・イメージを保全し、VPSの履歴を破棄せず更新した。

成功済みの隔離障害試験は、その確認済み境界だけを引き継ぐ。今回再実行していない容量超過・物理障害入力などを実ホストで再現したとは扱わない。

## T01 通常起動・全サービス・発生元

各ホストの担当済み`.env`で`docker compose up -d --no-build --pull never`を実行した。イメージは配布Dockerfileから対象ソースをビルドし、VPSへ渡した5イメージのID一致を確認した。別のログ用プロジェクトや収集の先行起動は使っていない。

`host-a`は単一ホストで全機能を持つ`full,chat`の36サービス、`host-b`は`rtc`の6サービス。管理網用の配布Composeを重ねている。`host-a`のRTCへ直接接続する単一ホスト内の対話と、`host-b`のRTCから`host-a`の下流へ接続する対話の両方を実行した。前者でも管理網の公開設定は付いたままであり、追加公開を外した別構成の二重起動はしていない。

起動直後の中央4,805行から、observerによる他コンテナの代理記録を除外して全36+6サービス自身の出力を抽出した。初期化4サービス、Caddy、VOICEVOX、llama-server、Consul、Redis、SeaweedFS、収集・保存自身を含む。サービス別件数は匿名化JSONにある。同名のRTC、Vector、router、収集Consul、observerを`host`と`container_id`で区別できる。MediaMTX・旧MinIOは両構成とも選択していない。

両ホストの永続journal、時刻、管理網到達と必要ポートを確認した。ホスト識別は`host-a` / `host-b`、保持期間は7日、初回の内容設定は両キー未指定で有効。起動時に中央未準備で転送503が出ても、中央・Consulの準備後に両ホストから投入された。

検索は中央ホストで実行する。VictoriaLogsのJSON値は文字列になるため、連番比較には`tonumber`を使う。

```sh
curl --fail --silent --data-urlencode   'query=host:host-b service:sincro-rtc event:log _time:[2026-09-22T15:00:00Z,2026-09-23T00:00:00Z]'   http://127.0.0.1:9428/select/logsql/query   | jq -c '{"時刻":._time,"ホスト":.host,"サービス":.service,"イベント":.event,"会話":.session_id}'
```

## T02 代表会話と取得可能なID

実マイクを使わず、管理下のVOICEVOXで生成した24 kHz mono WAVをChromeの仮想マイクへ渡した。主入力は「これは音声対話の動作確認です。今日の天気を教えてください。」、4.896秒、SHA-256は`390d2faeea2572a0a946c0ef1f303089178cf15daabc259cfeab7e36853acaf3`。前後に無音を付けた試験ファイルを使用した。

ローカルRTCの会話`01M34WNS1HE0K112A33DP074AZ`では中央125行、VPSの会話`01M34X2Q9EVK3TQTYCCGH1H4MQ`では177行を得た。後者は`host-b/sincro-rtc`と`host-a`のNeMo、TextProcessor、AgentServer、VoiceSynthesizerに同じ`session_id`があり、認識・処理・合成では実在する`speech_id`と`sequence_id`も照合した。

AgentServerは`thread_id=sincromisor:<session_id>`で対応する。同じ会話内の連続2要求と履歴の読み書きを確認した。発話IDを持たないAgentServerや、相手側IDを返さないllama-serverの内部を、時刻だけで同一要求と断定しない。Extractorは接続と抽出開始を確認したが、現在の開始ログに会話IDはなく、RTC側の抽出段階のIDを用いる。

ブラウザーではユーザー認識文、応答テキスト、テロップ、送受信RTPを確認し、合成結果の正の`speaking_time`を確認した。非無音の端末再生を証明したとは扱わない。今回の結合確認は生成結果と受信までであり、音質・聴感評価は含めない。

## T03 内容設定の独立性と機能維持

関連サービスの再作成で設定を反映し、各試行の会話ID・開始終了時刻で中央と自前サービスのローカル運用ログを照合した。初回は両キー未指定、以後は明示値を設定した。

| 対話     | 音声生成 | 認識本文 / 対話入力 | 合成詳細          | 機能用履歴          |
| -------- | -------- | ------------------- | ----------------- | ------------------- |
| 既定有効 | 既定有効 | 10 / 2件            | 9件               | user/assistant各2件 |
| false    | true     | 0 / 0件             | 24件              | user/assistant各2件 |
| true     | false    | 8 / 2件             | 0件、処理結果8件  | user/assistant各2件 |
| false    | false    | 0 / 0件             | 0件、処理結果24件 | user/assistant各2件 |

両方無効の会話`01M34YA6PCCD9CYFVQ809V854C`は、中央の時間範囲全体1,040行を取得し、認識文・応答全文・応答断片を生文字列、JSONエスケープ、URLエンコードで検索した。構造付き項目、未解析の元行、VOICEVOXの要求URLを含め一致0。Extractor、NeMo、TextProcessor、VoiceSynthesizer、AgentServer、llama-serverのローカル運用ログも一致0だった。llama-serverは製品ログを無効にし、操作結果はAgentServer側に残る。

同じ会話でRedisキャッシュ復号成功3件、生成とキャッシュ保存、認識音声の機能用保存、AgentServerの履歴書込成功2件を確認した。DBの当該threadを読み取り、user/assistant各2件と空でない内容を確認した。本文そのものは公開していない。一般の処理結果、保存状態、エラー理由は残った。以前の有効時のログは無効化後にも検索できた。

VOICEVOXなど第三者サービスのローカル原本はVectorによる中央除去と別の保存範囲であり、ローカル原本まで削除・無効化したとは扱わない。詳細境界、無効値の拒否、例外や人工秘密の除去は先行のPython・音声・内部診断試験を引き継ぐ。最後に両キー未指定の元設定へ戻した。

## T04 中央停止・再発見・収集停止

中央だけを停止し、本体を稼働させた。既知の成功入力でVPS会話`01M34YD4G4S9VRHE492AAGJ97R`を開始し、復旧要求より前に応答とテロップを受信した。復旧後は同じ会話IDの中央272行、認識・対話・合成・履歴操作を照合した。停止時刻と復旧要求時刻は匿名化JSONに記録した。

中央の実Consul広告アドレスを、一時的に`host-b`の管理網限定転送口へ変更した。既存routerを再設定せず、5秒周期のDNS再解決後に両ホストの人工連番が届いた。転送口は投入パス以外404、アクセス記録から要求・応答ヘッダーと要求情報を除外し、成功57件を確認した。VictoriaLogsを移設した試験ではなく、広告先変更の追随試験である。登録を元へ戻し、転送口を削除した。

`host-b`のVectorだけを停止すると、`SincroLogCollector_host-a`はpassingのまま、`host-b`の個体はcriticalになった。停止中に人工連番を記録し、既存cursor・bufferを保持してVectorを再作成した。復旧後は両個体passingに戻った。

| 条件 / `run_id`                             | host-a    | host-b    | 欠落・重複 |
| ------------------------------------------- | --------- | --------- | ---------- |
| 中央停止 / `central-outage-20260923`        | 1〜5の5件 | 1〜5の5件 | 0 / 0      |
| 広告先変更 / `central-rediscovery-20260923` | 1〜5の5件 | 1〜5の5件 | 0 / 0      |
| VPS収集停止 / `collector-recovery-20260923` | 1〜5の5件 | 1〜5の5件 | 0 / 0      |

これらは既存RTCコンテナのstdoutへ投入した明示的な人工JSONであり、業務が生成したイベントとは区別する。検索条件は`event:acceptance_sequence run_id:<上表の値>`、照合キーは`host`と`sequence`である。

短命コンテナ、原本ローテーション、同期前強制停止、容量超過、cursor消失区間、中央再作成・隔離バックアップ復元は、同じ実装の先行回収タスクの連番85件・回転40件等を引き継ぐ。稼働ホストの原本削除や物理故障は起こしていない。

## T05 ブラウザー・ホスト診断

VPSと同一オリジンの実診断APIへ、人工的な端末拒否、RTC切断、WebGL喪失、Worker代替と各復旧の8件をブラウザーから送信した。204を返し、中央で`source=browser`、`host=host-b`、固定分類と人工client IDを照合した。実フロントのイベント発生・分類、送信失敗、待ち行列超過は先行のPlaywright→RTC→中央100件の試験を引き継ぎ、今回のAPI投入を端末障害の実発生と読み替えない。

両ホストで`logger -t sincromisor-log-test`から無害なUUIDを1件ずつ記録し、中央の`event:host_diagnostic reason:read_path_probe`で各hostとprobe IDが一致した。ホスト障害の固定入力、読取拒否、原本不存在の分類は先行証拠を引き継ぐ。実際のGPU・ディスク故障は発生させない。

## 残る運用上の制約

- 公開プロキシは526（証明書エラー）を返したため、VPSのRTCへはlocalhost限定SSHトンネルで接続した。公開HTTPS経由の対話成功は今回の証拠に含めない。証明書や公開プロキシ設定は変更していない。
- ChromeのWeb Audioによる人工送信は時計が停止したため、仮想マイクへ変更した。短い2.507秒の人工音声は認識されない試行があり、中央復旧後も変わらず、既知の4.896秒入力では両方無効でも成功した。発話判定スコアは未採取で、原因を確定したとは扱わない。
- 長い応答で`output_backpressure`による切断を観測した。本文設定と中央停止による処理停止ではなく、中央稼働中にも発生した。短い応答の成功と区別し、無制限の対話継続を保証しない。
- 単一中央・各ホストのディスク、原本保持容量外、未同期の強制終了、バックアップ後の区間、ブラウザー未送信や同時物理故障まで無欠落とはしない。保持・権限・復元手順は[ログ設計](../../../documents/design/infrastructure/logging.md)を参照する。

## 先行証拠

各リンクに確認方法・人工入力・結果と独立評価がある。日付はすべて2026-09-22。

| 証拠                                                               | 対象実装   | 確認範囲                                          |
| ------------------------------------------------------------------ | ---------- | ------------------------------------------------- |
| [基盤](../task-260921212053-victorialogs-foundation/task.md)       | `3bb25786` | 人工JSONL投入・検索、公開範囲・保持               |
| [収集](../task-260921212104-vector-host-collection/task.md)        | `85904b23` | 隔離Composeの人工コンテナ・Consul再発見           |
| [Python](../task-260921212105-python-conversation-logs/task.md)    | `6e81d786` | 実ハンドラー・人工モデル・公開WebSocketの本文切替 |
| [RTC](../task-260921212105-rtc-agent-json-logs/task.md)            | `b7f01a5c` | RTC JSONL、Agentローカル起動、llama実CPU推論      |
| [音声](../task-260921212105-speech-synthesis-logs/task.md)         | `3b735753` | 4設定組合せ・HTTP代役・実VOICEVOXアクセス行       |
| [状態](../task-260921212106-container-lifecycle-logs/task.md)      | `d9371855` | 隔離Docker状態・Consul診断の中央抽出              |
| [ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md) | `0b0fef7b` | Playwright→実RTC→中央100件、障害・復旧・失敗数    |
| [内部](../task-260921221014-runtime-failure-diagnostics/task.md)   | `1a759871` | コマンド/SSE/MCP/DBの失敗、FFmpeg中央3件          |
| [ホスト](../task-260921221014-host-system-diagnostic-logs/task.md) | `b12f23a0` | 実journal無害probe、人工障害4件、読取拒否・再開   |
| [回収](../task-260921221014-logging-delivery-recovery/task.md)     | `3ea4eec9` | 連番85・回転40・欠落検知・容量・中央復元          |

## 網羅性表との対応

[元台帳](../task-260921221013-logging-coverage-inventory/coverage.md)の全63行。各行は今回のT01〜T05と、表中の先行確認済み境界を組み合わせた結果である。確認日・対象コミット・人工入力・検索は上記とリンク先に分け、過去の故障注入を今回実施したとは扱わない。

| 行ID | 先行の確認済み境界                                                                                                                                                                                                                                                                                                         | 最終照合・選択条件                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C01  | [ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md)・[収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                            | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C02  | [RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                              | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C03  | [Python](../task-260921212105-python-conversation-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                          | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C04  | [Python](../task-260921212105-python-conversation-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                          | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C05  | [Python](../task-260921212105-python-conversation-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                          | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C06  | [音声](../task-260921212105-speech-synthesis-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                               | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C07  | [音声](../task-260921212105-speech-synthesis-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                               | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C08  | [RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                  | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C09  | [RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                  | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C10  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C11  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C12  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C13  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C14  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C15  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                           | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C16  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                           | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C17  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                           | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C18  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                           | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C19  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                           | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C20  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C21  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C22  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C23  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C24  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C25  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C26  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C27  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C28  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C29  | [収集](../task-260921212104-vector-host-collection/task.md)・[状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                 | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C30  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | T01の通常起動・当該サービス実出力。T02/T03の関連操作と先行境界を継承。 |
| C31  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | 未選択: MediaMTX。選択時は元台帳の配信確認が必要。                     |
| C32  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | 未選択: 非標準のMinIO。                                                |
| C33  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | 未選択: 非標準のMinIO Consul agent。                                   |
| C34  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                           | T01の短命入口出力。失敗分類は先行内部試験。                            |
| R01  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                                                                           | T02/T03の成功・状態診断。故障分類は先行内部試験の範囲を継承。          |
| R02  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                                                                           | T02/T03の成功・状態診断。故障分類は先行内部試験の範囲を継承。          |
| R03  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                                                                           | T02/T03の成功・状態診断。故障分類は先行内部試験の範囲を継承。          |
| R04  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                                                                           | T02/T03の成功・状態診断。故障分類は先行内部試験の範囲を継承。          |
| R05  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                                                                           | T02/T03の成功・状態診断。故障分類は先行内部試験の範囲を継承。          |
| R06  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                                                                           | T02/T03の成功・状態診断。故障分類は先行内部試験の範囲を継承。          |
| R07  | [内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                                                                                                                                                                                                           | T02/T03の成功・状態診断。故障分類は先行内部試験の範囲を継承。          |
| B01  | [ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md)                                                                                                                                                                                                                                                         | T05の実VPS受信・中央到達。発生・分類・再送境界は先行ブラウザー試験。   |
| B02  | [ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md)                                                                                                                                                                                                                                                         | T05の実VPS受信・中央到達。発生・分類・再送境界は先行ブラウザー試験。   |
| B03  | [ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md)                                                                                                                                                                                                                                                         | T05の実VPS受信・中央到達。発生・分類・再送境界は先行ブラウザー試験。   |
| B04  | [ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md)                                                                                                                                                                                                                                                         | T05の実VPS受信・中央到達。発生・分類・再送境界は先行ブラウザー試験。   |
| H01  | [状態](../task-260921212106-container-lifecycle-logs/task.md)                                                                                                                                                                                                                                                              | T04/T05の両ホスト読取・個体監視。故障形式は先行状態/ホスト試験。       |
| H02  | [ホスト](../task-260921221014-host-system-diagnostic-logs/task.md)                                                                                                                                                                                                                                                         | T04/T05の両ホスト読取・個体監視。故障形式は先行状態/ホスト試験。       |
| H03  | [ホスト](../task-260921221014-host-system-diagnostic-logs/task.md)                                                                                                                                                                                                                                                         | T04/T05の両ホスト読取・個体監視。故障形式は先行状態/ホスト試験。       |
| L01  | [基盤](../task-260921212053-victorialogs-foundation/task.md)・[回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                               | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| L02  | [回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                                                                                             | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| L03  | [収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                                                                                | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| L04  | [状態](../task-260921212106-container-lifecycle-logs/task.md)・[収集](../task-260921212104-vector-host-collection/task.md)                                                                                                                                                                                                 | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| L05  | [回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                                                                                             | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| L06  | [回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                                                                                             | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| L07  | [回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                                                                                             | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| L08  | [ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md)                                                                                                                                                                                                                                                         | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| L09  | [ホスト](../task-260921221014-host-system-diagnostic-logs/task.md)・[回収](../task-260921221014-logging-delivery-recovery/task.md)                                                                                                                                                                                         | T01/T04の実2ホスト投入・停止・再発見。隔離回収/復元境界は先行証拠。    |
| I01  | [Python](../task-260921212105-python-conversation-logs/task.md)・[RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[音声](../task-260921212105-speech-synthesis-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                     | T02の実session/speech/sequence照合。                                   |
| I02  | [Python](../task-260921212105-python-conversation-logs/task.md)・[RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[音声](../task-260921212105-speech-synthesis-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)                                                                     | T02の連続2要求とthread対応。相手内部IDを補完しない。                   |
| N01  | [Python](../task-260921212105-python-conversation-logs/task.md)・[RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[音声](../task-260921212105-speech-synthesis-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md) | T03の4通りと中央・自前ローカルの本文検索。                             |
| N02  | [Python](../task-260921212105-python-conversation-logs/task.md)・[RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[音声](../task-260921212105-speech-synthesis-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md) | T03の機能保存維持と先行秘密除去。バイナリは機能保存と分離。            |
| N03  | [Python](../task-260921212105-python-conversation-logs/task.md)・[RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[音声](../task-260921212105-speech-synthesis-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md) | T02のLLM操作。MCPは未設定で未稼働、呼出境界は先行人工MCP試験。         |
| N04  | [Python](../task-260921212105-python-conversation-logs/task.md)・[RTC](../task-260921212105-rtc-agent-json-logs/task.md)・[音声](../task-260921212105-speech-synthesis-logs/task.md)・[内部](../task-260921221014-runtime-failure-diagnostics/task.md)・[ブラウザー](../task-260921221013-browser-diagnostic-logs/task.md) | T02の既存IDで追跡。フレーム逐次ログ・分散トレースは要件上非導入。      |
