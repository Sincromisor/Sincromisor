package rtc

import "github.com/pion/webrtc/v4"

const (
	textChannelLabel  = "text_ch"
	telopChannelLabel = "telop_ch"
)

var (
	textSmokePayload  = []byte(`{"message_id":"pion-poc-1","message_type":"assistant","speaker_id":"pion-poc","speaker_name":"Pion PoC","speech_id":1,"expression_code":0,"message":"DataChannel smoke","created_at":0}`)
	telopSmokePayload = []byte(`{"speech_id":1,"timestamp":0,"message":"DataChannel smoke","vowel":"a","text":"DataChannel smoke","length":1,"new_text":true}`)
)

// handleDataChannel は Frontend initiatorが作った既存2 channelを検証し、open latchへ接続する。
//
// text_chはordered/reliable、telop_chはunordered/maxRetransmits=0だけを受理する。未知labelや属性違反、
// 別objectの同label、send errorはapplication契約を継続できないためsessionのclose-onceへ合流する。
// pipeline readinessはchannel到着時ではなくOnOpen時に成立し、両channelとaudioが揃うまで遅延される。
func (s *Session) handleDataChannel(channel *webrtc.DataChannel) {
	label := channel.Label()
	var payload []byte
	switch label {
	case textChannelLabel:
		if !channel.Ordered() || channel.MaxRetransmits() != nil || channel.MaxPacketLifeTime() != nil {
			s.logger.Error("invalid text data channel attributes", "session_id", s.id)
			_ = s.Close("invalid_data_channel")
			return
		}
		payload = textSmokePayload
	case telopChannelLabel:
		maxRetransmits := channel.MaxRetransmits()
		if channel.Ordered() || maxRetransmits == nil || *maxRetransmits != 0 {
			s.logger.Error("invalid telop data channel attributes", "session_id", s.id)
			_ = s.Close("invalid_data_channel")
			return
		}
		payload = telopSmokePayload
	default:
		s.logger.Error("unexpected data channel", "session_id", s.id, "label", label)
		_ = s.Close("invalid_data_channel")
		return
	}
	if !s.registerDataChannel(channel) {
		return
	}
	// Frontend parser を無変更で通す固定 JSON を channel open 後に 1 回だけ送る。返信は要求しない。
	channel.OnOpen(func() {
		if !s.dataChannelOpened(channel) {
			return
		}
		if err := channel.SendText(string(payload)); err != nil {
			s.logger.Error("data channel smoke send failed", "session_id", s.id, "label", label, "error", err)
			_ = s.Close("data_channel_error")
			return
		}
		s.logger.Info("data channel smoke sent", "session_id", s.id, "label", label)
	})
}
