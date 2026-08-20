# 検証計画

## Summary

- Phase 1はlocal Chromeの最小縦切りでPionとcodecの採用可否を判断する。
- Phase 3は既存repository testと、現行Frontendによる1回のend-to-end smoke testでproduction候補を判定する。
- Phase 4は実際のcomposeとnetwork構成でPionの接続、会話、停止切替を確認する。
- 詳細baseline、network impairment、長時間soak、網羅的な性能比較、Pion process crash自動復帰は、実害が確認された場合だけ独立taskで行う。

## 必須検証

| 分類          | Phase 1                  | Phase 3                                    | Phase 4                             |
| ------------- | ------------------------ | ------------------------------------------ | ----------------------------------- |
| signaling     | initial Offer、candidate | 現行endpointのrepository test              | stable endpointのsmoke test         |
| media         | Opus受信、test tone      | 実運用形式の合成音声を1回再生              | 会話音声の聴取                      |
| DataChannel   | 2 channelへ固定JSON送信  | 現行Frontendで会話を1 turn                 | text / telop受信                    |
| pipeline      | 対象外                   | Gate 2の互換試験とproduction候補の結合試験 | 実4サービスで会話                   |
| lifecycle     | 通常closeとcodec error   | 正常終了と代表的な異常終了                 | Pion切替、session収束               |
| network       | local host candidate     | local統合環境                              | 実運用のNAT、firewall、固定UDP port |
| compatibility | Chrome                   | 管理対象Chromium                           | Gate 3で成立済みのChromeを1回       |

## Phase 1 minimal PoC

- 現行fieldのconfig、initial Offer、candidate、end-of-candidatesを扱う。
- Pion側candidateを収集済みAnswerへ含め、server candidate通知APIを追加しない。
- Chromeとlocal host candidateでICEが`connected`または`completed`になる。
- browserから連続100 packet以上のOpus RTPを受信し、48 kHzの非無音PCMへdecodeする。
- 1秒のtest PCMを20 ms frameでencodeし、Chromeで非無音を確認する。
- `text_ch`と`telop_ch`へ固定test JSONを送信する。
- 通常close 10回、codec error、SIGTERM、race testでregistryとgoroutineが収束する。

Phase 1完了後に詳細baselineを作り直さない。PoCで採用した機能の回帰はrepository testへ残す。

## Phase 3 production candidate

### Repository test

実装時に追加済みのtestを正本とし、Gate専用の同等harnessを作らない。最低限、次を確認する。

- initial Offer、candidate、DataChannel、audio input / outputが現行契約どおり動く。
- `offer_request_id`、`offer_revision`、ICE restart、late candidate拒否が既存testを通る。
- MessagePack fixtureと4 pipeline clientのreset / generation試験が通る。
- 合成音声decoderは実装が対応する形式のunit / integration testを通る。
- 正常close、代表的なreadiness timeout、SIGTERMで所有resourceが収束する。
- session上限、HTTP入力上限、panic recovery、metricsは既存testを通る。

同じ条件を別packageのGate専用clientやreport schemaで再実装しない。

### End-to-end smoke test

現行Frontend、Pion production candidate、既存pipeline contract serviceを起動し、管理対象Chromiumで次を1回確認する。

1. initial Offerから接続する。
2. 固定音声で1 turnの会話を完了する。
3. 利用者text、応答text、`telop_ch`、非無音の合成音声を確認する。
4. sessionを終了し、active session、下流接続、goroutineが収束することを確認する。

ICE restartのbrowser試験が既に存在する場合は実行するが、Gate 3判定用に新しい注入機構を追加しない。

### Gate判定規則

Gate条件へ追加できるのは、移行固有の不変条件であり、既存確認で代替できない理由、既存の観測方法、未達時に切替を止める理由を
すべて記録できるものだけとする。条件は「移行必須」「既存testの証拠」「独立した運用強化」に分類し、GateのFAILは移行必須条件の
未達だけで決める。

