package media

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"math"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
)

func TestOutputAbsoluteClockSilenceCadenceAndExpiredDrop(t *testing.T) {
	clock := newFakeOutputClock()
	encoder := &fakeOutputEncoder{}
	track := newFakeOutputTrack()
	processor := newOutputWithFakes(t, encoder, track, clock, 0)
	ctx, cancel := context.WithCancel(context.Background())
	done := runOutput(t, processor, ctx)
	clock.waitTimer(t)

	clock.advance(19 * time.Millisecond)
	assertNoOutputSample(t, track)
	clock.advance(time.Millisecond)
	first := receiveOutputSample(t, track)
	if first.SamplePosition != 0 || first.RTPTimestamp != 0 {
		t.Fatalf("first clock sample = %d/%d, want 0/0", first.SamplePosition, first.RTPTimestamp)
	}
	assertSilenceFrame(t, encoder.frameAt(t, 0))

	clock.advance(FrameDuration)
	second := receiveOutputSample(t, track)
	if second.SamplePosition != frameSamples {
		t.Fatalf("second sample position = %d, want %d", second.SamplePosition, frameSamples)
	}

	// The next absolute deadline is 60 ms. Arriving at 160 ms expires five
	// silence slots, which advance the timestamp but produce only one packet.
	clock.advance(120 * time.Millisecond)
	afterDrop := receiveOutputSample(t, track)
	if got := processor.Stats().SilenceDropped; got != 5 {
		t.Fatalf("silence dropped = %d, want 5", got)
	}
	if want := uint64(frameSamples * 7); afterDrop.SamplePosition != want {
		t.Fatalf("post-drop position = %d, want %d", afterDrop.SamplePosition, want)
	}
	if got := afterDrop.MediaSample.PrevDroppedPackets; got != 5 {
		t.Fatalf("post-drop previous dropped packets = %d, want 5", got)
	}
	assertNoOutputSample(t, track)

	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
	if !clock.timerStopped() {
		t.Fatal("Run did not stop its owned timer")
	}
}

