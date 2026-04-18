# Backend Speech Recognizer 固有名詞補強設計

Sincromisor の Speech Recognizer に対して、ファインチューニング以外で固有名詞認識を改善するための段階導入案を定義する設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_speech_recognizer_proper_noun_biasing.md`
- 作成日: 2026-04-12
- 最終更新日: 2026-04-18
- ステータス: Draft

## 2. 目的とスコープ

- 目的:
  - `SpeechRecognizerNemo` の固有名詞認識精度を、モデルのファインチューニングなしで改善する
  - 一般名詞をもじった固有名詞を、運用で用意できる CSV 辞書により優先認識または補正できるようにする
- 対象範囲:
  - `sincromisor-server/speech-recognizer-nemo/` の認識処理
  - `documents/design/backend_speech_recognizer.md` の派生設計としての追加補強方針
  - 辞書ファイル（必須列 `surface,yomi`、標準構成 `surface,yomi,priority,category,enabled,ambiguous`）を利用した後処理、デコード補強、再ランキング
- 非対象範囲:
  - 音響モデル自体の再学習
  - フロントエンドや WebSocket API 契約の変更
  - Text Processor 側での意味解釈による言い換え補正
- LLM向け要約（3-5行）:
  - 現状の Nemo 実装は 1-best をほぼそのまま返しており、固有名詞補強の余地が大きい。
  - 最優先は `confirmed=True` 時のみ適用する「読み一致の辞書補正」である。
  - 次段として NeMo の context biasing、さらに N-best 再ランキングを段階導入する。
  - 補正後テキストは ASR 結果として下流へ流しつつ、補正前の raw ASR 結果はデバッグ情報として残す。
  - いずれも辞書の `surface` と `yomi` を使い分け、API 互換を維持したまま導入可能とする。

## 3. 背景

- 解決したい課題:
  - 一般語彙に引っ張られて固有名詞が誤認識される
  - ポケモン名のような「既存語をもじった名称」が一般名詞へ正規化されやすい
- 現状の問題点:
  - `SpeechRecognizerNemo` はモデルをロードし、そのまま `transcribe()` の結果を返している
  - `SpeechRecognizerResult` は `result_text()` を単純連結して下流へ渡しており、補正段が存在しない
  - partial と confirmed で処理強度が同一であり、確定時のみ重い補正をかける設計が未導入
- 採用理由:
  - CSV 辞書は運用で用意しやすく、語彙追加の反復が容易
  - 確定時のみ処理を強化すれば、対話遅延への影響を抑えつつ精度向上を狙える
  - NeMo 側には context biasing と n-gram LM の受け口があり、段階的強化がしやすい
  - 2026-04-18 のスパイクで、RNNT の `boosting_tree` は `alsd` では使えず、`malsd_batch` confirmed 再デコード前提で導入する方針が妥当と確認した
- 制約条件:
  - `SpeechRecognizerResult` の msgpack 構造は極力維持する
  - partial の応答速度を大きく悪化させない
  - 辞書の誤適用による過補正を避ける
  - 補正前の raw ASR 結果と補正 trace を、下流契約とは別経路でデバッグ可能にする
  - `タブンネ / たぶんね` のような同音異義語では、単純な読み一致だけでは不十分である

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| 固有名詞辞書 | 必須列 `surface,yomi` を持つ CSV ファイル |
| 読み一致補正 | 認識テキストを読みへ正規化し、辞書の読みと一致した箇所を表記へ置換する後処理 |
| context biasing | デコーダにキーフレーズを与え、特定語彙を優先しやすくする補強手法 |
| N-best 再ランキング | 複数候補のうち、辞書一致度やスコアを元に最終候補を選び直す処理 |
| 曖昧語 | 同一 `yomi` に複数の `surface` 候補が存在し、単純置換だと誤補正しうる語 |
| raw ASR result | 補正や再ランキングを適用する前のモデル出力 |
| correction trace | 補正前後テキスト、採用語、保留語、採用理由を保持するデバッグ情報 |
| partial | `confirmed=False` の途中認識結果 |
| confirmed | `confirmed=True` の確定認識結果 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - 固有名詞辞書を CSV からロードできること
  - `confirmed=True` 時のみ辞書補正を適用できること
  - 辞書補正の ON/OFF と辞書パスを環境変数で制御できること
  - partial の API 契約を変更せず、既存下流コンポーネントと互換を保つこと
  - 補正後のテキストを ASR 結果として下流へ流せること
  - 補正前の raw ASR result と補正 trace をログまたは sidecar で保持できること
  - 読みが一意な語と曖昧語を区別して扱えること
  - 曖昧語は単純な読み一致だけで強制置換しないこと
  - 段階導入として context biasing と N-best 再ランキングを後から追加できる構成にすること
- 優先度（Must/Should/Could）:
  - Must: 読み一致の辞書補正
  - Should: context biasing
  - Should: N-best 再ランキング
  - Could: n-gram LM による shallow fusion

### 5.2 非機能要件

- 性能:
  - partial の推論経路は現状同等を維持する
  - confirmed の追加補正は実時間対比で許容範囲に収める
- 可用性:
  - 辞書ロード失敗時は致命停止ではなく、辞書補正無効で起動できる構成を優先する
- スケーラビリティ:
  - ワーカー単位で同一辞書をロードし、水平分散構成でも同一挙動を保てること
- セキュリティ:
  - 辞書ファイルはローカルマウント前提とし、任意入力を実行しない
- 運用性/保守性:
  - 辞書更新だけで運用改善できること
  - 誤補正時に切り分けできるログを残すこと
- 監視性:
  - 補正前後テキスト、raw ASR result、補正ヒット語数、処理時間をログ出力できること

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - `ProperNounDictionary`: CSV 読み込みと読み索引
  - `RecognizerPostProcessor`: 読み一致補正の適用
  - `AmbiguityResolver`: 曖昧語の保留、文脈ヒント適用、採用判断
  - `CorrectionTraceRecorder`: raw ASR result と補正 trace の記録
  - `SpeechRecognizerNemo`: NeMo デコード制御
  - `SpeechRecognizerNemoWorker`: confirmed 時の補正適用とログ出力
- 責務分割:
  - Dictionary: 辞書ロード、正規化済み読みの索引化
  - PostProcessor: 認識テキストに対する補正、ヒット情報の返却
  - AmbiguityResolver: 衝突読みの候補選定または補正保留
  - CorrectionTraceRecorder: 補正前後情報を構造化し、ログや sidecar JSON に出力
  - Nemo: デコード戦略切替、将来の context biasing / N-best 取得
  - Worker: partial / confirmed の処理分岐、補正前後の採用判断
- 外部依存:
  - `sudachipy` または既存かな変換手段
  - NeMo の `boosting_tree` / `ngram_lm_model` 機能
  - フェーズ1実装では `sudachipy` + `sudachidict-full` を採用し、`SplitMode.C` の形態素列と `reading_form()` を読み生成の基準とする
- 全体図（必要なら図リンク）:
  - partial: Extractor -> Nemo 1-best -> 下流送信
  - confirmed: Extractor -> Nemo 1-best -> 読み一致補正 -> 必要時追加デコード -> 下流送信

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `ProperNounDictionary`
    - CSV を `surface,yomi` を中心とする標準構成としてロードする
    - `よみ` をひらがな/カタカナ揺れ、長音、記号を必要に応じて正規化する
    - 同一読みの複数候補を保持し、優先度付きで返せるようにする
  - `RecognizerPostProcessor`
    - raw ASR result から得たテキストを形態素列へ分割し、各形態素の読みを構築する
    - 辞書読みとの完全一致または最長一致を、連続する形態素境界上でのみ評価する
    - 句読点・記号のみの要素をまたぐ置換や、任意部分文字列への置換は行わない
    - 初期段階では、読みが一意な語のみを自動置換対象とする
    - 補正前後テキスト、補正後 result、ヒット語一覧、補正件数を返す
    - 読み生成は `sudachipy.Dictionary(dict="full").create()` を使い、未知語や読みに失敗した形態素は `surface` をそのまま正規化へ回す
  - `AmbiguityResolver`
    - 同一 `yomi` に複数候補がある語を検出する
    - 例: `たぶんね -> タブンネ / たぶんね`
    - 文脈ヒントがない場合は自動置換せず保留する
    - フェーズ1では `left_surfaces` / `right_surfaces` を周辺語ヒント API として保持する
    - context biasing、N-best、周辺語ルールにより採用候補を絞る
  - `SpeechRecognizerNemo`
    - 現行の軽量経路を維持する
    - 将来拡張として confirmed 専用デコード設定を持てるようにする
  - `SpeechRecognizerNemoWorker`
    - partial は現状経路のまま返す
    - confirmed は 1-best 認識後に後処理を適用し、必要に応じてより重い経路へ進む
    - 採用した補正後 result を下流へ返し、raw ASR result は trace として保存する
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py`
  - `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py`
  - `sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py`
  - 追加候補:
    - `.../SpeechRecognizerNemo/ProperNounDictionary.py`
    - `.../SpeechRecognizerNemo/RecognizerPostProcessor.py`
