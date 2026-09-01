package output

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
)

func TestSchedulerDropCreatesPionRTPClockGap(t *testing.T) {
	server, client, track, remoteTracks := newPionPair(t)
	defer func() { _ = server.Close(); _ = client.Close() }()
	encoder, err := NewEncoder()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = encoder.Close() }()
	clock := newFakeOutputClock()
	processor, err := newWithClock(encoder, pionTrackWriter{track}, nil, discardLogger(), clock)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- processor.Run(ctx) }()
	clock.waitTimer(t)

	clock.advance(FrameDuration)
	remote := waitRemoteTrack(t, remoteTracks)
	first := readRTP(t, remote)
	clock.advance(100 * time.Millisecond)
	afterDrop := readRTP(t, remote)
	if delta := afterDrop.Timestamp - first.Timestamp; delta != 5*SampleRate/50 {
		t.Fatalf("RTP timestamp delta after four drops = %d, want %d", delta, 5*SampleRate/50)
	}
	if delta := afterDrop.SequenceNumber - first.SequenceNumber; delta != 5 {
		t.Fatalf("RTP sequence delta after four drops = %d, want 5", delta)
	}

	clock.advance(FrameDuration)
	recovered := readRTP(t, remote)
	if delta := recovered.Timestamp - afterDrop.Timestamp; delta != SampleRate/50 {
		t.Fatalf("recovered RTP timestamp delta = %d, want %d", delta, SampleRate/50)
	}
	if delta := recovered.SequenceNumber - afterDrop.SequenceNumber; delta != 1 {
		t.Fatalf("recovered RTP sequence delta = %d, want 1", delta)
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Processor.Run() error = %v, want context.Canceled", err)
	}
}

func TestSpeechAbortCreatesPionRTPClockGap(t *testing.T) {
	server, client, track, remoteTracks := newPionPair(t)
	defer func() { _ = server.Close(); _ = client.Close() }()
	encoder, err := NewEncoder()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = encoder.Close() }()
	clock := newFakeOutputClock()
	processor, err := newWithClock(encoder, pionTrackWriter{track}, nil, discardLogger(), clock)
	if err != nil {
		t.Fatal(err)
	}
	if err := processor.Enqueue("aborted", synthdecode.DecodedSpeech{
		SpeechID: 1, PCM: make([]int16, 2*SampleRate/50),
	}); err != nil {
		t.Fatal(err)
	}
	if err := processor.Enqueue("next", synthdecode.DecodedSpeech{
		SpeechID: 2, PCM: make([]int16, SampleRate/50),
	}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- processor.Run(ctx) }()
	clock.waitTimer(t)

	clock.advance(FrameDuration)
	remote := waitRemoteTrack(t, remoteTracks)
	first := readRTP(t, remote)
	clock.advance(FrameDuration + SpeechLagAbortThreshold + time.Nanosecond)
	waitCondition(t, time.Second, func() bool { return processor.Stats().SpeechAborted == 1 })
	clock.advance(FrameDuration)
	afterAbort := readRTP(t, remote)
	if delta := afterAbort.Timestamp - first.Timestamp; delta != 14*SampleRate/50 {
		t.Fatalf("RTP timestamp delta after speech abort = %d, want %d", delta, 14*SampleRate/50)
	}
	if delta := afterAbort.SequenceNumber - first.SequenceNumber; delta != 14 {
		t.Fatalf("RTP sequence delta after speech abort = %d, want 14", delta)
	}

	clock.advance(FrameDuration)
	recovered := readRTP(t, remote)
	if delta := recovered.Timestamp - afterAbort.Timestamp; delta != SampleRate/50 {
		t.Fatalf("recovered RTP timestamp delta = %d, want %d", delta, SampleRate/50)
	}
	if delta := recovered.SequenceNumber - afterAbort.SequenceNumber; delta != 1 {
		t.Fatalf("recovered RTP sequence delta = %d, want 1", delta)
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Processor.Run() error = %v, want context.Canceled", err)
	}
}

