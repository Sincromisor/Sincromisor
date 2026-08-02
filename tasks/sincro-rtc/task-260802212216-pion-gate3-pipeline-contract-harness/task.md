# Pion Gate 3下流サービス契約ハーネスを実装する

## 背景 / 目的

4つのPython下流サービスとのMessagePack契約と、切断後のpipeline再接続を検証する部品を、
ブラウザーやシグナリング障害から独立して実装する。Gate 3本番実測は実サービスを使うが、
ハーネスの自己検証は通信互換な契約サービスで決定的に行う。

## 完了条件（受け入れ条件）

- [ ] `internal/gate3/pipelinecontract`にSpeechExtractor、SpeechRecognizer、TextProcessor、
      VoiceSynthesizerの4契約サービスを実装し、既存MessagePack固定データと同じkey・型を検査する。
- [ ] 2 turnについて`speech_id`、`sequence_id`、session、確定済み履歴、TextProcessorから
      VoiceSynthesizerへのbyte同一性を台帳へ保存し、余分なframe、順序違反、ID不一致、未消費操作をerrorにする。
- [ ] `internal/gate3/wsproxy`はサービスごとに透過、`close`、`malformed`、`held-close`の有限規則列を持つ。
      規則は一致した最初のframeだけで先頭から消費し、scenario終了時の未消費規則をerrorにする。
- [ ] 4サービス×3障害の各caseで、障害発生後の最初のWebSocket upgradeを1回拒否して
      pipelineを`connecting`へ遷移させる。4 clientの一括reset、同じpipeline session ID、
      `SubmitPCM`の`ErrPipelineUnavailable`、旧generation出力なし、復旧後の新しいturn完走を確認する。
- [ ] 各caseで`sincro_rtc_pipeline_reconnects_total`の障害発生元serviceについて
      `result="start"`と`result="success"`が開始値から各1増え、他serviceのseriesが増えないことを確認する。
- [ ] 専用`consul agent -dev`を`127.0.0.1:8500`で子プロセス起動し、4 proxyだけを固定service名で登録する。
      port使用中は既存Consulを変更せずerrorにし、終了時は登録解除、proxy join、Consul terminate / `Wait`を行う。
- [ ] 契約サービスへ直接接続する試験と、4 proxyを通す所有者間結合試験を分け、後者で
      Consul health応答と各proxyの接続数を観測する。
- [ ] 変更対象と変更理解範囲のコメント点検を`impl.md`へ全件記録する。

## 設計判断（着手前に確定済み）

- packageは`internal/gate3/pipelinecontract`、`internal/gate3/wsproxy`、
  `internal/gate3/consuldev`へ分ける。ブラウザーとPion processの起動は後続タスクが所有する。
- 4 service名は`SpeechExtractor`、`SpeechRecognizer`、`TextProcessor`、`VoiceSynthesizer`に固定する。
- 契約サービスは
  `internal/pipeline/protocol/testdata/{extractor_result,recognizer_result,text_processor_request,text_processor_result,voice_synthesizer_result}.msgpack`
  とExtractor初期化固定データを再利用し、別schemaを作らない。
- `close`は最初のrequest受信後、response前にactive WebSocketを閉じる。`malformed`は最初の
  server→client結果を不正なMessagePackへ置換する。`held-close`は有効なresponseをproxy内へ保持した後、
  接続を閉じて保持bytesを破棄する。いずれも次のWebSocket upgradeを1回503で拒否し、その後は透過へ戻る。
- 新規APIは次の最小契約に固定する。
  - `pipelinecontract.New(Config{FixturesDir, ListenHost}) (*Set, error)`、
    `Set.Addresses()`、`Set.Transcript()`、`Set.Verify()`、`Set.Close(context.Context)`。
  - `wsproxy.NewSet(Config{Upstreams, Rules}) (*Set, error)`、`Set.Addresses()`、
    `Set.Ledger()`、`Set.VerifyConsumed()`、`Set.Close(context.Context)`。
  - `Rule`は`Service`、`Action=close|malformed|held-close`、`MatchOrdinal=1`、
    `RejectReconnects=1`を持つ。方向はserver→clientに固定し、任意predicateは受理しない。
  - `consuldev.Start(Config{Binary, Services}) (*Agent, error)`、
    `Agent.Close(context.Context)`。Agentは内部の`process.Owner`を単独所有する。