- 変更時に同時確認が必要なファイル:
  - `examples/compose.env`
  - `compose/speech-recognizer.yml`
  - `documents/design/backend_speech_recognizer.md`

### 7.2 データ設計

- 主要データ構造:
  - 入力辞書:
    - CSV 形式（必須列 `surface,yomi`）
  - メモリ上の辞書:
    - `normalized_yomi -> list[entry]`
    - entry は `surface`, `yomi`, `priority`, `ambiguous` を持つ
  - 補正結果:
    - `original_text`
    - `corrected_text`
    - `original_result`
    - `corrected_result`
    - `matched_entries`
    - `applied_rules`
    - `deferred_entries`
      - `normalized_yomi`, `reason`, `candidates`, `context_hint`
  - trace 情報:
    - `decode_path` (`baseline` / `context_biasing` / `nbest_rerank`)
    - `selected_score`
    - `raw_score`
    - `decision_reason`
- 永続化対象:
  - confirmed 時の既存 JSON/音声ログ
  - 補正前後情報を持つ sidecar JSON または構造化ログ
- スキーマ/モデル:
  - 既存の `SpeechRecognizerResult` は初期段階では変更しない
  - 補正後テキストは `SpeechRecognizerResult.result` を上書きして返す
  - 補正前の raw ASR result は `SpeechRecognizerResult` に載せず、別ログまたは sidecar JSON に保持する
