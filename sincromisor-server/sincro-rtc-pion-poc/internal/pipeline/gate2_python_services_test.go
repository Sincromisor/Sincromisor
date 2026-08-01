//go:build gate2

package pipeline

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

const (
	gate2WAVHash             = "3f9169ec597de0f8fc17b4b6e4f89ea05e8792f42bfb48bfa7c33277318d3759"
	gate2PCMHash             = "a0375e761e7a483117a7535a5da7ed0ef0036611916a0b0e534403e551789933"
	gate2StartTimeout        = 30 * time.Second
	gate2ExtractorTimeout    = 15 * time.Second
	gate2RecognizerTimeout   = 30 * time.Second
	gate2ProcessorTimeout    = 15 * time.Second
	gate2SynthesizerTimeout  = 60 * time.Second
	gate2ResetTimeout        = 45 * time.Second
	gate2ConnectionCloseWait = 15 * time.Second
)

// TestGate2PythonServices is the fixed opt-in exit gate for the current four
// Python services. Missing configuration is a failure, never a skip.
func TestGate2PythonServices(t *testing.T) {
	origins := gate2Origins(t)
	proxies := make(map[discovery.Service]*gate2Proxy, len(origins))
	for service, origin := range origins {
		proxies[service] = newGate2Proxy(t, origin)
		defer proxies[service].Close()
	}
	resolver := gate2Resolver{proxies: proxies}
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	factory, err := pclient.NewSetFactory(resolver, logger, time.Now)
	if err != nil {
		t.Fatalf("NewSetFactory() error = %v", err)
	}
	coordinator, err := NewCoordinator(factory, logger)
	if err != nil {
		t.Fatalf("NewCoordinator() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	// Startへ渡すctxは成功後もsession lifetimeを所有する。初回接続だけは別timerで監視し、
	// deadline時に同じctxをcancelしてretryを止めてからCloseで全resourceをjoinする。
	defer func() {
		cancel()
		if err := coordinator.Close(); err != nil {
			t.Errorf("deferred Close() error = %v", err)
		}
	}()
	if err := startGate2Coordinator(ctx, cancel, coordinator); err != nil {
		waitGate2(t, gate2ConnectionCloseWait, "failed Start proxy cleanup", func() bool {
			for _, proxy := range proxies {
				if proxy.active.Load() != 0 {
					return false
				}
			}
			return true
		})
		t.Fatalf("Start() error = %v", err)
	}
	for service, proxy := range proxies {
		if proxy.accepted.Load() == 0 {
			t.Fatalf("%s initial connection was not accepted", service)
		}
	}

	pcm := gate2PCM(t)
	first := runGate2Turn(t, coordinator, pcm, 1, nil)
	before := gate2AcceptCounts(proxies)
	proxies[discovery.ServiceRecognizer].DropConnections()
	waitGate2(t, gate2ResetTimeout, "generation 2 and four replacement connections", func() bool {
		coordinator.mu.Lock()
		running := coordinator.state == StateRunning && coordinator.generation == 2
		coordinator.mu.Unlock()
		if !running {
			return false
		}
		for service, proxy := range proxies {
			if proxy.accepted.Load() != before[service]+1 {
				return false
			}
		}
		return true
	})
	for service, proxy := range proxies {
		if proxy.accepted.Load() != before[service]+1 {
			t.Fatalf("%s accept count after reset = %d, want %d", service, proxy.accepted.Load(), before[service]+1)
		}
	}
	coordinator.outputMu.Lock()
	oldText, oldSynth := len(coordinator.textOut), len(coordinator.synthOut)
	coordinator.outputMu.Unlock()
	if oldText != 0 || oldSynth != 0 {
		t.Fatalf("reset retained old output: text=%d synth=%d", oldText, oldSynth)
	}
	if history := gate2History(coordinator); !reflect.DeepEqual(history, first.history) {
		t.Fatalf("reset changed confirmed history: got=%+v want=%+v", history, first.history)
	}
	second := runGate2Turn(t, coordinator, pcm, 2, first.history)
	if !reflect.DeepEqual(second.history[:len(first.history)], first.history) {
		t.Fatal("second turn did not preserve the first turn confirmed history")
	}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	waitGate2(t, gate2ConnectionCloseWait, "all proxy connections to close", func() bool {
		for _, proxy := range proxies {
			if proxy.active.Load() != 0 {
				return false
			}
		}
		return true
	})
	for service, proxy := range proxies {
		if proxy.active.Load() != 0 {
			t.Fatalf("%s active connections after Close = %d, want 0", service, proxy.active.Load())
		}
	}
}

func gate2Origins(t *testing.T) map[discovery.Service]*url.URL {
	t.Helper()
	names := map[discovery.Service]string{
		discovery.ServiceExtractor:   "SINCRO_GATE2_EXTRACTOR_ORIGIN",
		discovery.ServiceRecognizer:  "SINCRO_GATE2_RECOGNIZER_ORIGIN",
		discovery.ServiceProcessor:   "SINCRO_GATE2_PROCESSOR_ORIGIN",
		discovery.ServiceSynthesizer: "SINCRO_GATE2_SYNTHESIZER_ORIGIN",
	}
	result := make(map[discovery.Service]*url.URL, len(names))
	for service, name := range names {
		raw := os.Getenv(name)
		origin, err := url.Parse(raw)
		if raw == "" || err != nil || (origin.Scheme != "ws" && origin.Scheme != "wss") ||
			origin.Host == "" || origin.Hostname() == "" || origin.User != nil ||
			(origin.Path != "" && origin.Path != "/") || origin.RawQuery != "" || origin.Fragment != "" {
			t.Fatalf("%s must be a ws/wss origin without credentials, path, query, or fragment", name)
		}
		origin.Path = ""
		result[service] = origin
	}
	return result
}

func startGate2Coordinator(
	ctx context.Context,
	cancel context.CancelFunc,
	coordinator *Coordinator,
) error {
	started := make(chan error, 1)
	go func() {
		started <- coordinator.Start(ctx, "gate2-python-services", "sincro")
	}()
	timer := time.NewTimer(gate2StartTimeout)
	defer timer.Stop()
	select {
	case err := <-started:
		if err != nil {
			_ = coordinator.Close()
		}
		return err
	case <-timer.C:
		// Start contextはsession lifetimeそのものなので、timeout時はcancelしてretry waiterと
		// partial client setを停止する。Startの終了を受け取ってからCloseをjoinし、test goroutineを残さない。
		cancel()
		startErr := <-started
		closeErr := coordinator.Close()
		return fmt.Errorf(
			"initial four-service connection exceeded %s: start=%v close=%v",
			gate2StartTimeout,
			startErr,
			closeErr,
		)
	}
}

type gate2TurnResult struct {
	extraction extractionIdentity
	user       protocol.ChatMessage
	assistant  protocol.ChatMessage
	history    []protocol.ChatMessage
	synth      protocol.SynthesizerResult
}

// runGate2Turnはbrowser PCMから各stageのobservable stateを順に検証する。
//
// stageごとに独立したdeadlineを開始し、後段の成功で前段の未観測を代替しない。Processor finalだけが
// confirmed historyをcommitし、Synthesizer identityはそのfinal responseと照合する。
func runGate2Turn(
	t *testing.T,
	coordinator *Coordinator,
	pcm []byte,
	generation uint64,
	previousHistory []protocol.ChatMessage,
) gate2TurnResult {
	t.Helper()
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()
	for offset := 0; offset < len(pcm); offset += pcmFrameBytes {
		frame := make([]byte, pcmFrameBytes)
		copy(frame, pcm[offset:min(offset+pcmFrameBytes, len(pcm))])
		if err := coordinator.SubmitPCM(frame); err != nil {
			t.Fatalf("SubmitPCM(audio) error = %v", err)
		}
		<-ticker.C
	}
	for range 50 {
		if err := coordinator.SubmitPCM(make([]byte, pcmFrameBytes)); err != nil {
			t.Fatalf("SubmitPCM(silence) error = %v", err)
		}
		<-ticker.C
	}

	var extraction extractionIdentity
	waitGate2(t, gate2ExtractorTimeout, "confirmed Extractor result", func() bool {
		var confirmed bool
		extraction, confirmed = gate2ConfirmedExtraction(coordinator, generation)
		return confirmed
	})
	user := waitGate2Text(
		t,
		coordinator,
		generation,
		gate2RecognizerTimeout,
		"non-empty Recognizer text",
		func(message protocol.ChatMessage) bool {
			return message.MessageType == "user" && message.Message != ""
		},
	)
	if user.SpeechID != extraction.speechID {
		t.Fatalf("Recognizer speech ID = %d, want confirmed Extractor speech ID %d", user.SpeechID, extraction.speechID)
	}
	assistant, history := waitGate2ProcessorFinal(
		t,
		coordinator,
		generation,
		previousHistory,
		user,
	)
	synth := waitGate2Synthesizer(t, coordinator, generation, assistant)
	return gate2TurnResult{
		extraction: extraction,
		user:       user,
		assistant:  assistant,
		history:    history,
		synth:      synth,
	}
}

func gate2ConfirmedExtraction(coordinator *Coordinator, generation uint64) (extractionIdentity, bool) {
	coordinator.mu.Lock()
	identity := coordinator.extraction
	work := coordinator.work
	running := coordinator.state == StateRunning && coordinator.generation == generation
	coordinator.mu.Unlock()
	if !running || work == nil || !identity.seen || identity.generation != generation {
		return extractionIdentity{}, false
	}
	work.conv.mu.Lock()
	_, confirmed := work.conv.closed[identity.speechID]
	work.conv.mu.Unlock()
	return identity, confirmed
}

func waitGate2Text(
	t *testing.T,
	coordinator *Coordinator,
	generation uint64,
	timeout time.Duration,
	stage string,
	accept func(protocol.ChatMessage) bool,
) protocol.ChatMessage {
	t.Helper()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case output, ok := <-coordinator.TextResults():
			if !ok {
				t.Fatalf("%s output channel closed", stage)
			}
			if output.Generation != generation {
				t.Fatalf("%s generation = %d, want %d", stage, output.Generation, generation)
			}
			if accept(output.Value) {
				return output.Value
			}
		case <-timer.C:
			t.Fatalf("%s was not observed within %s", stage, timeout)
		}
	}
}

