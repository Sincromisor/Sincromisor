package rtc

import (
	"context"
	"errors"
	"math"
	"runtime"
	"sync"
	"testing"
	"time"

	pionopus "github.com/pion/opus"
	"github.com/pion/rtp"
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

func TestOutboundSchedulerDropCreatesProductionRTPClockGap(t *testing.T) {
	server, client, track, remoteTracks := newDirectOutboundPair(t)
	defer func() {
		_ = server.Close()
		_ = client.Close()
	}()
	encoder, err := audiomedia.NewFrameEncoder()
	if err != nil {
		t.Fatalf("NewFrameEncoder() error = %v", err)
	}
	defer func() { _ = encoder.Close() }()
	clock := newPairOutputClock()
	output, err := audiomedia.NewOutputProcessorWithClock(
		encoder,
		pionSampleWriter{track: track},
		nil,
		testLogger(),
		clock,
	)
	if err != nil {
		t.Fatalf("NewOutputProcessorWithClock() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	runDone := make(chan error, 1)
	go func() { runDone <- output.Run(ctx) }()
	clock.waitTimer(t)

	clock.advance(audiomedia.FrameDuration)
	var remoteTrack *webrtc.TrackRemote
	select {
	case remoteTrack = <-remoteTracks:
	case <-time.After(3 * time.Second):
		t.Fatal("browser did not receive direct outbound track")
	}
	first := readRemoteRTP(t, remoteTrack)

	// The next deadline is 40 ms. Firing at 120 ms drops four expired
	// 20 ms slots, so Pion must skip four sequence numbers and 4*960 ticks
	// before packetizing the current frame.
	clock.advance(100 * time.Millisecond)
	afterDrop := readRemoteRTP(t, remoteTrack)
	if delta := afterDrop.Timestamp - first.Timestamp; delta != 5*audiomedia.SampleRate/50 {
		t.Fatalf("RTP timestamp delta after four drops = %d, want %d",
			delta, 5*audiomedia.SampleRate/50)
	}
	if delta := afterDrop.SequenceNumber - first.SequenceNumber; delta != 5 {
		t.Fatalf("RTP sequence delta after four drops = %d, want 5", delta)
	}

	clock.advance(audiomedia.FrameDuration)
	recovered := readRemoteRTP(t, remoteTrack)
	if delta := recovered.Timestamp - afterDrop.Timestamp; delta != audiomedia.SampleRate/50 {
		t.Fatalf("recovered RTP timestamp delta = %d, want %d",
			delta, audiomedia.SampleRate/50)
	}
	if delta := recovered.SequenceNumber - afterDrop.SequenceNumber; delta != 1 {
		t.Fatalf("recovered RTP sequence delta = %d, want 1", delta)
	}

	cancel()
	if err := <-runDone; !errors.Is(err, context.Canceled) {
		t.Fatalf("OutputProcessor.Run() error = %v, want context.Canceled", err)
	}
}

func newDirectOutboundPair(
	t *testing.T,
) (*webrtc.PeerConnection, *webrtc.PeerConnection, *webrtc.TrackLocalStaticSample, <-chan *webrtc.TrackRemote) {
	t.Helper()
	server, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("NewPeerConnection(server) error = %v", err)
	}
	client, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		_ = server.Close()
		t.Fatalf("NewPeerConnection(client) error = %v", err)
	}
	track, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{
			MimeType: webrtc.MimeTypeOpus, ClockRate: audiomedia.SampleRate, Channels: 2,
		},
		"deterministic-output",
		"server",
	)
	if err != nil {
		t.Fatalf("NewTrackLocalStaticSample() error = %v", err)
	}
	sender, err := server.AddTrack(track)
	if err != nil {
		t.Fatalf("AddTrack() error = %v", err)
	}
	go func() {
		buffer := make([]byte, 1500)
		for {
			if _, _, readErr := sender.Read(buffer); readErr != nil {
				return
			}
		}
	}()
	if _, err := client.AddTransceiverFromKind(
		webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly},
	); err != nil {
		t.Fatalf("AddTransceiverFromKind() error = %v", err)
	}
	remoteTracks := make(chan *webrtc.TrackRemote, 1)
	client.OnTrack(func(remote *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		remoteTracks <- remote
	})

	offer, err := client.CreateOffer(nil)
	if err != nil {
		t.Fatalf("CreateOffer() error = %v", err)
	}
	clientGathered := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(offer); err != nil {
		t.Fatalf("SetLocalDescription(client) error = %v", err)
	}
	<-clientGathered
	offerSDP, hostIP := singleHostCandidateSDP(t, client.LocalDescription().SDP, "")
	if err := server.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer, SDP: offerSDP,
	}); err != nil {
		t.Fatalf("SetRemoteDescription(server) error = %v", err)
	}
	answer, err := server.CreateAnswer(nil)
	if err != nil {
		t.Fatalf("CreateAnswer() error = %v", err)
	}
	serverGathered := webrtc.GatheringCompletePromise(server)
	if err := server.SetLocalDescription(answer); err != nil {
		t.Fatalf("SetLocalDescription(server) error = %v", err)
	}
	<-serverGathered
	answerSDP, _ := singleHostCandidateSDP(t, server.LocalDescription().SDP, hostIP)
	if err := client.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer, SDP: answerSDP,
	}); err != nil {
		t.Fatalf("SetRemoteDescription(client) error = %v", err)
	}
	waitForCondition(t, 5*time.Second, func() bool {
		return server.ConnectionState() == webrtc.PeerConnectionStateConnected &&
			client.ConnectionState() == webrtc.PeerConnectionStateConnected
	})
	return server, client, track, remoteTracks
}

