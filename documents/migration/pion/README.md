# Pion WebRTC 移行計画

## Summary

- Python / aiortc が担った WebRTC 終端を Go / Pion WebRTC へ移行した記録をまとめる。
- フロントエンドと既存音声処理サービスを一度に置き換えず、RTC transport と codec 処理を先に分離する。
- PoCで Opus codec、再接続、資源解放を検証した後、本番経路を実装して旧RTC stackを削除した。
- 本ディレクトリは移行中の計画を扱う。確定した現在仕様、契約、判断記録、検証ログの正本は既存の配置規則に従う。

## ゴール

次の状態を移行の完了とする。

- WebRTC PeerConnection、ICE、DTLS、SRTP、SCTP、RTP / RTCP を Go / Pion が所有する。
- Python は音声認識、テキスト処理、音声合成など、Python ecosystem を利用する処理に集中する。
- 現行のsignaling endpoint / 既存fieldとDataChannel契約を維持し、`offer_request_id` / `offer_revision` を追加して冪等なinitial Offerと同じsession IDでのICE restartを実現する。
- 1 session 1 process を廃止し、session終了後にgoroutine、socket、queue、codec stateが回収される。
- signalingの追加fieldは手書きschemaとcontract testで固定し、Pion移行と型生成基盤の導入を同時に行わない。

## 文書構成

読む順序は次のとおり。

1. [背景と移行方針](background-and-scope.md)
2. [移行ロードマップ](roadmap.md)
3. [目標アーキテクチャ](target-architecture.md)
4. [通信契約と型共有](contracts-and-types.md)
5. [実装フェーズ](implementation-phases.md)
6. [検証計画](validation-plan.md)
7. [運用移行とforward-fix](rollout-and-operations.md)
8. [リスクと判断事項](risks-and-decisions.md)

## 文書の正本境界

| 情報                   | 移行中の置き場所                     | 確定後の正本                                                                        |
| ---------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| 移行フェーズ、gate     | 本ディレクトリ                       | 完了後に縮退またはarchive                                                           |
| frontend / RTC契約     | 本文から影響を説明                   | [`frontend-rtc.md`](../../design/contracts/frontend-rtc.md)                         |
| Python音声pipeline契約 | 本文から影響を説明                   | [`audio-pipeline-websocket.md`](../../design/contracts/audio-pipeline-websocket.md) |
| 採用理由               | `risks-and-decisions.md`で候補を整理 | `documents/design/decisions/` のADR                                                 |
| 現在のサービス設計     | 移行前後の差分を説明                 | `documents/design/backend/services/`                                                |
| 実装手順、実測値       | phaseと評価項目を定義                | 対応する `tasks/` の `impl.md` / `eval.md`                                          |

## 現時点の提案

- Go / Pion WebRTC を採用した。
- Go RTC serverが旧 `VoiceTransformTrack` と `AudioBroker` の責務を再構成して所有し、Pythonには下流の音声・言語処理serviceだけを残す。
- 初期統合では既存WebSocket + MessagePack契約をGoから直接利用し、双方向golden fixtureで互換性を固定する。
- FrontendからPionへはTrickle ICE、PionからFrontendへはcandidate収集完了後のAnswerを返すhalf-trickleとし、Server→Frontend signaling endpointは追加しない。
- DataChannel payloadはGoで原則解釈せず、Pythonから受け取ったJSONをopaque payloadとして転送する。
- PionのOpus対応はnegotiation、RTP、packetizationを中心とするため、PCMとのencode / decodeにはlibopus bindingまたはGStreamerを組み合わせる。
- codec実装、資源回収、直接接続のPoCとproduction相当環境のsmoke testが合格するまで、本番移行を確定しない。

## 外部参照

参照日は2026-07-26とする。

- [Pion WebRTC](https://github.com/pion/webrtc)
- [Pion WebRTC Go package](https://pkg.go.dev/github.com/pion/webrtc/v4)
