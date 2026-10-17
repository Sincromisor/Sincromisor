# RTC入力音声のデコードとモノラル化で作業配列を再利用する

## 背景 / 目的

inputStream.decodeはOpusパケットごとにPCM配列を作り、downmixStereoでもモノラル配列を作る。同じストリーム内で作業領域を再利用して割り当てを減らす。

2026-10-17のバックエンド改善調査と起票依頼に基づく。確認したHEADは`c9a6a4eb`。

## 変更範囲

- [processor.go](../../../sincromisor-server/sincro-rtc/internal/media/input/processor.go)
- [processor_test.go](../../../sincromisor-server/sincro-rtc/internal/media/input/processor_test.go)
- [opus_golden_test.go](../../../sincromisor-server/sincro-rtc/internal/media/input/opus_golden_test.go)
- [resample_test.go](../../../sincromisor-server/sincro-rtc/internal/media/input/resample_test.go)

## 設計判断

- デコード先とモノラル化先をinputStreamに所有させ、SSRC切替時は既存のストリームとともに捨てる。有効サンプル数だけを後段へ渡す。
- 同一ストリームの逐次処理を利用し、sync.Poolや全接続共通の作業領域は導入しない。
- packet.Clone、並べ替え、FIR係数と位相、20msフレーム化を維持する。submitへ渡すフレームは独立した所有を保ち、後続パケットで上書きしない。

## 完了条件と確認方法

- [ ] sincro-rtcディレクトリでgo test ./internal/media/inputとgo test -race ./internal/media/inputを実行し、既存のPCM期待値とSSRC切替の動作を維持する。
- [ ] 受領済みフレームを保持したまま次パケットを処理しても値が変わらないことを確認する。
- [ ] 同じ固定入力の小さなベンチマークを変更前後で比較し、対象配列の割り当て減少を確認する。固定の速度目標やネットワーク負荷試験は要求しない。

変更したGoファイルをgofmtで整形する。確認にはgo.modの採用版を使う。

## 非対象

RTPパケットのコピー削減、FIR処理の最適化、キュー・出力エンコーダー・通信契約の変更。

## 文書と契約

設計の外部契約は変更しない。確認結果と判断はこのタスクへ記録する。
[audio-pipeline-websocket.md](../../../documents/design/contracts/audio-pipeline-websocket.md)の既存形式を維持する。依存更新や設定項目の追加は本タスクの前提にしない。
