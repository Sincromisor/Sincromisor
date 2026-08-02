package rtc

import (
	"context"
	"errors"
	"fmt"

	"github.com/pion/webrtc/v4"
)

// negotiate はremote Offerからcandidate収集済みlocal Answerを作り、answer_readyを公開する。
//
// caller contextはcandidate収集待機だけを制限する。成功後のtransport deadlineはsession clockへ移し、
// HTTP request終了後もPeerConnection lifecycleとして継続する。
func (s *Session) negotiate(ctx context.Context, offerSDP string) (webrtc.SessionDescription, error) {
	local, _, err := s.negotiateDescription(ctx, offerSDP)
	if err != nil {
		return webrtc.SessionDescription{}, err
	}
	if err := s.answerReady(); err != nil {
		return webrtc.SessionDescription{}, err
	}
	return local, nil
}

// negotiateDescription はremote Offer適用からcandidate収集済みAnswerまでのPion transactionを実行する。
//
// boolはremote descriptionが既にPeerConnectionへ適用されたことを示す。initial callerは失敗時に
// 常にSessionを閉じ、update callerはpartial apply後だけrollback不能として閉じる判断に使う。
// lifecycleのanswer_ready公開はinitial negotiateだけが後段で行う。
func (s *Session) negotiateDescription(
	ctx context.Context,
	offerSDP string,
) (webrtc.SessionDescription, bool, error) {
	if err := s.pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  offerSDP,
	}); err != nil {
		return webrtc.SessionDescription{}, false, fmt.Errorf("set remote offer: %w", err)
	}
	answer, err := s.pc.CreateAnswer(nil)
	if err != nil {
		return webrtc.SessionDescription{}, true, fmt.Errorf("create answer: %w", err)
	}
	gatherComplete := webrtc.GatheringCompletePromise(s.pc)
	if err := s.pc.SetLocalDescription(answer); err != nil {
		return webrtc.SessionDescription{}, true, fmt.Errorf("set local answer: %w", err)
	}
	// Frontend に server-candidate endpoint を追加しないため、local candidates を SDP に集約して返す。
	select {
	case <-ctx.Done():
		return webrtc.SessionDescription{}, true, ctx.Err()
	case <-gatherComplete:
	}
	local := s.pc.LocalDescription()
	if local == nil {
		return webrtc.SessionDescription{}, true, errors.New("local answer is unavailable")
	}
	return *local, true, nil
}

// answerReady はcandidate収集済みinitial Answerを公開し、15秒のtransport deadlineを開始する。
//
// update negotiationはrunning stateを維持するためこの遷移を再利用しない。timer callbackは同じClose
// 経路だけを通知し、Clock.Stopとの競合はlifecycle mutexの取得順で確定する。
func (s *Session) answerReady() error {
	s.lifecycle.mu.Lock()
	defer s.lifecycle.mu.Unlock()
	if err := s.lifecycle.transitionLocked(stateAnswerReady, "answer_generated"); err != nil {
		s.logTransitionError(err)
		return err
	}
	if err := s.lifecycle.deadlines.replace(preConnectTimeout, func() {
		s.metrics().Deadline("pre_connect")
		s.closeIfState(stateAnswerReady, "pre_connect_timeout")
	}); err != nil {
		s.logTransitionError(err)
		return err
	}
	return nil
}
