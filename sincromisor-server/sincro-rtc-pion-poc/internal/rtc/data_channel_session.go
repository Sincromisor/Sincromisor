package rtc

import "github.com/pion/webrtc/v4"

// handleDataChannel はFrontend initiatorが作った既存2 channelを検証し、open latchへ接続する。
//
// 属性検証、同label object identity、OnOpen identity確認を通過した同じobjectだけをdispatcherへ渡す。
// dispatcherはreadinessを変更せず、audioを含むAND latchとCoordinator遅延開始を迂回しない。
func (s *Session) handleDataChannel(channel *webrtc.DataChannel) {
	label := channel.Label()
	switch label {
	case textChannelLabel:
		if !channel.Ordered() || channel.MaxRetransmits() != nil || channel.MaxPacketLifeTime() != nil {
			s.logger.Error("invalid text data channel attributes", "session_id", s.id)
			_ = s.Close("invalid_data_channel")
			return
		}
	case telopChannelLabel:
		maxRetransmits := channel.MaxRetransmits()
		if channel.Ordered() || maxRetransmits == nil || *maxRetransmits != 0 {
			s.logger.Error("invalid telop data channel attributes", "session_id", s.id)
			_ = s.Close("invalid_data_channel")
			return
		}
	default:
		s.logger.Error("unexpected data channel", "session_id", s.id, "label", label)
		_ = s.Close("invalid_data_channel")
		return
	}
	if !s.registerDataChannel(channel) {
		return
	}
	channel.OnOpen(func() {
		if !s.dataChannelOpened(channel) {
			return
		}
		var err error
		if label == textChannelLabel {
			err = s.dispatcher.AttachText(channel)
		} else {
			err = s.dispatcher.AttachTelop(channel)
		}
		if err != nil {
			s.logger.Error("data channel dispatcher attach failed",
				"session_id", s.id, "label", label, "error", err,
			)
			_ = s.Close("data_channel_error")
		}
	})
}
