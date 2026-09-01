package pipeline

import (
	"context"
	"errors"
	"testing"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
)

func TestCoordinatorPublishesInitialAndResetGenerationChanges(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-generation", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if generation := receive(t, coordinator.GenerationChanges()); generation != 1 {
		t.Fatalf("initial generation = %d, want 1", generation)
	}
	factory.setAt(t, 0).emit(pclient.Event{
		Service: pclient.ServiceRecognizer,
		Kind:    pclient.EventRemoteClose,
		Err:     errors.New("advance"),
	})
	if generation := receive(t, coordinator.GenerationChanges()); generation != 2 {
		t.Fatalf("reset generation = %d, want 2", generation)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	assertChannelEventuallyClosed(t, coordinator.GenerationChanges(), "generation")
}

func TestCoordinatorResetIsSingleFlightAndPreservesConfirmedHistory(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-reset", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
		t.Fatalf("SubmitPCM() error = %v", err)
	}
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.SynthResults())

	first := factory.setAt(t, 0)
	first.emit(pclient.Event{Service: pclient.ServiceRecognizer, Kind: pclient.EventRemoteClose, Err: errors.New("closed")})
	first.emit(pclient.Event{Service: pclient.ServiceProcessor, Kind: pclient.EventReadFailed, Err: errors.New("same failure")})
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.state == StateRunning && coordinator.generation == 2
	})
	if factory.count() != 2 {
		t.Fatalf("single failure generation made %d sets, want 2", factory.count())
	}
	if first.closeCount() != 1 {
		t.Fatalf("old set Close count = %d, want 1", first.closeCount())
	}
	if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
		t.Fatalf("SubmitPCM() after reset error = %v", err)
	}
	secondUser := receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.TextResults())
	_ = receive(t, coordinator.SynthResults())
	if secondUser.Generation != 2 {
		t.Fatalf("post-reset generation = %d, want 2", secondUser.Generation)
	}
	second := factory.setAt(t, 1)
	if len(second.processor.lastRequest.History.Messages) < 3 {
		t.Fatalf("confirmed history was not carried across reset: %+v", second.processor.lastRequest.History)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestCoordinatorResetsForEveryServiceTerminalKind(t *testing.T) {
	services := []pclient.Service{
		pclient.ServiceExtractor, pclient.ServiceRecognizer,
		pclient.ServiceProcessor, pclient.ServiceSynthesizer,
	}
	kinds := []pclient.EventKind{
		pclient.EventRemoteClose, pclient.EventDecodeFailed, pclient.EventReadFailed,
	}
	for _, service := range services {
		for _, kind := range kinds {
			t.Run(string(service)+"/"+string(kind), func(t *testing.T) {
				factory := &fakeFactory{t: t}
				coordinator := newTestCoordinator(t, factory)
				if err := coordinator.Start(context.Background(), "session-table", "sincro"); err != nil {
					t.Fatalf("Start() error = %v", err)
				}
				factory.setAt(t, 0).emit(pclient.Event{Service: service, Kind: kind, Err: errors.New("injected")})
				waitFor(t, func() bool {
					coordinator.mu.Lock()
					defer coordinator.mu.Unlock()
					return coordinator.state == StateRunning && coordinator.generation == 2
				})
				if factory.count() != 2 {
					t.Fatalf("client set count = %d, want 2", factory.count())
				}
				if err := coordinator.Close(); err != nil {
					t.Fatalf("Close() error = %v", err)
				}
			})
		}
	}
}

func TestCoordinatorKeepsExtractorIdentityAcrossReset(t *testing.T) {
	tests := []struct {
		name       string
		identities []testExtractionIdentity
	}{
		{
			name: "speech ID reuse",
			identities: []testExtractionIdentity{
				{speechID: 10, sequenceID: 100},
				{speechID: 10, sequenceID: 101},
				{speechID: 11, sequenceID: 102},
			},
		},
		{
			name: "sequence ID reuse",
			identities: []testExtractionIdentity{
				{speechID: 10, sequenceID: 100},
				{speechID: 11, sequenceID: 100},
				{speechID: 12, sequenceID: 101},
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			factory := &fakeFactory{t: t, identities: test.identities}
			coordinator := newTestCoordinator(t, factory)
			if err := coordinator.Start(context.Background(), "session-identity", "sincro"); err != nil {
				t.Fatalf("Start() error = %v", err)
			}
			if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
				t.Fatalf("first SubmitPCM() error = %v", err)
			}
			_ = receive(t, coordinator.TextResults())
			_ = receive(t, coordinator.TextResults())
			_ = receive(t, coordinator.SynthResults())
			factory.setAt(t, 0).emit(pclient.Event{
				Service: pclient.ServiceRecognizer,
				Kind:    pclient.EventRemoteClose,
				Err:     errors.New("advance generation"),
			})
			waitForGeneration(t, coordinator, 2)
			if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
				t.Fatalf("reused identity SubmitPCM() error = %v", err)
			}
			// protocol failureはgeneration 2に属するため、generation 1の古いresultとして
			// 捨てずにgeneration 2を再初期化しなければならない。
			waitForGeneration(t, coordinator, 3)
			if factory.count() != 3 {
				t.Fatalf("client set count = %d, want 3", factory.count())
			}
			if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
				t.Fatalf("strict identity SubmitPCM() error = %v", err)
			}
			if output := receive(t, coordinator.TextResults()); output.Generation != 3 {
				t.Fatalf("strict identity output generation = %d, want 3", output.Generation)
			}
			if err := coordinator.Close(); err != nil {
				t.Fatalf("Close() error = %v", err)
			}
		})
	}
}

func TestCapturedGenerationDropsLateClientEvent(t *testing.T) {
	factory := &fakeFactory{t: t}
	coordinator := newTestCoordinator(t, factory)
	if err := coordinator.Start(context.Background(), "session-generation", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	first := factory.setAt(t, 0)
	first.emit(pclient.Event{Service: pclient.ServiceRecognizer, Kind: pclient.EventRemoteClose, Err: errors.New("reset")})
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.state == StateRunning && coordinator.generation == 2
	})
	first.emit(pclient.Event{Service: pclient.ServiceProcessor, Kind: pclient.EventReadFailed, Err: errors.New("late")})
	waitFor(t, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.staleDrops[pclient.ServiceProcessor] == 1
	})
	coordinator.mu.Lock()
	generation := coordinator.generation
	coordinator.mu.Unlock()
	if generation != 2 {
		t.Fatalf("late generation-1 callback advanced generation to %d", generation)
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}
