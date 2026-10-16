# 実行時の処理の流れ

## 要約

- 起動時、フロントエンドは RTC 設定を取得し、WebRTC Offer を送信する。
- WebRTC 確立後、ユーザーの音声は音声トラックでPion実装の`sincro-rtc`に届き、Goパイプライン調停器が下流サービスへ中継する。
- 応答テキストは `text_ch`、テロップ・口形同期情報は `telop_ch`、合成音声は返却音声トラックでフロントへ戻る。

## 対象範囲

- 対象:
    - 起動から会話成立までの代表フロー
    - 正常系と主要な失敗箇所
- 非対象:
    - 送受信データの全フィールド定義
    - 各推論サービスの内部アルゴリズム

## 起動時の処理の流れ

1. フロントエンドが `GET /api/v1/RTCSignalingServer/config.json` を取得する。
2. ユーザーが起動前ダイアログでマイク、Gaze カメラ、VRM、会話モードを選ぶ。
3. `SincroController` / `SincroAppController` が UserMedia と WebRTC 接続を開始する。
4. `RTCTalkClient` が音声トラックと `text_ch` / `telop_ch` を持つ PeerConnection を作る。
5. フロントエンドが `/offer` へ SDP と `talk_mode` を送信する。
6. `sincro-rtc` がPion セッションを生成または更新し、Answer と `session_id` を返す。
7. フロントエンドはICE候補を後から`/candidate`へ送信する。

## 会話処理の流れ

以下は`chat` / `sincro`の経路である。下流サービス同士は直接接続せず、Goパイプライン調停器が4系統のWebSocketを中継する。`echo` / `playback`は下流へ接続しない。

```mermaid
sequenceDiagram
    participant F as フロントエンド
    participant R as sincro-rtc
    participant B as Goパイプライン調停器
    participant E as SpeechExtractor
    participant A as SpeechRecognizer
    participant T as TextProcessor
    participant V as VoiceSynthesizer

    F->>R: WebRTC 音声トラック
    R->>B: 音声フレーム
    B->>E: 初期化MessagePack / 未加工PCM
    E-->>B: 発話区間
    B->>A: 発話区間
    A-->>B: 認識結果
    B->>T: 認識文とチャット履歴
    T-->>B: 応答テキストとChatMessage
    B-->>R: ChatMessage
    B->>V: 応答テキスト
    V-->>B: 合成音声とモーラ時刻情報
    B-->>R: 合成結果
    R-->>F: text_ch / telop_ch
    R-->>F: WebRTC 音声トラック
```

## 失敗箇所

- `config.json` 取得失敗:
    - フロントの接続先設定、リバースプロキシ、`sincro-rtc` 起動状態を確認する。
- `offer` 失敗:
    - セッション上限、ICE 設定、Offer要求の形式と識別情報を確認する。
- ICE 失敗:
    - フロントの再接続ログ、候補送信、公開ホスト / ポートを確認する。
- 下流サービス接続失敗:
    - パイプライン調停器による処理担当の解決、Consul、代替処理ホスト / ポートを確認する。
- `text_ch` / `telop_ch` 未受信:
    - DataChannel名、接続状態、TextProcessor / Synthesizer の出力キューを確認する。

## 参照

- `documents/design/contracts/frontend-rtc.md`
- `documents/design/contracts/audio-pipeline-websocket.md`