func readRemoteRTP(t *testing.T, track *webrtc.TrackRemote) *rtp.Packet {
	t.Helper()
	packet, _, err := track.ReadRTP()
	if err != nil {
		t.Fatalf("TrackRemote.ReadRTP() error = %v", err)
	}
	return packet
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

type pairOutputClock struct {
	mu    sync.Mutex
	now   time.Time
	timer *pairOutputTimer
	ready chan struct{}
}

func newPairOutputClock() *pairOutputClock {
	return &pairOutputClock{now: time.Unix(0, 0), ready: make(chan struct{})}
}

func (c *pairOutputClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *pairOutputClock) NewTimer(delay time.Duration) audiomedia.OutputTimer {
	c.mu.Lock()
	defer c.mu.Unlock()
	timer := &pairOutputTimer{
		clock: c, deadline: c.now.Add(delay), ticks: make(chan time.Time, 1),
	}
	c.timer = timer
	close(c.ready)
	return timer
}

func (c *pairOutputClock) waitTimer(t *testing.T) {
	t.Helper()
	select {
	case <-c.ready:
	case <-time.After(time.Second):
		t.Fatal("output timer was not created")
	}
}

func (c *pairOutputClock) advance(delta time.Duration) {
	deadline := time.Now().Add(time.Second)
	for {
		c.mu.Lock()
		timer := c.timer
		c.mu.Unlock()
		timer.mu.Lock()
		active := !timer.stopped
		timer.mu.Unlock()
		if active {
			break
		}
		if time.Now().After(deadline) {
			panic("pair output timer was not reset")
		}
		runtime.Gosched()
	}
	c.mu.Lock()
	c.now = c.now.Add(delta)
	now := c.now
	timer := c.timer
	c.mu.Unlock()
	timer.fire(now)
}

type pairOutputTimer struct {
	mu       sync.Mutex
	clock    *pairOutputClock
	deadline time.Time
	ticks    chan time.Time
	stopped  bool
}

func (t *pairOutputTimer) C() <-chan time.Time { return t.ticks }

func (t *pairOutputTimer) Reset(delay time.Duration) bool {
	t.clock.mu.Lock()
	now := t.clock.now
	t.clock.mu.Unlock()
	t.mu.Lock()
	wasActive := !t.stopped
	t.stopped = false
	t.deadline = now.Add(delay)
	t.mu.Unlock()
	return wasActive
}

func (t *pairOutputTimer) Stop() bool {
	t.mu.Lock()
	wasActive := !t.stopped
	t.stopped = true
	t.mu.Unlock()
	return wasActive
}

func (t *pairOutputTimer) fire(now time.Time) {
	t.mu.Lock()
	if t.stopped || now.Before(t.deadline) {
		t.mu.Unlock()
		return
	}
	t.stopped = true
	t.mu.Unlock()
	t.ticks <- now
}