func TestOutputSpeechLagBoundaryAbortOrderAndNextCadence(t *testing.T) {
	clock := newFakeOutputClock()
	encoder := &fakeOutputEncoder{}
	track := newFakeOutputTrack()
	processor := newOutputWithFakes(t, encoder, track, clock, 0)
	if err := processor.Enqueue("first", synthdecode.DecodedSpeech{
		SpeechID: 1, PCM: constantPCM(3*frameSamples, 11),
	}); err != nil {
		t.Fatalf("Enqueue(first) error = %v", err)
	}
	if err := processor.Enqueue("second", synthdecode.DecodedSpeech{
		SpeechID: 2, PCM: constantPCM(frameSamples, 22),
	}); err != nil {
		t.Fatalf("Enqueue(second) error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := runOutput(t, processor, ctx)
	clock.waitTimer(t)

	clock.advance(FrameDuration)
	_ = receiveOutputSample(t, track)
	if got := encoder.frameAt(t, 0)[0]; got != 11 {
		t.Fatalf("first speech sample = %d, want 11", got)
	}

	// Exactly 250 ms is still accepted. The absolute deadline is re-anchored
	// instead of burst-sending the delayed speech frames.
	clock.advance(FrameDuration + SpeechLagAbortThreshold)
	acceptedAtBoundary := receiveOutputSample(t, track)
	if got := acceptedAtBoundary.MediaSample.PrevDroppedPackets; got != 12 {
		t.Fatalf("threshold frame previous dropped packets = %d, want 12", got)
	}
	if got := processor.Stats().SpeechAborted; got != 0 {
		t.Fatalf("speech aborted at threshold = %d, want 0", got)
	}
	if got := encoder.frameAt(t, 1)[0]; got != 11 {
		t.Fatalf("second speech frame sample = %d, want 11", got)
	}
	assertNoOutputSample(t, track)

	// The new deadline is 20 ms after the accepted delayed frame. Exceeding it
	// by one nanosecond aborts only the remaining first speech.
	clock.advance(FrameDuration + SpeechLagAbortThreshold + time.Nanosecond)
	assertNoOutputSample(t, track)
	waitForOutputStat(t, processor, func(stats OutputStats) bool { return stats.SpeechAborted == 1 })

	clock.advance(FrameDuration - time.Nanosecond)
	assertNoOutputSample(t, track)
	clock.advance(time.Nanosecond)
	afterAbort := receiveOutputSample(t, track)
	if got := encoder.frameAt(t, 2)[0]; got != 22 {
		t.Fatalf("next speech sample = %d, want 22", got)
	}
	if got := afterAbort.MediaSample.PrevDroppedPackets; got != 13 {
		t.Fatalf("post-abort previous dropped packets = %d, want 13", got)
	}
	if want := uint64(27 * frameSamples); afterAbort.SamplePosition != want {
		t.Fatalf("post-abort sample position = %d, want %d", afterAbort.SamplePosition, want)
	}

	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
}

func TestOutputTimestampWraparound(t *testing.T) {
	clock := newFakeOutputClock()
	track := newFakeOutputTrack()
	start := uint64(math.MaxUint32) - uint64(frameSamples/2)
	processor := newOutputWithFakes(t, &fakeOutputEncoder{}, track, clock, start)
	ctx, cancel := context.WithCancel(context.Background())
	done := runOutput(t, processor, ctx)
	clock.waitTimer(t)

	clock.advance(FrameDuration)
	first := receiveOutputSample(t, track)
	clock.advance(3 * FrameDuration)
	second := receiveOutputSample(t, track)
	if first.RTPTimestamp != uint32(start) {
		t.Fatalf("first RTP timestamp = %d, want %d", first.RTPTimestamp, uint32(start))
	}
	if want := uint32(start + 3*frameSamples); second.RTPTimestamp != want {
		t.Fatalf("wrapped RTP timestamp = %d, want %d", second.RTPTimestamp, want)
	}
	if second.SamplePosition != start+3*frameSamples {
		t.Fatalf("absolute sample position = %d, want %d", second.SamplePosition, start+3*frameSamples)
	}
	if got := second.MediaSample.PrevDroppedPackets; got != 2 {
		t.Fatalf("wrapped sample previous dropped packets = %d, want 2", got)
	}

	cancel()
	<-done
}

func TestOutputConsecutiveDropsAccumulateUntilSuccessfulWrite(t *testing.T) {
	track := newFakeOutputTrack()
	processor := newOutputWithFakes(
		t,
		&fakeOutputEncoder{},
		track,
		newFakeOutputClock(),
		0,
	)
	processor.skipSamplePositions(2)
	processor.skipSamplePositions(3)
	if err := processor.writeFrame(); err != nil {
		t.Fatalf("writeFrame() error = %v", err)
	}
	first := receiveOutputSample(t, track)
	if got := first.MediaSample.PrevDroppedPackets; got != 5 {
		t.Fatalf("accumulated previous dropped packets = %d, want 5", got)
	}
	if err := processor.writeFrame(); err != nil {
		t.Fatalf("second writeFrame() error = %v", err)
	}
	second := receiveOutputSample(t, track)
	if got := second.MediaSample.PrevDroppedPackets; got != 0 {
		t.Fatalf("previous dropped packets after successful write = %d, want 0", got)
	}

	processor.skipSamplePositions(math.MaxUint16 + 1)
	if err := processor.writeFrame(); err == nil {
		t.Fatal("writeFrame() accepted a drop count beyond Pion's uint16 boundary")
	}
}

func TestOutputCodecAndTrackErrorsStopClockAndRejectPostCloseEnqueue(t *testing.T) {
	tests := []struct {
		name       string
		encoderErr error
		trackErr   error
	}{
		{name: "codec", encoderErr: errors.New("codec failed")},
		{name: "track", trackErr: errors.New("track failed")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			clock := newFakeOutputClock()
			encoder := &fakeOutputEncoder{err: test.encoderErr}
			track := newFakeOutputTrack()
			track.err = test.trackErr
			processor := newOutputWithFakes(t, encoder, track, clock, 0)
			done := runOutput(t, processor, context.Background())
			clock.waitTimer(t)
			clock.advance(FrameDuration)
			if err := <-done; err == nil {
				t.Fatal("Run() accepted injected output failure")
			}
			if !clock.timerStopped() {
				t.Fatal("Run did not stop timer after output failure")
			}
			if err := processor.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
			err := processor.Enqueue("late", synthdecode.DecodedSpeech{
				SpeechID: 9, PCM: make([]int16, frameSamples),
			})
			if !errors.Is(err, ErrOutputClosed) {
				t.Fatalf("post-close Enqueue() error = %v, want ErrOutputClosed", err)
			}
		})
	}
}

func newOutputWithFakes(
	t *testing.T,
	encoder outputEncoder,
	track SampleWriter,
	clock OutputClock,
	start uint64,
) *OutputProcessor {
	t.Helper()
	processor, err := newOutputProcessorWithHooks(
		encoder,
		track,
		nil,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		clock,
		start,
	)
	if err != nil {
		t.Fatalf("newOutputProcessorWithHooks() error = %v", err)
	}
	return processor
}

func runOutput(t *testing.T, processor *OutputProcessor, ctx context.Context) <-chan error {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- processor.Run(ctx) }()
	return done
}

