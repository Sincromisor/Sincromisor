# Pion WebRTC 移行計画

## 要約

- Python / aiortc が担った WebRTC 終端を Go / Pion WebRTC へ移行した記録をまとめる。
- フロントエンドと既存音声処理サービスを一度に置き換えず、RTC 転送とコーデック処理を先に分離する。
- PoCで Opus コーデック、再接続、資源解放を検証した後、本番経路を実装して旧RTC 構成一式を削除した。
- 本ディレクトリは完了済み移行の計画と判断経緯を保存する。各資料の段階・コマンド・構成は移行当時のものであり、現在の起動・更新手順として使わない。

## 現在仕様への入口

[段階6の完了タスク](../../../tasks/sincro-rtc/task-260823061841-pion-phase-6-python-rtc-removal/task.md)で旧Python RTC実装を削除した。現在の実装は[sincro-rtc設計](../../design/backend/services/sincro-rtc.md)、通信形式は[RTC契約](../../design/contracts/frontend-rtc.md)と[WebSocket契約](../../design/contracts/audio-pipeline-websocket.md)、起動・更新は[Compose設計](../../design/infrastructure/compose.md)を参照する。

## ゴール

次の状態を移行の完了とする。

- WebRTC PeerConnection、ICE、DTLS、SRTP、SCTP、RTP / RTCP を Go / Pion が所有する。
- Python は音声認識、テキスト処理、音声合成など、Python エコシステムを利用する処理に集中する。
- 現行のシグナリングエンドポイント / 既存フィールドとDataChannel契約を維持し、`offer_request_id` / `offer_revision` を追加して冪等な初回Offerと同じセッション IDでのICE 再接続を実現する。
- 1セッションにつき1プロセスを廃止し、セッション終了後にgoroutine、ソケット、キュー、コーデック状態が回収される。
- シグナリングの追加フィールドは手書きスキーマと契約テストで固定し、Pion移行と型生成基盤の導入を同時に行わない。

## 文書構成

読む順序は次のとおり。

1. [背景と移行方針](background-and-scope.md)
2. [移行ロードマップ](roadmap.md)
3. [目標アーキテクチャ](target-architecture.md)
4. [通信契約と型共有](contracts-and-types.md)
5. [実装フェーズ](implementation-phases.md)
6. [検証計画](validation-plan.md)
7. [運用移行と現行版の修正で対応](rollout-and-operations.md)
8. [リスクと判断事項](risks-and-decisions.md)

## 文書の正本境界

| 情報                     | 移行中の置き場所                     | 確定後の正本                                                                        |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------- |
| 移行フェーズ、検査       | 本ディレクトリ                       | 完了後に縮退またはアーカイブ                                                        |
| フロントエンド / RTC契約 | 本文から影響を説明                   | [`frontend-rtc.md`](../../design/contracts/frontend-rtc.md)                         |
| Python音声処理工程契約   | 本文から影響を説明                   | [`audio-pipeline-websocket.md`](../../design/contracts/audio-pipeline-websocket.md) |
| 採用理由                 | `risks-and-decisions.md`で候補を整理 | `documents/design/decisions/` のADR                                                 |
| 現在のサービス設計       | 移行前後の差分を説明                 | `documents/design/backend/services/`                                                |
| 実装手順、実測値         | 段階と評価項目を定義                 | 対応する `tasks/` の `impl.md` / `eval.md`                                          |

## 移行時の方針

- Go / Pion WebRTC を採用した。
- Go RTC サーバーが旧 `VoiceTransformTrack` と `AudioBroker` の責務を再構成して所有し、Pythonには下流の音声・言語処理サービスだけを残す。
- 初期統合では既存WebSocket + MessagePack契約をGoから直接利用し、双方向期待結果を固定した検証データで互換性を固定する。
- フロントエンドからPionへはTrickle ICE、Pionからフロントエンドへは候補収集完了後のAnswerを返すhalf-trickleとし、Server→フロントエンドシグナリングエンドポイントは追加しない。
- DataChannel 送受信データはGoで原則解釈せず、Pythonから受け取ったJSONを内容を解釈しない送受信データとして転送する。
- コーデック方式は[採用時のADR](../../design/decisions/ADR-260726-pion-codec-poc.md)で確定した。GoによるOpus復号とmediadevices同梱のlibopusによる符号化を使う。
- PoCから本番切替・旧実装削除までの結果は、各段階からリンクした完了タスクを参照する。

## 外部参照

参照日は2026-07-26とする。

- [Pion WebRTC](https://github.com/pion/webrtc)
- [Pion WebRTC Go パッケージ](https://pkg.go.dev/github.com/pion/webrtc/v4)