func waitGate2ProcessorFinal(
	t *testing.T,
	coordinator *Coordinator,
	generation uint64,
	previousHistory []protocol.ChatMessage,
	recognized protocol.ChatMessage,
) (protocol.ChatMessage, []protocol.ChatMessage) {
	t.Helper()
	timer := time.NewTimer(gate2ProcessorTimeout)
	defer timer.Stop()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	observed := make(map[string]protocol.ChatMessage)
	for {
		history := gate2History(coordinator)
		if len(history) == len(previousHistory)+2 &&
			reflect.DeepEqual(history[:len(previousHistory)], previousHistory) {
			confirmedUser := history[len(previousHistory)]
			assistant := history[len(history)-1]
			published, found := observed[assistant.MessageID]
			if found && reflect.DeepEqual(published, assistant) {
				if confirmedUser.MessageID != recognized.MessageID ||
					confirmedUser.SpeechID != recognized.SpeechID ||
					confirmedUser.MessageType != "user" ||
					confirmedUser.Message == "" {
					t.Fatalf("invalid confirmed Recognizer history entry: %+v", confirmedUser)
				}
				if assistant.MessageType != "assistant" ||
					assistant.Message == "" ||
					assistant.SpeechID != confirmedUser.SpeechID {
					t.Fatalf("invalid final Processor history entry: %+v", assistant)
				}
				return assistant, history
			}
		}
		select {
		case output, ok := <-coordinator.TextResults():
			if !ok {
				t.Fatal("Processor text output channel closed")
			}
			if output.Generation != generation {
				t.Fatalf("Processor text generation = %d, want %d", output.Generation, generation)
			}
			if output.Value.MessageType == "assistant" && output.Value.Message != "" {
				observed[output.Value.MessageID] = output.Value
			}
		case <-ticker.C:
		case <-timer.C:
			t.Fatalf("Processor final response and confirmed history were not observed within %s", gate2ProcessorTimeout)
		}
	}
}

