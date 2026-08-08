//go:build gate3

package pipelinecontract

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

func TestSynthesizedWAVIsFiniteAndNonSilent(t *testing.T) {
	payload := synthesizedWAV()
	if len(payload) != 44+synthesizedSamples*2 || !bytes.Equal(payload[:4], []byte("RIFF")) ||
		!bytes.Equal(payload[8:12], []byte("WAVE")) {
		t.Fatalf("WAV header or size is invalid: %d bytes", len(payload))
	}
	if bytes.Count(payload[44:], []byte{0}) == len(payload)-44 {
		t.Fatal("WAV PCM is silent")
	}
}

func TestExtractorReservesFirstNonSilentFrameOnly(t *testing.T) {
	set := &Set{}
	if hasNonSilentPCM(make([]byte, 640)) {
		t.Fatal("silent PCM was accepted")
	}
	if !hasNonSilentPCM([]byte{1, 0}) || !set.reserveSpeechResult() || set.reserveSpeechResult() {
		t.Fatal("extractor did not reserve exactly the first non-silent PCM frame")
	}
}

type staticResolver map[discovery.Service]discovery.Endpoint

func (r staticResolver) Resolve(_ context.Context, service discovery.Service) (discovery.Endpoint, error) {
	endpoint, found := r[service]
	if !found {
		return discovery.Endpoint{}, errors.New("missing test endpoint")
	}
	return endpoint, nil
}

func TestContractServicesDriveProductionPipeline(t *testing.T) {
	set := newContractSet(t)
	defer closeContractSet(t, set)
	t.Cleanup(func() {
		if t.Failed() {
			t.Logf("contract transcript = %+v; verify = %v", set.Transcript(), set.Verify())
		}
	})
	coordinator := newCoordinator(t, set.Addresses())
	if err := coordinator.Start(context.Background(), "gate3-direct-session", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	runTurn(t, coordinator)
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := set.Verify(); err != nil {
		t.Fatalf("Verify() error = %v", err)
	}
	transcript := set.Transcript()
	if len(transcript.Entries) != 4 {
		t.Fatalf("transcript entries = %d, want 4", len(transcript.Entries))
	}
	processor := transcript.Entries[2]
	synthesizer := transcript.Entries[3]
	if processor.HistoryLength != 1 || processor.FinalHistorySize != 2 {
		t.Fatalf("processor history = %d/%d, want 1/2", processor.HistoryLength, processor.FinalHistorySize)
	}
	if !synthesizer.ByteIdentical {
		t.Fatal("synthesizer did not receive processor bytes unchanged")
	}
}

func newContractSet(t *testing.T) *Set {
	t.Helper()
	fixtures, err := filepath.Abs(filepath.Join("..", "..", "pipeline", "protocol", "testdata"))
	if err != nil {
		t.Fatal(err)
	}
	set, err := New(Config{FixturesDir: fixtures, ListenHost: "127.0.0.1"})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return set
}

func newCoordinator(t *testing.T, endpoints map[discovery.Service]discovery.Endpoint) *pipeline.Coordinator {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	factory, err := pclient.NewSetFactory(staticResolver(endpoints), logger, time.Now)
	if err != nil {
		t.Fatalf("NewSetFactory() error = %v", err)
	}
	coordinator, err := pipeline.NewCoordinator(factory, logger)
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	return coordinator
}

func runTurn(t *testing.T, coordinator *pipeline.Coordinator) {
	t.Helper()
	for _, frame := range turnPCMFrames() {
		if err := coordinator.SubmitPCM(frame); err != nil {
			t.Fatalf("SubmitPCM() error = %v", err)
		}
	}
	receive(t, coordinator.TextResults())
	receive(t, coordinator.TextResults())
	receive(t, coordinator.SynthResults())
}

func turnPCMFrames() [][]byte {
	speech := make([]byte, 640)
	speech[0], speech[1] = 0, 4
	return [][]byte{speech}
}

func receive[T any](t *testing.T, values <-chan T) T {
	t.Helper()
	select {
	case value, open := <-values:
		if !open {
			t.Fatal("result channel closed")
		}
		return value
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for pipeline result")
		var zero T
		return zero
	}
}

func closeContractSet(t *testing.T, set *Set) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := set.Close(ctx); err != nil {
		t.Errorf("contract Close() error = %v", err)
	}
}
