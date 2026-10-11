package rtc

import (
	"math"
	"testing"
	"time"

	pionopus "github.com/pion/opus"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"

	outputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
)

// TestEchoSessionsReturnAudioAndRemainIsolated はPion実接続で、echoが下流を使わず入力音声を
// 返すことと、一方の終了後も別Sessionの返却が継続することを確認する。
func TestEchoSessionsReturnAudioAndRemainIsolated(t *testing.T) {
	manager := newTestManager(t)
	t.Cleanup(func() { _ = manager.CloseAll(testCloseContext(t), "test_teardown") })
	first, firstInput, firstOutput := newEchoBrowserPeer(t)
	second, secondInput, secondOutput := newEchoBrowserPeer(t)
	t.Cleanup(func() { _ = first.Close() })
	t.Cleanup(func() { _ = second.Close() })

	firstAnswer := negotiatePairWithMode(t, manager, first, "echo")
	secondAnswer := negotiatePairWithMode(t, manager, second, "echo")
	firstSession := activeSession(t, manager, firstAnswer.SessionID)
	secondSession := activeSession(t, manager, secondAnswer.SessionID)
	if firstSession.pipeline != nil || secondSession.pipeline != nil {
		t.Fatal("echo session created a downstream pipeline")
	}

	firstRemote := waitEchoRemoteTrack(t, firstOutput)
	secondRemote := waitEchoRemoteTrack(t, secondOutput)
	writeEchoTone(t, firstInput, 440)
	writeEchoTone(t, secondInput, 660)
	readNonSilentEcho(t, firstRemote)
	readNonSilentEcho(t, secondRemote)

	if err := first.Close(); err != nil {
		t.Fatalf("first browser Close() error = %v", err)
	}
	if err := firstSession.Close("normal"); err != nil {
		t.Fatalf("first echo Session.Close() error = %v", err)
	}
	waitSessionDone(t, firstSession)
	if manager.Count() != 1 {
		t.Fatalf("active sessions after first close = %d, want 1", manager.Count())
	}
	writeEchoTone(t, secondInput, 880)
	readNonSilentEcho(t, secondRemote)
	if secondSession.ctx.Err() != nil {
		t.Fatal("second echo session stopped after first session closed")
	}
}

func newEchoBrowserPeer(t *testing.T) (*webrtc.PeerConnection, *webrtc.TrackLocalStaticSample, <-chan *webrtc.TrackRemote) {
	t.Helper()
	client, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("NewPeerConnection() error = %v", err)
	}
	input, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: outputmedia.SampleRate, Channels: 2},
		"browser-audio", "browser",
	)
	if err != nil {
		t.Fatalf("NewTrackLocalStaticSample() error = %v", err)
	}
	if _, err := client.AddTrack(input); err != nil {
		t.Fatalf("AddTrack() error = %v", err)
	}
	if _, err := client.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		t.Fatalf("AddTransceiverFromKind() error = %v", err)
	}
	if _, err := client.CreateDataChannel(textChannelLabel, &webrtc.DataChannelInit{Ordered: boolPointer(true)}); err != nil {
		t.Fatalf("CreateDataChannel(text) error = %v", err)
	}
	ordered := false
	retransmits := uint16(0)
	if _, err := client.CreateDataChannel(telopChannelLabel, &webrtc.DataChannelInit{Ordered: &ordered, MaxRetransmits: &retransmits}); err != nil {
		t.Fatalf("CreateDataChannel(telop) error = %v", err)
	}
	remote := make(chan *webrtc.TrackRemote, 1)
	client.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) { remote <- track })
	return client, input, remote
}

func waitEchoRemoteTrack(t *testing.T, tracks <-chan *webrtc.TrackRemote) *webrtc.TrackRemote {
	t.Helper()
	select {
	case track := <-tracks:
		return track
	case <-time.After(3 * time.Second):
		t.Fatal("echo browser did not receive an outbound audio track")
		return nil
	}
}

func writeEchoTone(t *testing.T, track *webrtc.TrackLocalStaticSample, frequency float64) {
	t.Helper()
	encoder, err := outputmedia.NewEncoder()
	if err != nil {
		t.Fatalf("NewEncoder() error = %v", err)
	}
	defer encoder.Close()
	pcm := make([]int16, outputmedia.SampleRate/50)
	for index := range pcm {
		pcm[index] = int16(12_000 * math.Sin(2*math.Pi*frequency*float64(index)/outputmedia.SampleRate))
	}
	packet, err := encoder.Encode(pcm)
	if err != nil {
		t.Fatalf("Encode() error = %v", err)
	}
	if err := track.WriteSample(media.Sample{Data: packet, Duration: outputmedia.FrameDuration}); err != nil {
		t.Fatalf("WriteSample() error = %v", err)
	}
}

func readNonSilentEcho(t *testing.T, track *webrtc.TrackRemote) {
	t.Helper()
	decoder, err := pionopus.NewDecoderWithOutput(outputmedia.SampleRate, 2)
	if err != nil {
		t.Fatalf("NewDecoderWithOutput() error = %v", err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		packet, _, err := track.ReadRTP()
		if err != nil {
			t.Fatalf("ReadRTP() error = %v", err)
		}
		pcm := make([]int16, outputmedia.SampleRate/25)
		if _, err := decoder.DecodeToInt16(packet.Payload, pcm); err != nil {
			t.Fatalf("DecodeToInt16() error = %v", err)
		}
		if stereoPeak(pcm) > 500 {
			return
		}
	}
	t.Fatal("echo outbound track did not receive non-silent audio")
}
