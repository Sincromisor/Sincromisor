# レビュー: task-260921212106-container-lifecycle-logs

## 判定

APPROVED

## 理由・申し送り

- Dockerの標準出力だけでは`oom`、強制終了、healthcheckの実行結果を観測できず、現在の`bandog.sh`もDNSの失敗件数だけを`/services.status`へ書く。Docker Events・`State.Health.Log`・Consul check APIを既存の収集経路に加える根拠があり、固定入力、隔離コンテナ、HTTP代役だけで主要経路を確認する最小単位になっている。
- Dockerイベントは既存Vectorと同じDocker API権限を使い、対象Composeラベル、container ID、発生時刻、action、終了コードを収集側の値として記録する。補助コンテナ自身の起動・停止やDocker API取得失敗を業務コンテナの異常として混同しない。イベント履歴とhealth履歴は有限なので、停止中・再起動後の完全回収や一度だけの配送を約束せず、回収タスクの責務を残す。
- `State.Health.Log`はcontainer IDとhealthcheck実行単位に結び、初めて観測した異常を必ず出す。同じstatusでも開始・終了時刻、終了コード、正規化済み診断が変わった場合は別の理由変更として出し、履歴が消えた場合とinspect/API取得失敗も別イベントにする。補助処理を再起動した直後は過去との同一性を仮定せず、初回観測として記録する。
- healthcheck出力、`wget`や`fetch`のURL、Consul checkの`Output`には認証情報・会話本文・応答本文が含まれ得る。上限付きの安全な診断を出力元で作り、切詰め有無を属性に残す。Authorization、Cookie、Bearer値、secret/token/password属性、チェックコマンド・環境変数全量、URLの本文クエリを除去し、無効化した内容記録をhealthcheck経由で迂回させない。Vectorの既知属性除去は補助であり、原本の代替にはしない。
- bandogは現行の全サービス必須DNS判定と`/services.status`によるhealthcheckを維持したまま、初回、各サービスの異常、復旧、Consul取得不能だけをJSONLへ出す。同一状態・同じ理由を10秒ごとに重複させない。DNSは到達可能な正常インスタンスの有無だけを示すため、理由・対象node・service ID・check ID・実際のcheck状態はConsul APIの結果から記録し、bandog実行ホストを対象サービスの配置ホストと見なさない。
- ログ基盤は`SincroLogCollector`、`SincroLogRouter`、`SincroLogs`を既存bandogの必須対象へ追加済みである。各インスタンスの状態はConsulの実node・service/check IDで区別し、一台の正常なDNS応答を全ホストの正常と扱わない。イベント収集・診断取得を業務サービスの`depends_on`やbandogの本体判定変更へ結び付けない。

## 自律補完

- `AUTO_FIX`: health理由の同一性はcontainer ID、check実行の時刻・終了コード・安全に正規化した有限長診断を組にして比較する。初回、理由変更、履歴消失、取得失敗を区別する明示要件を満たし、全履歴の永続保存を追加しない。
- `AUTO_FIX`: Consulの取得失敗は`consul_check_query_failed`のように対象照会先と失敗区分だけを出し、下位のレスポンスや資格情報を出さない。DNSの失敗件数で置き換えず、復旧時は通常のcheck状態へ戻す。
- `AUTO_FIX`: Docker healthcheckに不足する短い接続不能・HTTP状態の診断は、既存の`compose/s3.yml`と`compose/agent-server.yml`の確認コマンドへ秘密を含めず追加する。コマンド全量・応答本文・認証ヘッダーを記録しないという既存制約に従う。