新しいharness、設定、運用要件が必要になった場合はGateへ追加しない。根本原因、移行との関係、最小受け入れ条件を持つ独立taskへ
切り出す。観測点が不足するときも、それが移行必須条件を観測できない原因なら必要な観測点と解除条件を記録してGate taskを`blocked`にする。
未検証の追加要件はFAIL原因にせず、設計判断またはtest整備taskとして扱う。

### Gate 3判定

- 移行必須: repository testとend-to-end smoke testがPASSする。
- 既存testの証拠: initial Offer、candidate、DataChannel、audio、ICE restart、late candidate、pipeline reset、代表的なcloseは既存testで確認する。
- 独立した運用強化: Gate専用harness、注入機構、性能比較は追加しない。

## Phase 4 cutover rehearsal

production相当環境で、実際に採用する構成だけを検証する。

- 固定UDP mux port、public IPv4、NAT、firewallを本番と同じ値で構成する。
- Pion版でGate 3と同じChromeから接続し、1 turnの会話、音声、DataChannelを確認する。
- session終了後にactive session、goroutine、WebSocket、socketが収束することを確認する。
- aiortc停止、Pion起動、smoke testを一連の手順として実行する。
- FrontendとPython下流serviceを再buildせずPionへ切り替えることを確認する。

Gate 4では、public UDP / NAT / firewallはPion接続成立を観測する環境前提として扱う。Pion process crash自動復帰は
Pion固有の運用強化であり、Gate 4の受け入れ条件、検証計画、runbookには含めない。

### Gate 4判定

- 移行必須: Pionで現行Frontendが接続し、1 turnの会話、利用者/応答text、telop、非無音音声が成立する。session終了後に
  active sessionと下流接続が収束し、切替でFrontendと下流serviceをrebuildしない。
- 既存testの証拠: 既存repository testはPhase 3で確認済みの契約・異常系の証拠として再利用する。
- 独立した運用強化: Pion process crash自動復帰、soak、性能比較、障害注入、browser matrixの拡張は含めない。

現行Gate 4 taskへの適用は、この規則を反映した試行4からとする。過去artifactとPASS / FAIL / blockedの判定履歴は
書き換えない。Pionの移行必須条件を観測できるproduction相当smoke手順で、runbookを最初から実行する。

次は必須Gateに含めない。

- 1%、5%、10%など複数条件のnetwork impairment matrix
- packet sequence wraparound、連続ICE restart、candidate順序の網羅試験
- 50回、100回の接続反復や長時間soak
- aiortcとPionの詳細なCPU、memory、区間別latency比較
- 全音声形式を使ったend-to-end matrix

接続失敗、音声品質問題、resource増加が実運用で観測された場合だけ、該当項目を再現する独立taskを起票する。

### Gate 4の過剰化防止

Gate 4は、Pionで1回の既存Chrome経路を確認した時点で判定する。aiortcの起動確認は診断情報に留め、会話成立を要求しない。実下流の応答本文は固定文と比較せず、
利用者/応答text、telop、非無音音声の表示・再生をbrowser UIで確認する。Firefox、Docker crash、環境の網羅監査、
新しいbrowser oracleは、browser固有の実害があり、aiortcで同じ経路が成立している場合だけ独立して扱う。

## Observability

既に実装済みのmetricsから、切替判断に必要な値だけを記録する。

- active / closed session
- signaling error
- codec error
- pipeline reconnect
- queue overflow
- session close duration

新しいmetric familyやGate専用collectorは追加しない。session IDはlog correlationに使用できるが、音声内容やchat本文を通常logへ出さない。

## 検証成果物

実行したcommit、環境、command、smoke test結果、未観測、残リスクを対応taskの`eval.md`または小さな集約artifactへ記録する。
raw browser trace、音声、本文はGit管理外の`work/private-artifacts/`へ置く。