- バージョニング方針:
  - 初期段階では WebSocket 応答スキーマ非変更

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - 既存 `WS /api/v1/SpeechRecognizer/recognize` をそのまま利用する
- リクエスト仕様:
  - 変更なし
- レスポンス仕様:
  - 変更なし
  - `SpeechRecognizerResult.result` と `resultText` は、confirmed 時に補正後の内容へ更新されうる
  - フェーズ1で後処理だけを適用した場合、score は raw ASR result の score を維持する
  - フェーズ2/3で別候補を採用した場合、score は採用候補の decode score を用いる
- エラー仕様:
  - 辞書ファイル未設定: 補正無効で継続
  - 辞書ファイル読込失敗: ワーニングを出して補正無効で継続
  - 補正処理失敗: 元の認識結果を返す
- タイムアウト/リトライ方針:
  - 補正処理で積極再試行は行わない
  - confirmed 専用の重い経路は必要時のみ一回実行する

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - フェーズ1:
    - Extractor結果受信 -> Nemo 1-best -> confirmed 判定
    - partial の場合はそのまま返却
    - confirmed の場合は raw ASR result を保持した上で読み一致補正を行う
    - 読みが一意な語は、形態素境界に整列した一致のみ補正後テキストへ反映する
    - 補正後 result を採用して返却し、raw ASR result は trace に残す
    - 曖昧語は自動置換せず保留する
  - フェーズ2:
    - confirmed の場合のみ context biasing 付きデコードを実行し、曖昧語の候補選定に利用する
    - key phrase は原則 `surface` を使う。`yomi` は後処理・曖昧性判定用であり、初期導入では biasing 入力に使わない
    - NeMo の `boosting_tree` は `strategy='malsd_batch'` での confirmed 専用再デコードとして導入する。現行既定の `alsd` へ直接注入しない
    - 現行導入では、biasing 結果に保留中候補の `surface` が一意に現れた場合のみ biasing 側を採用し、それ以外は baseline 後処理結果を維持する
  - フェーズ3:
    - confirmed の場合のみ N-best を取得し、辞書一致度 + モデルスコア + 周辺文脈で再ランキングする
    - N-best は `beam.return_best_hypothesis=False` で取得し、raw hypothesis は `list[Hypothesis]` として保持する
