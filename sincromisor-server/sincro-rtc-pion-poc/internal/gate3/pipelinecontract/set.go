package pipelinecontract

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"sync"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

var serviceOrder = []discovery.Service{
	discovery.ServiceExtractor,
	discovery.ServiceRecognizer,
	discovery.ServiceProcessor,
	discovery.ServiceSynthesizer,
}

type serviceServer struct {
	listener net.Listener
	server   *http.Server
}

// PCMStats はpayloadを保持しないExtractor入力の有限診断snapshotである。
type PCMStats struct {
	Frames             int
	MinPeak            int
	MaxPeak            int
	AboveThreshold     int
	LongestQuietFrames int
}

// Set は4 listener、WebSocket worker、共有操作台帳を所有する。
//
// Verify が契約 error を返しても Close を呼ぶ必要がある。再起動はできないため、
// 独立 scenario ごとに新しい Set を作る。
type Set struct {
	ctx    context.Context
	cancel context.CancelFunc

	fixtures map[string][]byte
	schema   map[string]any
	servers  map[discovery.Service]*serviceServer
	address  map[discovery.Service]discovery.Endpoint

	mu                 sync.Mutex
	entries            []Entry
	errs               []error
	nextAttempt        int64
	baseSpeechID       int64
	baseSequenceID     int64
	stageBySequence    map[int64]int
	identityBySequence map[int64]identity
	processorPayload   map[int64][]byte
	processorSession   map[int64]string
	processorHistory   map[int64]int
	processorFinalSize map[int64]int
	maxSpeechResults   int
	pcmStats           PCMStats
	pcmQuietFrames     int
	closing            bool
	handlerWG          sync.WaitGroup
	wg                 sync.WaitGroup
	closeOnce          sync.Once
	closeErr           error
}

// PCMStats は固定入力がfixture境界へ到達しない場合の振幅診断を返す。
func (s *Set) PCMStats() PCMStats {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.pcmStats
}

func (s *Set) recordPCM(peak int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pcmStats.Frames == 0 || peak < s.pcmStats.MinPeak {
		s.pcmStats.MinPeak = peak
	}
	s.pcmStats.Frames++
	if peak > s.pcmStats.MaxPeak {
		s.pcmStats.MaxPeak = peak
	}
	if peak > speechPeakThreshold {
		s.pcmStats.AboveThreshold++
		s.pcmQuietFrames = 0
		return
	}
	s.pcmQuietFrames++
	if s.pcmQuietFrames > s.pcmStats.LongestQuietFrames {
		s.pcmStats.LongestQuietFrames = s.pcmQuietFrames
	}
}

// New は全 fixture を検証してから4つの loopback WebSocket service を開く。
//
// 失敗時は開いた listener をすべて閉じて server worker を join する。
// 返す address は wsproxy または discovery Resolver の接続先として使える。
func New(cfg Config) (*Set, error) {
	if cfg.FixturesDir == "" || !filepath.IsAbs(cfg.FixturesDir) {
		return nil, fmt.Errorf("%w: FixturesDir must be absolute", ErrProtocol)
	}
	if err := validateHost(cfg.ListenHost); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrProtocol, err)
	}
	if cfg.MaxSpeechResults < 0 {
		return nil, fmt.Errorf("%w: MaxSpeechResults must not be negative", ErrProtocol)
	}
	fixtures, schemas, err := loadFixtures(cfg.FixturesDir)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	set := &Set{
		ctx: ctx, cancel: cancel, fixtures: fixtures, schema: schemas,
		servers:         make(map[discovery.Service]*serviceServer),
		address:         make(map[discovery.Service]discovery.Endpoint),
		stageBySequence: make(map[int64]int), processorPayload: make(map[int64][]byte),
		identityBySequence: make(map[int64]identity),
		processorSession:   make(map[int64]string), processorHistory: make(map[int64]int),
		processorFinalSize: make(map[int64]int), maxSpeechResults: cfg.MaxSpeechResults,
	}
	extractorFixture, _ := schemas["extractor_result.msgpack"].(map[string]any)
	set.baseSpeechID, _ = int64Field(extractorFixture, "speech_id")
	set.baseSequenceID, _ = int64Field(extractorFixture, "sequence_id")
	for _, service := range serviceOrder {
		if err := set.start(service, cfg.ListenHost); err != nil {
			_ = set.Close(context.Background())
			return nil, err
		}
	}
	return set, nil
}