func waitGate2Synthesizer(
	t *testing.T,
	coordinator *Coordinator,
	generation uint64,
	assistant protocol.ChatMessage,
) protocol.SynthesizerResult {
	t.Helper()
	timer := time.NewTimer(gate2SynthesizerTimeout)
	defer timer.Stop()
	for {
		select {
		case output, ok := <-coordinator.SynthResults():
			if !ok {
				t.Fatal("Synthesizer output channel closed")
			}
			if output.Generation != generation {
				t.Fatalf("Synthesizer generation = %d, want %d", output.Generation, generation)
			}
			value := output.Value
			if value.SpeechID != assistant.SpeechID ||
				value.Message == "" ||
				len(value.Voice) == 0 ||
				len(value.MoraQueue) == 0 ||
				value.SpeakingTime <= 0 {
				t.Fatalf("invalid Synthesizer identity/voice/timing output: %+v", value)
			}
			switch value.AudioFormat {
			case "audio/wav", "audio/aac", "audio/ogg;codecs=opus":
			default:
				t.Fatalf("unsupported synthesized audio format %q", value.AudioFormat)
			}
			return value
		case <-timer.C:
			t.Fatalf("Synthesizer identity/voice/mora/speaking time was not observed within %s", gate2SynthesizerTimeout)
		}
	}
}

