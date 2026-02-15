# Backend Speech Extractor 設計

Sincromisor の Speech Extractor サービス（音声区間抽出）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_speech_extractor.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - マイク入力フレームから発話区間を抽出し、下流ASR向けに分割して送信する
- 対象範囲:
  - `SpeechExtractorProcess.py`
  - `SpeechExtractorWorker.py`
  - `SpeechExtractorInitializeRequest` / `SpeechExtractorResult` 契約
- 非対象範囲:
  - 音声認識・テキスト応答・音声合成
- LLM向け要約（3-5行）:
  - WebSocket `/api/v1/SpeechExtractor/extract` でPCMフレームを受信する。
  - 先頭で `SpeechExtractorInitializeRequest` を受信後、YAMNetでSpeech有無を判定する。
  - 発話中は `SpeechExtractorResult` を逐次送信し、無音継続が閾値超過で `confirmed=True` を送る。
  - 発話前の先頭欠け対策として、直近約500msの音声を保持する。

## 3. 背景

- 解決したい課題:
  - WebRTCから流入する短い音声フレームを、ASRしやすいまとまりへ変換する
- 現状の問題点:
  - 音声判定がモデル閾値依存で、環境ノイズの影響を受けやすい
- 採用理由:
  - MediaPipe AudioClassifier(YAMNet)を使い、軽量にSpeech判定できる
- 制約条件:
  - モデルファイル `assets/3rd_party/yamnet.tflite` が必要
  - 入力は `int16`, 16kHz, mono 前提

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| Speech判定 | YAMNet分類で `category_name="Speech"` かつ score>0.6 の判定 |
| confirmed | ひとつの発話区間の終端フラグ |
| max_silence_ms | 発話中とみなす無音許容時間 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - WebSocketで音声フレームを受信できること
  - Speech開始を検知したら逐次 `SpeechExtractorResult` を返せること
  - 無音が閾値を超えたら `confirmed=True` を返せること
  - セッション数を `/statuses` で返せること
- 優先度（Must/Should/Could）:
  - Must: 抽出・逐次送信・終端確定
  - Should: max_silence_ms の外部指定
  - Could: ノイズ除去や判定改善

### 5.2 非機能要件

- 性能: バッファ最小長3200sampleで過剰呼び出しを抑える
- 可用性: WebSocket切断時にセッションを確実に減算
- スケーラビリティ: サービス単位で水平分割可能
- セキュリティ: 内部ネットワーク接続前提
- 運用性/保守性: Consulへのworker登録
- 監視性: `/statuses` とログ

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - `SpeechExtractorProcess`
  - `SpeechExtractorWorker`
- 責務分割:
  - Process: API起動、Consul登録、セッション管理
  - Worker: 音声バッファリング、Speech判定、抽出結果送信