- 異常系フロー:
  - 辞書未ロード -> 補正スキップ
  - 補正結果が低信頼 -> 元の 1-best を維持
  - 曖昧語で決定不能 -> 元の 1-best または非固有名詞側を維持
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - 追加図は未作成。実装時に必要なら `documents/design/assets/` 配下へ追加する

## 8. 設定・デプロイ

- 環境変数:
  - 追加候補:
    - `SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH`
    - `SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE`
    - `SINCRO_RECOGNIZER_PROPER_NOUN_APPLY_PARTIAL`（初期値は `false` 推奨）
    - `SINCRO_RECOGNIZER_PROPER_NOUN_CONTEXT_BIASING_ENABLE`
    - `SINCRO_RECOGNIZER_PROPER_NOUN_CONTEXT_BIASING_BEAM_SIZE`
    - `SINCRO_RECOGNIZER_PROPER_NOUN_NBEST_ENABLE`
- 設定ファイル:
  - `examples/compose.env`
  - `compose/speech-recognizer.yml`
- 起動方法:
  - 既存の recognizer 起動方法をそのまま用いる
- デプロイ/ローカル実行手順:
  - CSV 辞書をコンテナへマウント
  - 環境変数で辞書パスを指定
  - `docker compose --profile backend up -d speech-recognizer`
- 互換性に影響する設定変更:
  - 初期段階では API 互換性への影響なし
  - confirmed 時の文言のみ改善方向に変化する
  - confirmed 時の `recognizedResult` 相当のテキストも補正後内容へ変化しうる

## 9. 監視・運用

- ログ設計:
  - `confirmed` 時に以下を出力する
  - raw ASR text
  - 補正後テキスト
  - raw ASR result
  - 補正後 result
  - ヒット辞書語
  - 保留した曖昧語
  - context biasing の raw 結果、採用判定、候補解決結果
  - 採用した decode path
  - 補正処理時間
- メトリクス:
  - 将来的に以下を追加候補とする
  - 辞書ヒット件数
  - 補正採用率
  - context biasing 使用率
- 障害時の切り分け手順:
  - 1. 辞書ファイルのマウント確認
  - 2. 辞書ロードログ確認
  - 3. 補正前後のテキスト差分確認
  - 4. 誤補正なら辞書読みと優先度を見直す
- よくある失敗と対処:
  - 読みの揺れでヒットしない -> 正規化ルール追加
  - 同音異義語で誤補正 -> 最長一致、優先度、適用条件を厳しくする
  - partial まで補正して遅い -> partial 補正を無効化する

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 追加なし
- 秘密情報の扱い:
  - 辞書は秘密情報ではない前提だが、配信固有語彙を含む場合は取り扱いに注意する
- 入力検証:
  - CSV の列数、空文字、重複をロード時に検証する