func (s *Set) reserveSpeechResult() (int64, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.maxSpeechResults > 0 && s.nextAttempt >= int64(s.maxSpeechResults) {
		return 0, false
	}
	attempt := s.nextAttempt
	s.nextAttempt++
	return attempt, true
}

func (s *Set) start(service discovery.Service, host string) error {
	listener, err := net.Listen("tcp", net.JoinHostPort(host, "0"))
	if err != nil {
		return fmt.Errorf("%w: listen for %s: %v", ErrProtocol, service, err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.beginHandler() {
			http.Error(w, "contract set is closing", http.StatusServiceUnavailable)
			return
		}
		defer s.handlerWG.Done()
		s.serve(service, w, r)
	})}
	s.servers[service] = &serviceServer{listener: listener, server: server}
	s.address[service] = discovery.Endpoint{Host: host, Port: uint16(port)}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		if serveErr := server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			s.record(fmt.Errorf("%w: serve %s: %v", ErrProtocol, service, serveErr))
		}
	}()
	return nil
}

// Addresses は4つの listen endpoint の防御的 copy を返す。
func (s *Set) Addresses() map[discovery.Service]discovery.Endpoint {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make(map[discovery.Service]discovery.Endpoint, len(s.address))
	for service, address := range s.address {
		result[service] = address
	}
	return result
}

// Transcript は受理済み操作の有限かつ payload を含まない snapshot を返す。
func (s *Set) Transcript() Transcript {
	s.mu.Lock()
	defer s.mu.Unlock()
	return Transcript{Entries: append([]Entry(nil), s.entries...)}
}

// Verify は観測済みの wire、identity、操作順違反をすべて返す。
//
// 1または2つの正常 turn、もしくは3 attempt の障害 scenario が静止してから呼ぶ。
// 不完全または余分な操作列は protocol error になる。
func (s *Set) Verify() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := errors.Join(s.errs...)
	switch s.nextAttempt {
	case 1:
		if s.stageBySequence[s.baseSequenceID] != len(serviceOrder) {
			result = errors.Join(result, fmt.Errorf("%w: normal turn is incomplete", ErrProtocol))
		}
	case 2:
		if s.stageBySequence[s.baseSequenceID] != len(serviceOrder) ||
			s.stageBySequence[s.baseSequenceID+1] != len(serviceOrder) {
			result = errors.Join(result, fmt.Errorf("%w: two-turn scenario is incomplete", ErrProtocol))
		}
	case 3:
		stages := []int{
			s.stageBySequence[s.baseSequenceID],
			s.stageBySequence[s.baseSequenceID+1],
			s.stageBySequence[s.baseSequenceID+2],
		}
		if stages[0] != len(serviceOrder) || stages[1] < 1 ||
			stages[1] > len(serviceOrder) || stages[2] != len(serviceOrder) {
			result = errors.Join(result, fmt.Errorf("%w: scenario stages are %v", ErrProtocol, stages))
		}
	default:
		result = errors.Join(result, fmt.Errorf(
			"%w: observed %d PCM attempts, want one or two normal turns or a three-attempt scenario",
			ErrProtocol, s.nextAttempt,
		))
	}
	return result
}

// Close は接続受理を止め、active handler を cancel して全 worker を join する。
//
// 冪等であり、caller context は HTTP shutdown を制限する。期限切れでも cancellation と
// listener close を行うため worker は必ず join される。
func (s *Set) Close(ctx context.Context) error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closing = true
		s.mu.Unlock()
		s.cancel()
		for index := len(serviceOrder) - 1; index >= 0; index-- {
			server := s.servers[serviceOrder[index]]
			if server == nil {
				continue
			}
			s.closeErr = errors.Join(s.closeErr, server.server.Shutdown(ctx))
			if err := server.listener.Close(); err != nil && !errors.Is(err, net.ErrClosed) {
				s.closeErr = errors.Join(s.closeErr, err)
			}
		}
		s.handlerWG.Wait()
		s.wg.Wait()
	})
	return s.closeErr
}

// beginHandler は Shutdown が追跡しない hijacked WebSocket も Set の生存期間へ登録する。
// Close は同じ mutex で新規 Add を止めてから Wait するため Add/Wait が競合しない。
func (s *Set) beginHandler() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		return false
	}
	s.handlerWG.Add(1)
	return true
}

func (s *Set) record(err error) {
	if err == nil {
		return
	}
	s.mu.Lock()
	s.errs = append(s.errs, err)
	s.mu.Unlock()
}