- 判定用errorは`ErrRuleUnconsumed`、`ErrProtocol`、`ErrIdentity`、`ErrPortInUse`、
  `ErrCleanup`とし、詳細をwrapして`errors.Is`可能にする。`Close`は冪等で、複数cleanup errorを
  `errors.Join`して返す。
- 実サービス接続元の環境変数は後続entrypointが所有する。本タスクの自己検証は契約サービスだけを使う。

## スコープ境界

- 本タスク: 契約サービス、WebSocket proxy、専用Consul、通信台帳、自己検証。
- 依存タスク: 外部実行ファイル検査と子プロセス所有者。
- 後続タスク: Frontend操作、WebRTC、実4サービス、Gate判定。
- スコープ外: Pythonサービス変更、production pipeline client変更、codec error、シグナリングHTTP障害。

## 高リスク統合タスクの追加設計

| 所有物 | 作成 | 正常終了順 |
| --- | --- | --- |
| 契約サービス | `pipelinecontract.Set` | 接続close、listener close、worker join |
| proxy | `wsproxy.Set` | 上流・下流接続close、listener close、worker join |
| Consul登録 | `consuldev.Agent` | 4登録解除 |
| Consul process | `consuldev.Agent` | terminate、`Wait` |

`held-close`は旧接続で生成済みの有効responseを配信せず破棄し、generation切替後に対応出力が
観測されないことを全4サービスで確認する。契約サービス内部状態だけで合格にせず、
production `pipeline.Coordinator`へ実registryを渡してmetricと出力台帳を観測する。

## 実装方針（既存コード整合: file:line）

- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/websocket_integration_test.go:40-142`の
  4サービス固定データとreset試験を再利用可能な契約へ抽出する。
- 同ファイル`:272-277`が既存MessagePack固定データ一覧、`:346-511`が各操作順の根拠である。
- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/coordinator_test.go:88-187`の
  reset single-flight、履歴維持、backoffを外部proxy後の観測点と照合する。
- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/connect.go:80-97`は接続失敗後だけ
  再試行待ちへ入るため、各障害規則へ`RejectReconnects=1`を必須にする。
- `sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/reset.go:17-114`は障害発生元serviceへ
  `start`と終端結果を各1回記録するため、この2 seriesだけを期待値にする。
- `sincromisor-server/sincro-rtc-pion-poc/cmd/pion-poc/main.go:131-147`は
  `http://127.0.0.1:8500`を使用するため、自己検証では専用Consulをそこへ起動する。

## テスト

- `go test -race -tags=gate3 ./internal/gate3/pipelinecontract ./internal/gate3/wsproxy ./internal/gate3/consuldev`
  を通し、4サービス×3障害の全12 caseを実行する。
- `go test -race ./internal/pipeline/...`、`go vet -tags=gate3 ./...`、tagなしの`go test ./...`、
  root `npm run gate`、`npm run tasks:check`を通す。
- 未消費規則、余分なframe、ID不一致、port競合、部分登録、旧generation出力、cleanup失敗の各負試験が
  対応する有限error分類を返すことを確認する。

## ソースコードコメント受け入れ条件

新規public API、MessagePack境界、操作台帳、generation、有限規則消費、非同期worker、
接続・processの生存期間と終了順序を変更理解範囲とする。目的、入力、観測可能な出力、失敗、副作用、
非対象、処理の前後関係を説明し、規約所定の9列で全件点検する。弱い・古いコメントは書き直すか削除し、
TODO必須情報、省略条件、構造改善を確認する。`private`、短さ、型、test、既存無commentを単独の
省略理由にしない。評価担当は全件を照合し、逐語説明、終了・処理の流れの不足、定型的理由があればFAILとする。

## ドキュメント同期の要否

要。`internal/gate3/README.md`へ4契約サービス、注入語彙、規則消費、専用Consul、実サービスを
Gate合格証拠にしない自己検証境界を追記する。公開サービス契約は変更しない。

## 文書の言語

説明文と表見出しは一般的な日本語を用い、service名、MessagePack field、package名だけ原表記を残す。