type pionTrackWriter struct {
	track *webrtc.TrackLocalStaticSample
}

func (w pionTrackWriter) WriteSample(sample Sample) error {
	return w.track.WriteSample(sample.MediaSample)
}

func newPionPair(
	t *testing.T,
) (*webrtc.PeerConnection, *webrtc.PeerConnection, *webrtc.TrackLocalStaticSample, <-chan *webrtc.TrackRemote) {
	t.Helper()
	server, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	client, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		_ = server.Close()
		t.Fatal(err)
	}
	track, err := webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{
		MimeType: webrtc.MimeTypeOpus, ClockRate: SampleRate, Channels: 2,
	}, "deterministic-output", "server")
	if err != nil {
		t.Fatal(err)
	}
	sender, err := server.AddTrack(track)
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		buffer := make([]byte, 1500)
		for {
			if _, _, readErr := sender.Read(buffer); readErr != nil {
				return
			}
		}
	}()
	if _, err := client.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		t.Fatal(err)
	}
	remoteTracks := make(chan *webrtc.TrackRemote, 1)
	client.OnTrack(func(remote *webrtc.TrackRemote, _ *webrtc.RTPReceiver) { remoteTracks <- remote })

	offer, err := client.CreateOffer(nil)
	if err != nil {
		t.Fatal(err)
	}
	clientGathered := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(offer); err != nil {
		t.Fatal(err)
	}
	<-clientGathered
	offerSDP, hostIP := oneHostCandidate(t, client.LocalDescription().SDP, "")
	if err := server.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: offerSDP}); err != nil {
		t.Fatal(err)
	}
	answer, err := server.CreateAnswer(nil)
	if err != nil {
		t.Fatal(err)
	}
	serverGathered := webrtc.GatheringCompletePromise(server)
	if err := server.SetLocalDescription(answer); err != nil {
		t.Fatal(err)
	}
	<-serverGathered
	answerSDP, _ := oneHostCandidate(t, server.LocalDescription().SDP, hostIP)
	if err := client.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: answerSDP}); err != nil {
		t.Fatal(err)
	}
	waitCondition(t, 5*time.Second, func() bool {
		return server.ConnectionState() == webrtc.PeerConnectionStateConnected &&
			client.ConnectionState() == webrtc.PeerConnectionStateConnected
	})
	return server, client, track, remoteTracks
}

func oneHostCandidate(t *testing.T, description, hostIP string) (string, string) {
	t.Helper()
	lines := strings.Split(description, "\n")
	if hostIP == "" {
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) >= 8 && strings.HasPrefix(fields[0], "a=candidate:") &&
				fields[7] == "host" && net.ParseIP(fields[4]).To4() != nil {
				hostIP = fields[4]
				break
			}
		}
	}
	if hostIP == "" {
		t.Fatal("SDP has no IPv4 host candidate for local peer test")
	}
	filtered := make([]string, 0, len(lines))
	kept := 0
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 5 && strings.HasPrefix(fields[0], "a=candidate:") {
			if fields[4] != hostIP {
				continue
			}
			kept++
		}
		filtered = append(filtered, line)
	}
	if kept == 0 {
		t.Fatalf("SDP has no host candidate for selected local address %s", hostIP)
	}
	return strings.Join(filtered, "\n"), hostIP
}

func waitRemoteTrack(t *testing.T, tracks <-chan *webrtc.TrackRemote) *webrtc.TrackRemote {
	t.Helper()
	select {
	case track := <-tracks:
		return track
	case <-time.After(3 * time.Second):
		t.Fatal("remote audio track was not received")
		return nil
	}
}

func readRTP(t *testing.T, track *webrtc.TrackRemote) *rtp.Packet {
	t.Helper()
	packet, _, err := track.ReadRTP()
	if err != nil {
		t.Fatal(err)
	}
	return packet
}

func waitCondition(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		runtime.Gosched()
	}
	t.Fatal("condition did not become true before deadline")
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