- 外部依存:
  - `fastapi`, `uvicorn`, `mediapipe`, `sincro-models`, `sincro-config`
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/backend_speech_extractor_flow.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `SpeechExtractorProcess.start()`: `/statuses` と `/extract` を提供
  - `SpeechExtractorWorker.setup_model()`: YAMNetモデルロード
  - `SpeechExtractorWorker.extract()`: 状態機械（in_speech/silence_ms）で結果送信
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-server/speech-extractor/SpeechExtractorProcess.py`
  - `sincromisor-server/speech-extractor/src/speech_extractor/SpeechExtractor/SpeechExtractorWorker.py`
  - `sincromisor-server/sincro-models/src/sincro_models/SpeechExtractorResult.py`
- 変更時に同時確認が必要なファイル:
  - 初期化request変更: `SpeechExtractorInitializeRequest.py` と `ExtractorSenderThread.py`
  - 結果payload変更: `SpeechExtractorResult.py` と `RecognizerSenderThread.py`
  - 判定閾値変更: `SpeechExtractorWorker.py` と運用手順

### 7.2 データ設計

- 主要データ構造:
  - `SpeechExtractorInitializeRequest`: session_id / sampling設定
  - `SpeechExtractorResult`: speech_id / sequence_id / confirmed / voice(np.ndarray)
- 永続化対象:
  - なし
- スキーマ/モデル:
  - `sincro-models` の msgpack model
- バージョニング方針:
  - AudioBroker互換を維持し、変更時は同時更新

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - `GET /api/v1/SpeechExtractor/statuses`
  - `WS /api/v1/SpeechExtractor/extract?max_silence_ms=<int>`
- リクエスト仕様:
  - WS最初の1パケット: `SpeechExtractorInitializeRequest` (msgpack)
  - 以降: PCM bytes (int16 mono想定)
- レスポンス仕様:
  - `SpeechExtractorResult` (msgpack) を逐次返却
- エラー仕様:
  - 例外時はログ出力しセッション終了
- タイムアウト/リトライ方針:
  - サーバー側再試行なし。再接続は上位（AudioBroker）で実施

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - Init受信 -> 音声受信 -> Speech判定 -> 逐次送信
  - 無音が閾値超過 -> confirmed送信 -> speech_idインクリメント
- 異常系フロー:
  - WebSocket切断 -> セッション終了
  - モデル分類エラー -> 例外送出/終了
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - `documents/design/networking_websocket.md` を参照

## 8. 設定・デプロイ

- 環境変数:
  - `SINCRO_EXTRACTOR_HOST`, `SINCRO_EXTRACTOR_PORT`
  - `SINCRO_EXTRACTOR_PUBLIC_BIND_HOST`, `SINCRO_EXTRACTOR_PUBLIC_BIND_PORT`
  - `SINCRO_CONSUL_AGENT_HOST`, `SINCRO_CONSUL_AGENT_PORT`
- 設定ファイル:
  - `compose/speech-extractor.yml`
  - `examples/compose.env`
- 起動方法:
  - `uv run speech-extractor/SpeechExtractorProcess.py`
- デプロイ/ローカル実行手順:
  - `docker compose --profile backend up -d speech-extractor`
- 互換性に影響する設定変更:
  - APIパス / msgpack構造変更

## 9. 監視・運用

- ログ設計:
  - 接続/切断、セッション数、例外を出力
- メトリクス:
  - `/statuses` の sessions
- 障害時の切り分け手順:
  - 1. `/statuses` 疎通
  - 2. Init requestが届いているか
  - 3. Speech判定が常時false/trueに偏っていないか
- よくある失敗と対処:
  - モデルファイル不足 -> assets配置確認
  - 入力フォーマット不一致 -> sample rate / dtype を確認

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 単体実装なし（内部接続前提）
- 秘密情報の扱い:
  - なし
- 入力検証:
  - msgpackデコード失敗は例外
- 脅威と対策:
  - 異常データ時はfail-fast
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - Speech区間抽出、終端確定、max_silence_ms差分
- 単体テスト:
  - Worker単体の判定ロジック検証（必要時追加）
- 結合テスト:
  - AudioBroker経由でRecognizerに結果が流れることを確認
- E2Eテスト:
  - フロントから発話し、応答まで成立確認
- 負荷テスト（必要な場合のみ）:
  - 連続入力時の遅延・誤判定率評価
- 受け入れ条件:
  - 発話ごとに `confirmed=True` が返る

## 12. 既知課題・リスク

- 既知課題:
  - YAMNet閾値固定（0.6）
- 技術的負債:
  - ノイズ環境依存への適応が弱い
- リスク一覧:
  - 抽出失敗でASRが空振り
- 軽減策:
  - max_silence_ms調整、前処理検討

## 13. 代替案と設計判断

- 検討した代替案:
  - RNNoise等の別VAD採用
- 採用しなかった理由:
  - 現状はYAMNetで運用可能
- 最終判断:
  - YAMNetベース抽出を維持

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/networking_websocket.md`
  - `documents/design/backend_audio_broker.md`
- 参照実装:
  - `sincromisor-server/speech-extractor/SpeechExtractorProcess.py`
  - `sincromisor-server/speech-extractor/src/speech_extractor/SpeechExtractor/SpeechExtractorWorker.py`
  - `sincromisor-server/sincro-models/src/sincro_models/SpeechExtractorResult.py`
