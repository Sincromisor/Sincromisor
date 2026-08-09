package client

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func TestConnectionSetActivationGateClassifiesEvents(t *testing.T) {
	t.Run("event before activate rejects publication", func(t *testing.T) {
		events := make(chan Event, 1)
		cancelled := make(chan struct{})
		var cancelOnce sync.Once
		set := &connectionSet{
			cancel: func() { cancelOnce.Do(func() { close(cancelled) }) }, closeDone: make(chan struct{}),
		}
		set.watch(ServiceExtractor, events)
		events <- Event{Service: ServiceExtractor, Kind: EventRemoteClose, Err: errors.New("closed")}
		select {
		case <-cancelled:
		case <-time.After(time.Second):
			t.Fatal("building-set event did not cancel the connect attempt")
		}
		if err := set.Activate(func(Event) {}); err == nil {
			t.Fatal("Activate() published a set that failed while building")
		}
		close(events)
		if err := set.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	t.Run("event after activate is delivered once", func(t *testing.T) {
		events := make(chan Event, 1)
		delivered := make(chan Event, 1)
		set := &connectionSet{
			cancel: func() {}, closeDone: make(chan struct{}),
		}
		set.watch(ServiceRecognizer, events)
		if err := set.Activate(func(event Event) { delivered <- event }); err != nil {
			t.Fatalf("Activate() error = %v", err)
		}
		events <- Event{Service: ServiceRecognizer, Kind: EventDecodeFailed, Err: errors.New("decode")}
		select {
		case event := <-delivered:
			if event.Service != ServiceRecognizer || event.Kind != EventDecodeFailed {
				t.Fatalf("delivered event = %+v", event)
			}
		case <-time.After(time.Second):
			t.Fatal("published-set event was not delivered")
		}
		close(events)
		if err := set.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	t.Run("channel close before activate is not failure", func(t *testing.T) {
		events := make(chan Event)
		set := &connectionSet{
			cancel: func() {}, closeDone: make(chan struct{}),
		}
		set.watch(ServiceExtractor, events)
		close(events)
		if err := set.Activate(func(Event) {}); err != nil {
			t.Fatalf("Activate() treated event channel close as failure: %v", err)
		}
		if err := set.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	t.Run("watcher panic identifies watched service", func(t *testing.T) {
		events := make(chan Event, 1)
		delivered := make(chan Event, 1)
		set := &connectionSet{cancel: func() {}, closeDone: make(chan struct{})}
		set.watch(ServiceProcessor, events)
		if err := set.Activate(func(event Event) {
			if event.Kind == EventPanic {
				delivered <- event
				return
			}
			panic("handler panic")
		}); err != nil {
			t.Fatalf("Activate() error = %v", err)
		}
		events <- Event{Service: ServiceProcessor, Kind: EventRemoteClose}
		select {
		case event := <-delivered:
			if event.Service != ServiceProcessor || event.Kind != EventPanic {
				t.Fatalf("panic event = %+v", event)
			}
		case <-time.After(time.Second):
			t.Fatal("watcher panic was not delivered")
		}
		if err := set.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})
}
