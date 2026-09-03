package output

import (
	"context"
	"io"
	"log/slog"
	"runtime"
	"sync"
	"testing"
	"time"
)

// newOutputWithFakes は送信時計の各境界を差し替えたProcessorを作る。
func newOutputWithFakes(
	t *testing.T,
	encoder outputEncoder,
	track SampleWriter,
	clock clock,
	start uint64,
) *Processor {
	t.Helper()
	processor, err := newProcessorWithHooks(
		encoder,
		track,
		nil,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		clock,
		start,
	)
	if err != nil {
		t.Fatalf("newProcessorWithHooks() error = %v", err)
	}
	return processor
}

// runOutput はProcessorを非同期に動かし、終了結果を試験へ返す。
func runOutput(t *testing.T, processor *Processor, ctx context.Context) <-chan error {
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

// fakeOutputEncoder は入力PCMを保存し、符号化失敗を注入できる境界である。
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

// fakeOutputTrack は書き込み結果を試験へ渡し、トラック失敗を注入できる境界である。
type fakeOutputTrack struct {
	mu      sync.Mutex
	samples []Sample
	writes  chan Sample
	err     error
}

func newFakeOutputTrack() *fakeOutputTrack {
	return &fakeOutputTrack{writes: make(chan Sample, 16)}
}

func (t *fakeOutputTrack) WriteSample(sample Sample) error {
	t.mu.Lock()
	t.samples = append(t.samples, sample)
	err := t.err
	t.mu.Unlock()
	if err == nil {
		t.writes <- sample
	}
	return err
}

func receiveSample(t *testing.T, track *fakeOutputTrack) Sample {
	t.Helper()
	select {
	case sample := <-track.writes:
		return sample
	case <-time.After(time.Second):
		t.Fatal("output sample was not written")
		return Sample{}
	}
}

func assertNoSample(t *testing.T, track *fakeOutputTrack) {
	t.Helper()
	select {
	case sample := <-track.writes:
		t.Fatalf("unexpected output sample: %+v", sample)
	default:
	}
}

func waitForOutputStat(t *testing.T, processor *Processor, predicate func(Stats) bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for !predicate(processor.Stats()) {
		if time.Now().After(deadline) {
			t.Fatal("output stats did not reach the expected state")
		}
		runtime.Gosched()
	}
}

// fakeOutputClock は単調な試験時刻とProcessorが所有するタイマーを結び付ける。
type fakeOutputClock struct {
	mu    sync.Mutex
	now   time.Time
	timer *fakeTimer
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

func (c *fakeOutputClock) NewTimer(delay time.Duration) timer {
	c.mu.Lock()
	defer c.mu.Unlock()
	timer := &fakeTimer{
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

// fakeTimer は偽時計が明示的に進んだ時だけ期限通知を発火する。
type fakeTimer struct {
	mu       sync.Mutex
	clock    *fakeOutputClock
	deadline time.Time
	ticks    chan time.Time
	stopped  bool
}

func (t *fakeTimer) C() <-chan time.Time { return t.ticks }

func (t *fakeTimer) Reset(delay time.Duration) bool {
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

func (t *fakeTimer) Stop() bool {
	t.mu.Lock()
	wasActive := !t.stopped
	t.stopped = true
	t.mu.Unlock()
	return wasActive
}

func (t *fakeTimer) fire(now time.Time) {
	t.mu.Lock()
	if t.stopped || now.Before(t.deadline) {
		t.mu.Unlock()
		return
	}
	t.stopped = true
	t.mu.Unlock()
	t.ticks <- now
}
