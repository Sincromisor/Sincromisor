// Package synthdecode は VoiceSynthesizer の有限な container 音声を
// browser outbound 処理が使う 48 kHz mono PCM と sample 基準の mora 区間へ変換する。
//
// container demux と codec decode は FFmpeg process 境界へ委ねる。この package は入力、
// 実行時間、出力サイズを制限し、検証済みの完全な発話だけを返す。RTP frame 分割と pacing は
// 後段の責務であり、Decoder は process-wide に共有できる immutable な非所有 dependency である。
package synthdecode
