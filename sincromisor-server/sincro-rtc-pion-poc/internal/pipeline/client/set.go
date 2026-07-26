package client

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

// ExtractorConnection is the coordinator-facing subset of an Extractor.
type ExtractorConnection interface {
	SendPCM(context.Context, []byte) error
	Results() <-chan protocol.ExtractorResult
	Events() <-chan Event
}

// RecognizerConnection is the coordinator-facing subset of a Recognizer.
type RecognizerConnection interface {
	SendExtraction(context.Context, protocol.ExtractorResult) error
	Results() <-chan protocol.RecognizerResult
	Events() <-chan Event
}

// ProcessorConnection is the coordinator-facing subset of a Processor.
type ProcessorConnection interface {
	SendRequest(context.Context, protocol.ProcessorRequest) error
	Results() <-chan protocol.ProcessorResult
	Events() <-chan Event
}

// SynthesizerConnection is the coordinator-facing subset of a Synthesizer.
type SynthesizerConnection interface {
	SendResult(context.Context, protocol.ProcessorResult) error
	Results() <-chan protocol.SynthesizerResult
	Events() <-chan Event
}

// Set is one unpublished-or-published group of four connections.
//
// Activate is the publication linearization point. A terminal event observed while the
// set is being built makes Activate fail; after publication every event is delivered once.
type Set interface {
	Extractor() ExtractorConnection
	Recognizer() RecognizerConnection
	Processor() ProcessorConnection
	Synthesizer() SynthesizerConnection
	Activate(func(Event)) error
	Close() error
}

// SetFactory creates a fresh four-service set for every connection attempt.
type SetFactory interface {
	Connect(ctx context.Context, sessionID, talkMode string) (Set, error)
}

// NewSetFactory creates the production factory. The resolver may select a different
// endpoint for each service; now is intentionally used only by Extractor initialization.
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

func (f *setFactory) Connect(ctx context.Context, sessionID, talkMode string) (Set, error) {
	cfg := DefaultConfig(sessionID, talkMode)
	connectCtx, cancel := context.WithCancel(ctx)
	set := &connectionSet{cancel: cancel, closeDone: make(chan struct{})}
	var err error
	if set.extractor, err = NewExtractor(cfg, f.resolver, f.logger, f.now); err != nil {
		_ = set.Close()
		return nil, err
	}
	if err = set.extractor.Connect(connectCtx); err != nil {
		_ = set.Close()
		return nil, err
	}
	set.watch(set.extractor.Events())
	if set.recognizer, err = NewRecognizer(cfg, f.resolver, f.logger); err != nil {
		_ = set.Close()
		return nil, err
	}
	if err = set.recognizer.Connect(connectCtx); err != nil {
		_ = set.Close()
		return nil, err
	}
	set.watch(set.recognizer.Events())
	if set.processor, err = NewProcessor(cfg, f.resolver, f.logger); err != nil {
		_ = set.Close()
		return nil, err
	}
	if err = set.processor.Connect(connectCtx); err != nil {
		_ = set.Close()
		return nil, err
	}
	set.watch(set.processor.Events())
	if set.synth, err = NewSynthesizer(cfg, f.resolver, f.logger); err != nil {
		_ = set.Close()
		return nil, err
	}
	if err = set.synth.Connect(connectCtx); err != nil {
		_ = set.Close()
		return nil, err
	}
	set.watch(set.synth.Events())
	return set, nil
}

func (s *connectionSet) watch(events <-chan Event) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		event, ok := <-events
		if !ok {
			return
		}
		s.mu.Lock()
		if s.closed {
			s.mu.Unlock()
			return
		}
		if !s.published {
			copy := event
			s.pending = &copy
			cancel := s.cancel
			s.mu.Unlock()
			// A building-set failure interrupts whichever later client is resolving
			// or dialing; the factory then closes the whole partial set in reverse.
			cancel()
			return
		}
		handler := s.handler
		s.mu.Unlock()
		handler(event)
	}()
}

func (s *connectionSet) Extractor() ExtractorConnection     { return s.extractor }
func (s *connectionSet) Recognizer() RecognizerConnection   { return s.recognizer }
func (s *connectionSet) Processor() ProcessorConnection     { return s.processor }
func (s *connectionSet) Synthesizer() SynthesizerConnection { return s.synth }

func (s *connectionSet) Activate(handler func(Event)) error {
	if handler == nil {
		return errors.New("pipeline client set event handler must not be nil")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return errors.New("pipeline client set is closed")
	}
	if s.published {
		return errors.New("pipeline client set is already active")
	}
	if s.pending != nil {
		return errors.New("pipeline client failed before activation")
	}
	s.handler = handler
	s.published = true
	return nil
}

func (s *connectionSet) Close() error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		s.cancel()
		s.mu.Unlock()
		if s.synth != nil {
			s.closeErr = errors.Join(s.closeErr, s.synth.Close())
		}
		if s.processor != nil {
			s.closeErr = errors.Join(s.closeErr, s.processor.Close())
		}
		if s.recognizer != nil {
			s.closeErr = errors.Join(s.closeErr, s.recognizer.Close())
		}
		if s.extractor != nil {
			s.closeErr = errors.Join(s.closeErr, s.extractor.Close())
		}
		s.wg.Wait()
		close(s.closeDone)
	})
	<-s.closeDone
	return s.closeErr
}
