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
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

const (
	gate2WAVHash = "3f9169ec597de0f8fc17b4b6e4f89ea05e8792f42bfb48bfa7c33277318d3759"
	gate2PCMHash = "a0375e761e7a483117a7535a5da7ed0ef0036611916a0b0e534403e551789933"
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
	defer cancel()
	if err := coordinator.Start(ctx, "gate2-python-services", "sincro"); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	defer func() {
		if err := coordinator.Close(); err != nil {
			t.Errorf("deferred Close() error = %v", err)
		}
	}()

	pcm := gate2PCM(t)
	runGate2Turn(t, coordinator, pcm, 1)
	before := gate2AcceptCounts(proxies)
	proxies[discovery.ServiceRecognizer].DropConnections()
	waitGate2(t, 45*time.Second, func() bool {
		coordinator.mu.Lock()
		defer coordinator.mu.Unlock()
		return coordinator.state == StateRunning && coordinator.generation == 2
	})
	for service, proxy := range proxies {
		if proxy.accepted.Load() != before[service]+1 {
			t.Fatalf("%s accept count after reset = %d, want %d", service, proxy.accepted.Load(), before[service]+1)
		}
	}
	runGate2Turn(t, coordinator, pcm, 2)
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
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

func runGate2Turn(t *testing.T, coordinator *Coordinator, pcm []byte, generation uint64) {
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
	textDeadline := time.NewTimer(45 * time.Second)
	defer textDeadline.Stop()
	var confirmedText bool
	for !confirmedText {
		select {
		case output := <-coordinator.TextResults():
			if output.Generation != generation {
				t.Fatalf("text generation = %d, want %d", output.Generation, generation)
			}
			confirmedText = output.Value.MessageType == "assistant" && output.Value.Message != ""
		case <-textDeadline.C:
			t.Fatal("processor did not publish a non-empty assistant response within 45s")
		}
	}
	select {
	case output := <-coordinator.SynthResults():
		if output.Generation != generation || len(output.Value.Voice) == 0 ||
			len(output.Value.MoraQueue) == 0 || output.Value.SpeakingTime <= 0 {
			t.Fatalf("invalid synthesizer output: %+v", output)
		}
		switch output.Value.AudioFormat {
		case "audio/wav", "audio/aac", "audio/ogg;codecs=opus":
		default:
			t.Fatalf("unsupported synthesized audio format %q", output.Value.AudioFormat)
		}
	case <-time.After(60 * time.Second):
		t.Fatal("synthesizer did not publish encoded voice within 60s")
	}
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

func waitGate2(t *testing.T, timeout time.Duration, condition func() bool) {
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
			t.Fatal("timed out waiting for Gate 2 reset")
		}
	}
}
