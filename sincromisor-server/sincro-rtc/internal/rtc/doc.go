// Package rtc はPion PeerConnection、メディア準備、RTCセッションの生存期間と台帳を所有する。
// 検証済みDataChannelの送信はdatachannel、候補と外部アドレス処理はnetwork、音声入出力はmedia、
// 会話処理はpipelineへ委ね、このパッケージが各所有者の開始と終了を調停する。
package rtc
