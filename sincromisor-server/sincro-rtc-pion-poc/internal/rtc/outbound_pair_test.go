package rtc

import (
	"math"
	"testing"
	"time"

	pionopus "github.com/pion/opus"
	"github.com/pion/webrtc/v4"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
)

func TestOutboundSpeechReachesReceiveOnlyBrowserAtMonoTwentyMillisecondCadence(t *testing.T) {
	manager := newTestManager(t)
	t.Cleanup(func() {
		if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
			t.Errorf("CloseAll(test_teardown) error = %v", err)
		}
	})
	client, remoteTracks := newReceiveOnlyBrowserPeer(t)
	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Errorf("client.Close() error = %v", err)
		}
	})
	answer := negotiatePair(t, manager, client)
	session := activeSession(t, manager, answer.SessionID)

	var remoteTrack *webrtc.TrackRemote
	select {
	case remoteTrack = <-remoteTracks:
	case <-time.After(3 * time.Second):
		t.Fatal("browser did not receive the server outbound audio track")
	}
	const speechFrames = 50
	if err := session.output.Enqueue("one second", synthdecode.DecodedSpeech{
		SpeechID: 1,
		PCM:      outboundTestTone(speechFrames * audiomedia.SampleRate / 50),
	}); err != nil {
		t.Fatalf("OutputProcessor.Enqueue() error = %v", err)
	}

	decoder, err := pionopus.NewDecoderWithOutput(audiomedia.SampleRate, 2)
	if err != nil {
		t.Fatalf("NewDecoderWithOutput() error = %v", err)
	}
	var (
		speechTimestamps []uint32
		firstSpeechAt    time.Time
		lastSpeechAt     time.Time
	)
	deadline := time.Now().Add(5 * time.Second)
	for len(speechTimestamps) < speechFrames && time.Now().Before(deadline) {
		packet, _, readErr := remoteTrack.ReadRTP()
		if readErr != nil {
			t.Fatalf("TrackRemote.ReadRTP() error = %v", readErr)
		}
		decoded := make([]int16, 2*audiomedia.SampleRate/50)
		samples, decodeErr := decoder.DecodeToInt16(packet.Payload, decoded)
		if decodeErr != nil {
			t.Fatalf("DecodeToInt16() error = %v", decodeErr)
		}
		if samples != audiomedia.SampleRate/50 {
			t.Fatalf("decoded samples = %d, want %d", samples, audiomedia.SampleRate/50)
		}
		if len(speechTimestamps) == 0 && stereoPeak(decoded) < 500 {
			continue
		}
		assertDuplicatedMono(t, decoded)
		now := time.Now()
		if len(speechTimestamps) == 0 {
			firstSpeechAt = now
		}
		lastSpeechAt = now
		speechTimestamps = append(speechTimestamps, packet.Timestamp)
	}
	if len(speechTimestamps) != speechFrames {
		t.Fatalf("received speech frames = %d, want %d", len(speechTimestamps), speechFrames)
	}
	for index := 1; index < len(speechTimestamps); index++ {
		if delta := speechTimestamps[index] - speechTimestamps[index-1]; delta != audiomedia.SampleRate/50 {
			t.Fatalf("RTP timestamp delta at frame %d = %d, want %d",
				index, delta, audiomedia.SampleRate/50)
		}
	}
	if elapsed := lastSpeechAt.Sub(firstSpeechAt); elapsed < 800*time.Millisecond || elapsed > 1300*time.Millisecond {
		t.Fatalf("50 speech frame arrival elapsed = %v, want real-time 20 ms cadence", elapsed)
	}
}

// newReceiveOnlyBrowserPeer intentionally has no outbound audio track. It verifies
// that stopped browser input does not gate the independently clocked server output.
func newReceiveOnlyBrowserPeer(t *testing.T) (*webrtc.PeerConnection, <-chan *webrtc.TrackRemote) {
	t.Helper()
	client, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("NewPeerConnection() error = %v", err)
	}
	if _, err := client.AddTransceiverFromKind(
		webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly},
	); err != nil {
		t.Fatalf("AddTransceiverFromKind() error = %v", err)
	}
	if _, err := client.CreateDataChannel(
		textChannelLabel,
		&webrtc.DataChannelInit{Ordered: boolPointer(true)},
	); err != nil {
		t.Fatalf("CreateDataChannel(text) error = %v", err)
	}
	ordered := false
	retransmits := uint16(0)
	if _, err := client.CreateDataChannel(telopChannelLabel, &webrtc.DataChannelInit{
		Ordered:        &ordered,
		MaxRetransmits: &retransmits,
	}); err != nil {
		t.Fatalf("CreateDataChannel(telop) error = %v", err)
	}
	tracks := make(chan *webrtc.TrackRemote, 1)
	client.OnTrack(func(track *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		tracks <- track
	})
	return client, tracks
}

func outboundTestTone(samples int) []int16 {
	pcm := make([]int16, samples)
	for index := range pcm {
		pcm[index] = int16(12_000 * math.Sin(2*math.Pi*440*float64(index)/audiomedia.SampleRate))
	}
	return pcm
}

func stereoPeak(pcm []int16) int16 {
	var peak int16
	for _, sample := range pcm {
		value := sample
		if value < 0 {
			value = -value
		}
		if value > peak {
			peak = value
		}
	}
	return peak
}

func assertDuplicatedMono(t *testing.T, pcm []int16) {
	t.Helper()
	for index := 0; index+1 < len(pcm); index += 2 {
		if pcm[index] != pcm[index+1] {
			t.Fatalf("decoded stereo sample %d = %d/%d, want duplicated mono",
				index/2, pcm[index], pcm[index+1])
		}
	}
}
