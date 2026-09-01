package client

import (
	"context"
	"errors"
)

// Connect は4 serviceを順に接続し、途中の失敗時は構築済み接続を逆順に閉じる。
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
	set.watch(ServiceExtractor, set.extractor.Events())
	if set.recognizer, err = NewRecognizer(cfg, f.resolver, f.logger); err != nil {
		_ = set.Close()
		return nil, err
	}
	if err = set.recognizer.Connect(connectCtx); err != nil {
		_ = set.Close()
		return nil, err
	}
	set.watch(ServiceRecognizer, set.recognizer.Events())
	if set.processor, err = NewProcessor(cfg, f.resolver, f.logger); err != nil {
		_ = set.Close()
		return nil, err
	}
	if err = set.processor.Connect(connectCtx); err != nil {
		_ = set.Close()
		return nil, err
	}
	set.watch(ServiceProcessor, set.processor.Events())
	if set.synth, err = NewSynthesizer(cfg, f.resolver, f.logger); err != nil {
		_ = set.Close()
		return nil, err
	}
	if err = set.synth.Connect(connectCtx); err != nil {
		_ = set.Close()
		return nil, err
	}
	set.watch(ServiceSynthesizer, set.synth.Events())
	return set, nil
}

func (s *connectionSet) watch(service Service, events <-chan Event) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer func() {
			if recover() != nil {
				s.mu.Lock()
				handler, published, closed := s.handler, s.published, s.closed
				s.mu.Unlock()
				if published && !closed && handler != nil {
					handler(Event{Service: service, Kind: EventPanic})
				}
			}
		}()
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
			// 構築中の失敗は後続clientのresolve/dialを中断し、factoryがpartial set全体を逆順に閉じる。
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

// Close は構築済みconnectionを依存順の逆に閉じ、監視workerの終了まで待つ。
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
