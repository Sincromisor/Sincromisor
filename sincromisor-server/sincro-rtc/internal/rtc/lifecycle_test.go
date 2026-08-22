package rtc

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func TestSessionLifecycleAllowsOnlyReadinessChainAndClose(t *testing.T) {
	clock := &fakeClock{}
	lifecycle, err := newSessionLifecycle(clock)
	if err != nil {
		t.Fatalf("newSessionLifecycle() error = %v", err)
	}
	route := []sessionState{
		stateAnswerReady,
		stateTransportReady,
		stateMediaReady,
		stateRunning,
		stateClosing,
		stateClosed,
	}
	for _, state := range route {
		if err := lifecycle.transitionLocked(state, "test"); err != nil {
			t.Fatalf("transition to %s error = %v", state, err)
		}
	}
	if err := lifecycle.transitionLocked(stateRunning, "late"); err == nil {
		t.Fatal("closed -> running transition succeeded")
	} else {
		var transitionErr *TransitionError
		if !errors.As(err, &transitionErr) {
			t.Fatalf("transition error type = %T, want *TransitionError", err)
		}
	}
}

func TestSessionLifecycleRejectsSkippedAndReverseTransitions(t *testing.T) {
	tests := []struct {
		name string
		from sessionState
		to   sessionState
	}{
		{name: "created to transport", from: stateCreated, to: stateTransportReady},
		{name: "answer to media", from: stateAnswerReady, to: stateMediaReady},
		{name: "transport to running", from: stateTransportReady, to: stateRunning},
		{name: "media to answer", from: stateMediaReady, to: stateAnswerReady},
		{name: "running to media", from: stateRunning, to: stateMediaReady},
		{name: "closing to running", from: stateClosing, to: stateRunning},
		{name: "closed to closing", from: stateClosed, to: stateClosing},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			lifecycle := &sessionLifecycle{state: test.from}
			err := lifecycle.transitionLocked(test.to, test.name)
			var transitionErr *TransitionError
			if !errors.As(err, &transitionErr) {
				t.Fatalf("transition error = %v, want *TransitionError", err)
			}
			if lifecycle.state != test.from {
				t.Fatalf("state = %s, want unchanged %s", lifecycle.state, test.from)
			}
		})
	}
}

func TestSessionLifecycleAllowsClosingFromEveryNonterminalState(t *testing.T) {
	for _, state := range []sessionState{
		stateCreated,
		stateAnswerReady,
		stateTransportReady,
		stateMediaReady,
		stateRunning,
	} {
		t.Run(string(state), func(t *testing.T) {
			lifecycle := &sessionLifecycle{state: state}
			if err := lifecycle.transitionLocked(stateClosing, "close"); err != nil {
				t.Fatalf("%s -> closing error = %v", state, err)
			}
			if err := lifecycle.transitionLocked(stateClosed, "cleanup"); err != nil {
				t.Fatalf("closing -> closed error = %v", err)
			}
		})
	}
}

func TestDeadlineControllerReplacesStopsAndValidatesTimers(t *testing.T) {
	clock := &fakeClock{}
	controller, err := newDeadlineController(clock)
	if err != nil {
		t.Fatalf("newDeadlineController() error = %v", err)
	}
	if err := controller.replace(preConnectTimeout, func() {}); err != nil {
		t.Fatalf("replace(pre-connect) error = %v", err)
	}
	first := clock.timer(0)
	if err := controller.replace(mediaReadinessTimeout, func() {}); err != nil {
		t.Fatalf("replace(media-readiness) error = %v", err)
	}
	if !first.isStopped() {
		t.Fatal("replaced pre-connect timer was not stopped")
	}
	if got := clock.duration(0); got != preConnectTimeout {
		t.Fatalf("pre-connect duration = %v, want %v", got, preConnectTimeout)
	}
	if got := clock.duration(1); got != mediaReadinessTimeout {
		t.Fatalf("media-readiness duration = %v, want %v", got, mediaReadinessTimeout)
	}
	controller.stop()
	if !clock.timer(1).isStopped() {
		t.Fatal("active media-readiness timer was not stopped")
	}
	if err := controller.replace(0, func() {}); err == nil {
		t.Fatal("replace accepted zero duration")
	}
	if _, err := newDeadlineController(nil); err == nil {
		t.Fatal("newDeadlineController accepted nil clock")
	}
	nilClock := &fakeClock{returnNil: true}
	nilController, err := newDeadlineController(nilClock)
	if err != nil {
		t.Fatalf("newDeadlineController(nil timer clock) error = %v", err)
	}
	if err := nilController.replace(time.Second, func() {}); err == nil {
		t.Fatal("replace accepted nil timer")
	}
}

func TestTimerStopAndFireRaceIsSerializedByLifecycleMutex(t *testing.T) {
	for range 100 {
		clock := &fakeClock{}
		lifecycle, err := newSessionLifecycle(clock)
		if err != nil {
			t.Fatalf("newSessionLifecycle() error = %v", err)
		}
		lifecycle.state = stateAnswerReady
		callbackDone := make(chan struct{})
		if err := lifecycle.deadlines.replace(time.Second, func() {
			lifecycle.mu.Lock()
			if lifecycle.state == stateAnswerReady {
				_ = lifecycle.transitionLocked(stateClosing, "timeout")
			}
			lifecycle.mu.Unlock()
			close(callbackDone)
		}); err != nil {
			t.Fatalf("replace() error = %v", err)
		}
		timer := clock.timer(0)
		var wait sync.WaitGroup
		wait.Add(2)
		go func() {
			defer wait.Done()
			lifecycle.mu.Lock()
			lifecycle.deadlines.stop()
			if lifecycle.state == stateAnswerReady {
				_ = lifecycle.transitionLocked(stateTransportReady, "connected")
			}
			lifecycle.mu.Unlock()
		}()
		go func() {
			defer wait.Done()
			timer.fire()
		}()
		wait.Wait()
		select {
		case <-callbackDone:
		default:
		}
		lifecycle.mu.Lock()
		state := lifecycle.state
		lifecycle.mu.Unlock()
		if state != stateClosing && state != stateTransportReady {
			t.Fatalf("race converged to %s, want closing or transport_ready", state)
		}
	}
}

type fakeClock struct {
	mu        sync.Mutex
	timers    []*fakeTimer
	durations []time.Duration
	returnNil bool
}

func (c *fakeClock) AfterFunc(duration time.Duration, callback func()) Timer {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.returnNil {
		return nil
	}
	timer := &fakeTimer{callback: callback}
	c.timers = append(c.timers, timer)
	c.durations = append(c.durations, duration)
	return timer
}

func (c *fakeClock) timer(index int) *fakeTimer {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.timers[index]
}

func (c *fakeClock) duration(index int) time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.durations[index]
}

type fakeTimer struct {
	mu       sync.Mutex
	stopped  bool
	callback func()
}

func (t *fakeTimer) Stop() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.stopped {
		return false
	}
	t.stopped = true
	return true
}

func (t *fakeTimer) isStopped() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.stopped
}

func (t *fakeTimer) fire() {
	t.mu.Lock()
	if t.stopped {
		t.mu.Unlock()
		return
	}
	callback := t.callback
	t.mu.Unlock()
	callback()
}