func constantPCM(samples int, value int16) []int16 {
	pcm := make([]int16, samples)
	for index := range pcm {
		pcm[index] = value
	}
	return pcm
}

func assertSilenceFrame(t *testing.T, frame []int16) {
	t.Helper()
	for _, sample := range frame {
		if sample != 0 {
			t.Fatalf("silence contains sample %d", sample)
		}
	}
}

type fakeOutputEncoder struct {
	mu     sync.Mutex
	frames [][]int16
	err    error
}

func (e *fakeOutputEncoder) Encode(frame []int16) ([]byte, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.frames = append(e.frames, append([]int16(nil), frame...))
	if e.err != nil {
		return nil, e.err
	}
	return []byte{byte(len(e.frames))}, nil
}

func (e *fakeOutputEncoder) frameAt(t *testing.T, index int) []int16 {
	t.Helper()
	e.mu.Lock()
	defer e.mu.Unlock()
	if index >= len(e.frames) {
		t.Fatalf("encoded frame %d is missing; count=%d", index, len(e.frames))
	}
	return append([]int16(nil), e.frames[index]...)
}

type fakeOutputTrack struct {
	mu      sync.Mutex
	samples []OutputSample
	writes  chan OutputSample
	err     error
}

func newFakeOutputTrack() *fakeOutputTrack {
	return &fakeOutputTrack{writes: make(chan OutputSample, 16)}
}

func (t *fakeOutputTrack) WriteSample(sample OutputSample) error {
	t.mu.Lock()
	t.samples = append(t.samples, sample)
	err := t.err
	t.mu.Unlock()
	if err == nil {
		t.writes <- sample
	}
	return err
}

func receiveOutputSample(t *testing.T, track *fakeOutputTrack) OutputSample {
	t.Helper()
	select {
	case sample := <-track.writes:
		return sample
	case <-time.After(time.Second):
		t.Fatal("output sample was not written")
		return OutputSample{}
	}
}

func assertNoOutputSample(t *testing.T, track *fakeOutputTrack) {
	t.Helper()
	select {
	case sample := <-track.writes:
		t.Fatalf("unexpected output sample: %+v", sample)
	default:
	}
}

func waitForOutputStat(t *testing.T, processor *OutputProcessor, predicate func(OutputStats) bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for !predicate(processor.Stats()) {
		if time.Now().After(deadline) {
			t.Fatal("output stats did not reach the expected state")
		}
		runtime.Gosched()
	}
}

type fakeOutputClock struct {
	mu    sync.Mutex
	now   time.Time
	timer *fakeOutputTimer
	ready chan struct{}
}

func newFakeOutputClock() *fakeOutputClock {
	return &fakeOutputClock{now: time.Unix(0, 0), ready: make(chan struct{})}
}

func (c *fakeOutputClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeOutputClock) NewTimer(delay time.Duration) OutputTimer {
	c.mu.Lock()
	defer c.mu.Unlock()
	timer := &fakeOutputTimer{
		clock: c, deadline: c.now.Add(delay), ticks: make(chan time.Time, 1),
	}
	c.timer = timer
	close(c.ready)
	return timer
}

func (c *fakeOutputClock) waitTimer(t *testing.T) {
	t.Helper()
	select {
	case <-c.ready:
	case <-time.After(time.Second):
		t.Fatal("output timer was not created")
	}
}

func (c *fakeOutputClock) advance(delta time.Duration) {
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
			panic("fake output timer was not reset")
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

func (c *fakeOutputClock) timerStopped() bool {
	c.mu.Lock()
	timer := c.timer
	c.mu.Unlock()
	timer.mu.Lock()
	defer timer.mu.Unlock()
	return timer.stopped
}

type fakeOutputTimer struct {
	mu       sync.Mutex
	clock    *fakeOutputClock
	deadline time.Time
	ticks    chan time.Time
	stopped  bool
}

func (t *fakeOutputTimer) C() <-chan time.Time { return t.ticks }

func (t *fakeOutputTimer) Reset(delay time.Duration) bool {
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

func (t *fakeOutputTimer) Stop() bool {
	t.mu.Lock()
	wasActive := !t.stopped
	t.stopped = true
	t.mu.Unlock()
	return wasActive
}

func (t *fakeOutputTimer) fire(now time.Time) {
	t.mu.Lock()
	if t.stopped || now.Before(t.deadline) {
		t.mu.Unlock()
		return
	}
	t.stopped = true
	t.mu.Unlock()
	t.ticks <- now
}
