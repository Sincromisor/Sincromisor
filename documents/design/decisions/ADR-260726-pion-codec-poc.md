# ADR-260726 Pion codec PoC

## Status

- Accepted

## Context

aiortc backendはWebRTC transport、codec、session lifecycle、会話pipelineの調停を同じPython側へ集約している。
Go / Pionへの移行に先立ち、production品質のnetwork / performance harnessを構築する前に、
現行Frontend契約を保った基本経路が成立するかを確認する必要があった。

詳細なaiortc baseline、Firefox、NAT、ICE restart、network impairment、soak、性能比較は検証基盤自体が大きく、
趣味プロダクトの技術選択を止める前提から外した。

## Decision

Pion v4 + Pion Opus decoder + mediadevices/libopus encoderを後続実装の出発点とする。

- WebRTC transportは `github.com/pion/webrtc/v4 v4.2.17` を使う。
- inbound Opusは `github.com/pion/opus v0.1.0` のpure Go decoderで48 kHz PCMへ変換する。
- outbound Opusは `github.com/pion/mediadevices v0.10.0` に同梱されたstatic libopus encoderを使う。
- outbound encoderだけをcgo範囲とし、`dynamic` build tagとsystem libopusは使わない。
- signalingは現行HTTP schemaを維持し、Phase 1ではinitial Offerとlocal host candidateだけを扱う。
- production network、ICE restart、下流Python service接続、resample、品質・性能検証は後続phaseで実装する。

Google Chrome 150のlocal smokeでhalf-trickle接続、100 packet以上のinbound decode、1秒test tone再生、
2 DataChannel、10回closeが成立した。詳細な実測値と手順は対応task artifactを参照する。

## Options Considered

| 選択肢                              | 利点                                         | 欠点                                           |
| ----------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Pion + pure Go decode + static Opus | decodeのcgo不要、encoderの配布物がmodule同梱 | encoderにはCGO toolchainとC compilerが必要     |
| Pion + system libopus               | OS packageのcodecを利用できる                | runtime/build環境のsystem dependencyが増える   |
| GStreamer                           | decode / resample / encodeをpipeline化できる | runtime dependencyとpipeline lifecycleが増える |
| aiortc継続                          | 現行実装を維持できる                         | transportと会話orchestrationのPython集中が残る |

## Consequences

- Phase 2は既存Python下流serviceと互換なGo pipeline clientを独立して実装できる。
- Phase 3はPoCのpackage構造をproduction frameworkとして流用せず、session ownershipと境界を設計し直す。
- Phase 4でChrome / Firefox、fixed UDP mux、NAT / firewall、impairment、soak、aiortc性能比較を実行する。
- codec adapterが対象platformでbuildできない場合は、Pion全体を棄却せずencoder境界だけを再評価する。

## Review Conditions

- pure Go decoderが実運用のOpus mode / packet loss条件を満たさない。
- mediadevices同梱static archiveが対象platformまたは配布方式を満たさない。
- Phase 3 / 4でbrowser interoperability、resource回収、session lifecycleに解消不能な問題が見つかる。
- 下流pipeline統合後にPion経路だけで重大なlatencyまたは音質退行が再現する。

## References

- [Frontend RTC契約](../contracts/frontend-rtc.md)
- [Pion移行ロードマップ](../../migration/pion/roadmap.md)
- `tasks/sincro-rtc/task-260726150803-pion-codec-poc-gate-1/`