func gate2History(coordinator *Coordinator) []protocol.ChatMessage {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	return cloneMessages(coordinator.history)
}

func gate2PCM(t *testing.T) []byte {
	t.Helper()
	// go testは対象packageをworking directoryにする。module rootからの見かけの相対pathではなく、
	// pipeline packageからserver内のreview済みfixtureへ辿り、固定commandを任意のcaller cwdで再現可能にする。
	fixturePath := filepath.Join(
		"..", "..", "..",
		"speech-recognizer-nemo", "src", "speech_recognizer_nemo", "SpeechRecognizerNemo", "sample02.wav",
	)
	wav, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read sample02.wav: %v", err)
	}
	if fmt.Sprintf("%x", sha256.Sum256(wav)) != gate2WAVHash {
		t.Fatal("sample02.wav SHA-256 differs from the reviewed fixture")
	}
	data, rate, channels, bits, err := parseGate2WAV(wav)
	if err != nil || rate != 24_000 || channels != 1 || bits != 16 {
		t.Fatalf("sample02.wav format error=%v rate=%d channels=%d bits=%d", err, rate, channels, bits)
	}
	inputSamples := len(data) / 2
	outputSamples := inputSamples * 16_000 / 24_000
	result := make([]byte, outputSamples*2)
	for output := 0; output < outputSamples; output++ {
		input := output * 24_000 / 16_000
		copy(result[output*2:], data[input*2:input*2+2])
	}
	if len(result) != 171_008 || fmt.Sprintf("%x", sha256.Sum256(result)) != gate2PCMHash {
		t.Fatal("deterministic 16 kHz conversion differs from the reviewed fixture")
	}
	return result
}

func parseGate2WAV(wav []byte) ([]byte, uint32, uint16, uint16, error) {
	if len(wav) < 12 || string(wav[:4]) != "RIFF" || string(wav[8:12]) != "WAVE" {
		return nil, 0, 0, 0, errors.New("invalid RIFF/WAVE header")
	}
	var rate uint32
	var channels, bits uint16
	for offset := 12; offset+8 <= len(wav); {
		size := int(binary.LittleEndian.Uint32(wav[offset+4 : offset+8]))
		start, end := offset+8, offset+8+size
		if end > len(wav) {
			return nil, 0, 0, 0, errors.New("WAV chunk exceeds file")
		}
		switch string(wav[offset : offset+4]) {
		case "fmt ":
			if size < 16 || binary.LittleEndian.Uint16(wav[start:start+2]) != 1 {
				return nil, 0, 0, 0, errors.New("WAV is not PCM")
			}
			channels = binary.LittleEndian.Uint16(wav[start+2 : start+4])
			rate = binary.LittleEndian.Uint32(wav[start+4 : start+8])
			bits = binary.LittleEndian.Uint16(wav[start+14 : start+16])
		case "data":
			return append([]byte(nil), wav[start:end]...), rate, channels, bits, nil
		}
		offset = end + size%2
	}
	return nil, 0, 0, 0, errors.New("WAV data chunk not found")
}

