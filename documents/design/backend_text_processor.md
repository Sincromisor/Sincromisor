# Backend Text Processor 設計

Sincromisor の Text Processor サービス（対話応答生成）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_text_processor.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - 認識済みテキストを応答テキストへ変換し、逐次レスポンスとして返す
- 対象範囲:
  - `TextProcessorProcess.py`
  - `TextProcessorWorker` / `PokeTextProcessorWorker` / `DifyTextProcessorWorker`
  - `TextProcessorRequest` / `TextProcessorResult` 契約
- 非対象範囲:
  - 音声認識・音声合成
- LLM向け要約（3-5行）:
  - TextProcessorは `chat` と `sincro` の2エンドポイントを提供する。
  - `confirmed=False` の途中認識は処理せず、確定発話のみ応答生成する。
  - `sincro` モードは `PokeText` でテキストを短文分割して返す。
  - `chat` モードはDifyストリーミング応答を句読点単位で分割して返す。

## 3. 背景

- 解決したい課題:
  - 発話確定後に低遅延で応答テキストをストリーミング配信する
- 現状の問題点:
  - chatモードはDify依存、外部遅延・障害の影響を受ける
- 採用理由:
  - モード別Workerにより用途（会話/読み上げ）を分離できる
- 制約条件:
  - chatモードは `SINCRO_PROCESSOR_DIFY_URL/TOKEN` 必須

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| chatモード | Dify連携で対話応答を生成するモード |
| sincroモード | PokeTextで読み上げ向け短文を生成するモード |
| voice_text | VoiceSynthesizerに渡す差分テキスト |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - `TextProcessorRequest` を受信し、`TextProcessorResult` を返せること
  - confirmed時のみ応答生成すること
  - 応答を複数チャンクで返し、最終チャンクで `end_of_response=True` にできること
  - モード別エンドポイントを提供できること
- 優先度（Must/Should/Could）:
  - Must: confirmed処理、result返却、2モード
  - Should: Difyストリーミング分割
  - Could: 追加応答モード

### 5.2 非機能要件

- 性能: 句読点区切りで早期レスポンスを返す
- 可用性: ws切断時にセッションを確実に減算
- スケーラビリティ: worker横展開可能
- セキュリティ: Difyトークン管理が必要
- 運用性/保守性: Worker実装差し替えで拡張可能
- 監視性: response_time / query_time ログ

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - Process: `TextProcessorProcess`
  - Base: `TextProcessorWorker`
  - Mode workers: `PokeTextProcessorWorker`, `DifyTextProcessorWorker`
  - Utilities: `PokeText`, `DifyClient`
- 責務分割:
  - Process: endpoint振り分け、Consul登録
  - Worker: request処理とresult生成
  - Utility: モデル/API依存処理
