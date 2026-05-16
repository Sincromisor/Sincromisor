# 設計ドキュメント

## 最初に読む

- [設計ドキュメント運用ガイド](documentation-guide.md)
    - 設計文書の種別、更新手順、分割基準、ベストプラクティス、index からの導線ルール

## 目的別入口

- 新しい設計文書を作る:
    - [設計ドキュメント運用ガイド](documentation-guide.md) の「新規文書作成手順」を確認し、`templates/` 配下のテンプレートを使う
- 既存文書を更新する:
    - 変更内容が現在設計、契約仕様、判断記録、移行計画のどれかを分類してから更新する
- 文書が肥大化したため分割する:
    - [設計ドキュメント運用ガイド](documentation-guide.md) の「分割判断基準」と「再編ロードマップ」を確認する
- endpoint / payload / DataChannel / env を変更する:
    - Contract Spec と関連する frontend / backend の両方を確認する
- 採用理由や棄却理由を残す:
    - Decision Record として ADR を追加する

## Templates

新規文書は、内容に合わせて下記テンプレートを使う。

- [Current Design](templates/current-design.md)
    - 現在の実装構造を説明する正本
- [Contract Spec](templates/contract-spec.md)
    - endpoint / channel / payload / env など、互換性に関わる契約仕様
- [Decision Record](templates/decision-record.md)
    - 採用理由、棄却理由、見直し条件を残す ADR
- [Initiative Plan](templates/initiative-plan.md)
    - 進行中の移行・大きな設計変更の計画

## Legacy Template

- [設計ドキュメントテンプレート](template.md)
    - 旧 15 章テンプレート。既存文書の参照用として残し、新規文書は原則 `templates/` 配下を使う。

## Architecture

- [Overview](architecture/overview.md)
    - Sincromisor 全体のコンポーネント境界と責務
- [Runtime Flow](architecture/runtime-flow.md)
    - 起動から会話成立までの代表フロー

## Contracts

互換性に関わる endpoint / channel / payload / format の正本。

- [Frontend RTC](contracts/frontend-rtc.md)
    - フロントエンドと `sincro-rtc` の WebRTC signaling / DataChannel 契約
- [Audio Pipeline WebSocket](contracts/audio-pipeline-websocket.md)
    - AudioBroker と下流音声処理サービス間の WebSocket / msgpack 契約
- [Proper Noun Dictionary](contracts/proper-noun-dictionary.md)
    - SpeechRecognizer 固有名詞補強で使う CSV 辞書仕様

## Frontend

- [App Shell](frontend/app-shell.md)
    - Vite MPA、React app shell、controller 境界
- [Pages](frontend/pages.md)
    - modern / experimental ページ分類と build 対象
- [Settings and Debug UI](frontend/settings-and-debug-ui.md)
    - 起動前 dialog、右側 tool panel、Debug Console
- [VAD](frontend/audio/vad.md)
    - フロント側 VAD と Debug Console 観測項目
- [Character Overview](frontend/character/overview.md)
    - VRM 描画、talk mode、motion / tracking の大枠
- [Character Motion](frontend/character/motion.md)
    - 口形、表情、視線、idle / gesture、pose retarget 適用境界
- [Character Tracking](frontend/character/tracking.md)
    - CharacterGaze、Face/Pose tracker、Worker fallback

## Backend Services

- [sincro-rtc](backend/services/sincro-rtc.md)
    - WebRTC signaling、RTC session process、VoiceTransformTrack
- [AudioBroker](backend/services/audio-broker.md)
    - downstream services への WebSocket 中継と queue 管理
- [SpeechExtractor](backend/services/speech-extractor.md)
    - 音声区間抽出
- [SpeechRecognizer](backend/services/speech-recognizer.md)
    - 音声認識と固有名詞補強の接続点
- [TextProcessor](backend/services/text-processor.md)
    - 応答 text、chat message、telop 生成
- [VoiceSynthesizer](backend/services/voice-synthesizer.md)
    - 応答 text から音声 frame への変換

## Infrastructure

- [Docker Compose](infrastructure/compose.md)
    - compose profile、env wiring、ローカル起動
- [Consul](infrastructure/consul.md)
    - service discovery と fallback 設定
- [Storage](infrastructure/storage.md)
    - Redis、SeaweedFS、旧 MinIO の扱い

## Decisions

- [ADR-260222 React Migration](decisions/ADR-260222-react-migration.md)
- [ADR-260430 Overlay Frame Ownership](decisions/ADR-260430-overlay-frame.md)
- [ADR-260412 Proper Noun Biasing Strategy](decisions/ADR-260412-proper-noun-biasing.md)

## Initiatives

- [React Migration](initiatives/react-migration.md)
- [Proper Noun Biasing](initiatives/proper-noun-biasing.md)

## Obsoleted

下記については廃止予定であるため、ドキュメントには記載しない。

- Nue-ASR
    - sincromisor-server/speech-recognizer 以下一式
    - 公式リポジトリ消滅のため
- Babylon.js
    - sincromisor-frontend以下のキャラクター描画関連のうち、VRM1.0関連でないもの
    - Three.js + VRM1.0に移行済み。近日中に削除予定
    - VRM 1.0サポートが現状厳しいため
        - https://forum.babylonjs.com/t/loading-vrm-humanoid-based-model/4980/28
- MinIO
    - SeaweedFSに移行
    - 公式OSS版が終了見込のため

## Archive

再編前の肥大化したファイルは、履歴参照用として [archive/legacy-flat](archive/legacy-flat/README.md) に退避した。通常の変更では archive を更新せず、現在設計、契約、ADR、initiative のいずれかを更新する。

## ToDo

- TODO は設計本文に溜めず、必要に応じて `documents/tasks/` に起票する。