type gate2Resolver struct {
	proxies map[discovery.Service]*gate2Proxy
}

func (r gate2Resolver) Resolve(_ context.Context, service discovery.Service) (discovery.Endpoint, error) {
	proxy := r.proxies[service]
	if proxy == nil {
		return discovery.Endpoint{}, errors.New("gate2 proxy service is unknown")
	}
	host, portText, err := net.SplitHostPort(proxy.listener.Addr().String())
	if err != nil {
		return discovery.Endpoint{}, err
	}
	var port uint16
	if _, err := fmt.Sscanf(portText, "%d", &port); err != nil {
		return discovery.Endpoint{}, err
	}
	return discovery.Endpoint{Host: host, Port: port, Source: discovery.EndpointSourceConsul}, nil
}

type gate2Proxy struct {
	upstream *url.URL
	server   *httptest.Server
	listener net.Listener
	accepted atomic.Int64
	active   atomic.Int64
	mu       sync.Mutex
	conns    map[*websocket.Conn]struct{}
}

func newGate2Proxy(t *testing.T, upstream *url.URL) *gate2Proxy {
	t.Helper()
	proxy := &gate2Proxy{upstream: upstream, conns: make(map[*websocket.Conn]struct{})}
	proxy.server = httptest.NewUnstartedServer(http.HandlerFunc(proxy.serve))
	proxy.listener = proxy.server.Listener
	proxy.server.Start()
	return proxy
}

func (p *gate2Proxy) serve(response http.ResponseWriter, request *http.Request) {
	downstream, err := websocket.Accept(response, request, nil)
	if err != nil {
		return
	}
	target := *p.upstream
	target.Path, target.RawQuery = request.URL.Path, request.URL.RawQuery
	upstream, _, err := websocket.Dial(request.Context(), target.String(), nil)
	if err != nil {
		_ = downstream.Close(websocket.StatusInternalError, "upstream unavailable")
		return
	}
	p.accepted.Add(1)
	p.active.Add(1)
	p.mu.Lock()
	p.conns[downstream], p.conns[upstream] = struct{}{}, struct{}{}
	p.mu.Unlock()
	defer func() {
		_ = downstream.CloseNow()
		_ = upstream.CloseNow()
		p.mu.Lock()
		delete(p.conns, downstream)
		delete(p.conns, upstream)
		p.mu.Unlock()
		p.active.Add(-1)
	}()
	ctx, cancel := context.WithCancel(request.Context())
	defer cancel()
	downstreamStream := websocket.NetConn(ctx, downstream, websocket.MessageBinary)
	upstreamStream := websocket.NetConn(ctx, upstream, websocket.MessageBinary)
	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(upstreamStream, downstreamStream); done <- struct{}{} }()
	go func() { _, _ = io.Copy(downstreamStream, upstreamStream); done <- struct{}{} }()
	<-done
}

func (p *gate2Proxy) DropConnections() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for conn := range p.conns {
		_ = conn.CloseNow()
	}
}

func (p *gate2Proxy) Close() {
	p.DropConnections()
	p.server.Close()
}

func gate2AcceptCounts(proxies map[discovery.Service]*gate2Proxy) map[discovery.Service]int64 {
	result := make(map[discovery.Service]int64, len(proxies))
	for service, proxy := range proxies {
		result[service] = proxy.accepted.Load()
	}
	return result
}

func waitGate2(t *testing.T, timeout time.Duration, stage string, condition func() bool) {
	t.Helper()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		if condition() {
			return
		}
		select {
		case <-ticker.C:
		case <-deadline.C:
			t.Fatalf("%s was not observed within %s", stage, timeout)
		}
	}
}