- 外部依存:
  - `fastapi`, `sincro-models`, `sudachipy`, `requests(Dify)`
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/backend_text_processor_flow.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `TextProcessorWorker.communicate()`: request受信ループ、confirmedフィルタ
  - `TextProcessorWorker.process()`: 既定実装（エコー）
  - `PokeTextProcessorWorker.process()`: `PokeText.convert` 結果を段階送信
  - `DifyTextProcessorWorker.process()`: Dify streamを句読点区切りで段階送信
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-server/text-processor/TextProcessorProcess.py`
  - `sincromisor-server/text-processor/src/text_processor/TextProcessor/TextProcessorWorker.py`
  - `sincromisor-server/text-processor/src/text_processor/TextProcessor/PokeTextProcessorWorker.py`
  - `sincromisor-server/text-processor/src/text_processor/TextProcessor/DifyTextProcessorWorker.py`
- 変更時に同時確認が必要なファイル:
  - result仕様変更: `TextProcessorResult.py` と `SynthesizerSenderThread.py`
  - request仕様変更: `TextProcessorRequest.py` と `TextProcessorSenderThread.py`
  - mode追加/変更: `TextProcessorProcess.py` と AudioBroker接続URL

### 7.2 データ設計

- 主要データ構造:
  - 入力: `TextProcessorRequest`（history + request_message + confirmed）
  - 出力: `TextProcessorResult`（response_message + voice_text + end_of_response）
- 永続化対象:
  - なし（会話履歴はセッション中メモリ）
- スキーマ/モデル:
  - `sincro-models` の `TextProcessorRequest`, `TextProcessorResult`, `ChatMessage`
- バージョニング方針:
  - AudioBrokerとVoiceSynthesizerの互換を優先

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - `GET /api/v1/TextProcessor/statuses`
  - `WS /api/v1/TextProcessor/chat`
  - `WS /api/v1/TextProcessor/sincro`
- リクエスト仕様:
  - `TextProcessorRequest` (msgpack)
- レスポンス仕様:
  - `TextProcessorResult` (msgpack) を0件以上返却
  - 最終レスポンスで `end_of_response=True`, `voice_text=None`
- エラー仕様:
  - chatモードでDify設定不足時はRuntimeError
- タイムアウト/リトライ方針:
  - server側再試行なし。上位再接続に委譲

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - request受信 -> confirmed判定 -> mode別process -> 段階送信 -> finalize
- 異常系フロー:
  - Dify API失敗 -> 例外 -> セッション終了
  - ws切断 -> セッション終了
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - `documents/design/networking_websocket.md` 参照

## 8. 設定・デプロイ

- 環境変数:
  - `SINCRO_PROCESSOR_HOST`, `SINCRO_PROCESSOR_PORT`
  - `SINCRO_PROCESSOR_PUBLIC_BIND_HOST`, `SINCRO_PROCESSOR_PUBLIC_BIND_PORT`
  - `SINCRO_PROCESSOR_DIFY_URL`, `SINCRO_PROCESSOR_DIFY_TOKEN`
- 設定ファイル:
  - `compose/text-processor.yml`
  - `examples/compose.env`
- 起動方法:
  - `uv run text-processor/TextProcessorProcess.py`
- デプロイ/ローカル実行手順:
  - `docker compose --profile backend up -d text-processor`
- 互換性に影響する設定変更:
  - endpoint path (`/chat` `/sincro`)
  - `TextProcessorResult.voice_text` 仕様

## 9. 監視・運用

- ログ設計:
  - request内容、応答時間、query時間
- メトリクス:
  - `/statuses` sessions
- 障害時の切り分け手順:
  - 1. mode endpoint接続確認
  - 2. confirmedフラグがtrueで届いているか確認
  - 3. Dify設定/疎通確認（chatモード）
- よくある失敗と対処:
  - Dify未設定でchat失敗 -> 環境変数設定
  - 長文応答遅延 -> 分割条件/外部API応答確認

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 単体実装なし
- 秘密情報の扱い:
  - Dify token は環境変数で注入
- 入力検証:
  - msgpack復元時型チェック
- 脅威と対策:
  - 外部APIエラー時はfail-fast
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - confirmedフィルタ、mode差分、end_of_response挙動
- 単体テスト:
  - Workerごとの `process()` 検証（必要時）
- 結合テスト:
  - Recognizer->TextProcessor->Synthesizer の連鎖確認
- E2Eテスト:
  - chat/sincro両モードで応答確認
- 負荷テスト（必要な場合のみ）:
  - 連続発話でレスポンス遅延観測
- 受け入れ条件:
  - `TextProcessorResult` が段階的に返り最終確定される

## 12. 既知課題・リスク

- 既知課題:
  - Dify依存のため外部要因の影響が大きい
- 技術的負債:
  - mode実装の振る舞い差が大きい
- リスク一覧:
  - 応答テキスト不安定で音声合成品質に影響
- 軽減策:
  - fallbackモード活用、分割ロジック改善

## 13. 代替案と設計判断

- 検討した代替案:
  - 単一固定ロジックに統一
- 採用しなかった理由:
  - 用途別（会話/同期読み上げ）の要求が異なる
- 最終判断:
  - mode別Workerで分離

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/networking_websocket.md`
  - `documents/design/backend_voice_synthesizer.md`
- 参照実装:
  - `sincromisor-server/text-processor/TextProcessorProcess.py`
  - `sincromisor-server/text-processor/src/text_processor/TextProcessor/DifyTextProcessorWorker.py`
  - `sincromisor-server/sincro-models/src/sincro_models/TextProcessorResult.py`