- 脅威と対策:
  - 壊れた辞書により補正が暴走しないよう、無効行をスキップし警告を出す
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - 読み一致で正しく置換されること
  - 置換が形態素境界をまたがないこと
  - 曖昧語が単純置換で誤補正されないこと
  - `タブンネはヒヤリングポケモンです。たぶんね。` のような混在文で前後の扱いが分かれること
  - partial が非劣化であること
  - confirmed のみ補正されること
  - 同音異義語の過補正が許容範囲であること
  - 一般会話文や非辞書文で不要な置換が発生しないこと
  - raw ASR result と補正 trace がログまたは sidecar に残ること
  - confirmed 時のみ context biasing が走ること
  - context biasing が `surface` ベースの key phrase を使うこと
  - 保留中の曖昧語が biasing 結果で一意に解決できた場合のみ採用されること
- 単体テスト:
  - CSV ローダ
  - 読み正規化
  - 最長一致置換
- 結合テスト:
  - `SpeechRecognizerNemoWorker` で confirmed 時に補正が適用されること
- E2Eテスト:
  - 固有名詞を含む発話がチャット表示へ期待表記で反映されること
- 負荷テスト（必要な場合のみ）:
  - 辞書件数増加時の confirmed レイテンシ測定
- 受け入れ条件:
  - 代表固有名詞セットで baseline より認識正答率が改善すること

## 12. 既知課題・リスク

- 既知課題:
  - 読み変換の品質に補正精度が依存する
  - 同音異表記が多い語では過補正が起きうる
- 技術的負債:
  - 補正ロジックが複雑化すると、モデル本来の出力との責務境界が曖昧になりやすい
- リスク一覧:
  - 辞書の語数増加により誤補正率が上がる
  - context biasing を強くしすぎると hallucination が増える
  - N-best や LM を常時有効化するとレイテンシが悪化する
- 軽減策:
  - フェーズ1は confirmed 限定、完全一致限定で始める
  - フェーズ1では読みが一意な語だけを自動置換対象にする
  - フェーズ1では形態素境界に整列した一致だけを置換対象にする
  - 曖昧語は context biasing または N-best 再ランキング導入後に段階的に有効化する
  - context biasing と N-best は feature flag で段階投入する
  - 代表語彙セットで回帰確認を継続する

## 13. 代替案と設計判断

- 検討した代替案:
  - 1. Text Processor 側で固有名詞補正する
  - 2. いきなり context biasing を主経路に入れる
  - 3. 先に n-gram LM を導入する
  - 4. ASR モデルをファインチューニングする
- 採用しなかった理由:
  - 1. ASR の責務から離れ、認識誤りの切り分けが難しくなる
  - 2. 実装難度が後処理より高く、初手の改善速度で劣る
  - 3. 準備コストが高く、CSV 辞書をすぐ活かしにくい
  - 4. 運用負荷と GPU コストが大きい
- 最終判断:
  - 効果と実装容易性の両面から、以下の順で段階導入する
  - 第1段階: confirmed 時のみ、読みが一意な語に限定した辞書補正
  - 第2段階: confirmed 時のみ context biasing を追加し、曖昧語の文脈判断に利用する
  - 第3段階: confirmed 時のみ N-best 再ランキングを追加し、曖昧語の最終採用を行う
  - 第4段階: 必要時のみ n-gram LM

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-04-12 | 初版作成 |
| 2026-04-18 | TASK-1002 向けに読み生成方式として `sudachipy` + `sudachidict-full` を採用し、confirmed 時の一意読み補正方針を具体化 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/backend_speech_recognizer.md`
  - `documents/design/networking_websocket.md`
- 参照実装:
  - `sincromisor-server/speech-recognizer-nemo/SpeechRecognizerNemoProcess.py`
  - `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemo.py`
  - `sincromisor-server/speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/SpeechRecognizerNemoWorker.py`
- 外部リンク:
  - NeMo RNNT decoding
  - NeMo context biasing
