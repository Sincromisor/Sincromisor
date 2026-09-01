package client

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// ExtractorConnection はCoordinatorから使うExtractorの接続境界である。
type ExtractorConnection interface {
	SendPCM(context.Context, []byte) error
	Results() <-chan protocol.ExtractorResult
	Events() <-chan Event
}

// RecognizerConnection はCoordinatorから使うRecognizerの接続境界である。
type RecognizerConnection interface {
	SendExtraction(context.Context, protocol.ExtractorResult) error
	Results() <-chan protocol.RecognizerResult
	Events() <-chan Event
}

// ProcessorConnection はCoordinatorから使うProcessorの接続境界である。
type ProcessorConnection interface {
	SendRequest(context.Context, protocol.ProcessorRequest) error
	Results() <-chan protocol.ProcessorResult
	Events() <-chan Event
}

// SynthesizerConnection はCoordinatorから使うSynthesizerの接続境界である。
type SynthesizerConnection interface {
	SendResult(context.Context, protocol.ProcessorResult) error
	Results() <-chan protocol.SynthesizerResult
	Events() <-chan Event
}

// Set は公開前または公開済みの4接続を1組として所有する。
//
// Activateが公開の線形化点である。構築中にterminal eventを観測するとActivateは失敗し、
// 公開後は各eventを一度だけ通知する。
type Set interface {
	Extractor() ExtractorConnection
	Recognizer() RecognizerConnection
	Processor() ProcessorConnection
	Synthesizer() SynthesizerConnection
	Activate(func(Event)) error
	Close() error
}

// SetFactory は接続試行ごとに新しい4 serviceのSetを作る。
type SetFactory interface {
	Connect(ctx context.Context, sessionID, talkMode string) (Set, error)
}

// NewSetFactory は本番用factoryを作る。resolverはserviceごとに異なるendpointを選択でき、
// nowはExtractor初期化だけに用いる。
func NewSetFactory(resolver discovery.Resolver, logger *slog.Logger, now func() time.Time) (SetFactory, error) {
	if resolver == nil || logger == nil || now == nil {
		return nil, errors.New("pipeline client set dependencies must not be nil")
	}
	return &setFactory{resolver: resolver, logger: logger, now: now}, nil
}

type setFactory struct {
	resolver discovery.Resolver
	logger   *slog.Logger
	now      func() time.Time
}

type connectionSet struct {
	extractor  *Extractor
	recognizer *Recognizer
	processor  *Processor
	synth      *Synthesizer

	mu        sync.Mutex
	published bool
	pending   *Event
	handler   func(Event)
	closed    bool
	wg        sync.WaitGroup
	cancel    context.CancelFunc
	closeOnce sync.Once
	closeDone chan struct{}
	closeErr  error
}
