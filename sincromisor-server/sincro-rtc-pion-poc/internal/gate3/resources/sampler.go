package resources

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type samplerState string

const (
	stateIdle     samplerState = "idle"
	stateSampling samplerState = "sampling"
	stateStopped  samplerState = "stopped"
)

type samplerTiming struct {
	interval time.Duration
	timeout  time.Duration
}

// Sampler は一つの採取 worker と、その取消・join・結果列を所有する。
//
// zero value は使用できない。NewSampler で作り、Start 後は Stop で worker を join する。
// parent context が先に終了しても Stop は保存済み結果と終端 error を回収できる。
type Sampler struct {
	mu        sync.Mutex
	collector *collector
	state     samplerState
	cancel    context.CancelFunc
	done      chan struct{}
	result    Result
	runErr    error
	interval  time.Duration
	timeout   time.Duration
}

// NewSampler は Linux procfs と絶対 HTTP endpoint を検査して idle Sampler を返す。
func NewSampler(config Config) (*Sampler, error) {
	return newSampler(config, nil, sampleInterval)
}

func newSampler(config Config, client *http.Client, interval time.Duration) (*Sampler, error) {
	return newSamplerWithTiming(config, client, samplerTiming{
		interval: interval,
		timeout:  convergenceTimeout,
	})
}

// newSamplerWithTiming は production の250ms/10秒契約を短時間で通す orchestration test seamである。
// callerへ公開せず、NewSamplerは常に承認済み値を使う。
func newSamplerWithTiming(
	config Config,
	client *http.Client,
	timing samplerTiming,
) (*Sampler, error) {
	collector, err := newCollector(config, client)
	if err != nil {
		return nil, err
	}
	if timing.interval <= 0 || timing.timeout <= 0 {
		return nil, errors.New("resource sampler timing must be positive")
	}
	return &Sampler{
		collector: collector,
		state:     stateIdle,
		interval:  timing.interval,
		timeout:   timing.timeout,
	}, nil
}

// Start は250ms間隔の採取 worker を一度だけ起動する。
//
// 二重開始は ErrAlreadyStarted、停止後の再開は ErrStopped である。一入力でも失敗した回は
// Samples へ追加せず Diagnostics へ保存し、worker は次の tick を継続する。
func (s *Sampler) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch s.state {
	case stateSampling:
		return ErrAlreadyStarted
	case stateStopped:
		return ErrStopped
	}
	runCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	s.done = make(chan struct{})
	s.state = stateSampling
	go s.run(runCtx)
	return nil
}

// Stop は採取 context を取消し、worker を join して確定済み結果を返す。
//
// Start 前は error、複数回の Stop は同じ snapshot と終端 error を返す。
func (s *Sampler) Stop() (Result, error) {
	s.mu.Lock()
	if s.state == stateIdle {
		s.mu.Unlock()
		return Result{}, errors.New("resource sampler is not started")
	}
	cancel, done := s.cancel, s.done
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneResult(s.result), s.runErr
}

// SampleOnce は worker と同じ全境界検査を同期的に一回行う。
//
// 部分取得値は返さない。baseline や収束待機など、caller が採取時点を制御する用途に使う。
func (s *Sampler) SampleOnce(ctx context.Context) (Sample, error) {
	return s.collector.collect(ctx)
}

// WriteJSON は確定済み Result を新規 file として0600で保存する。
//
// 既存 path は上書きしない。これは非公開の生観測原本向けであり、公開成果物は report.Writer が所有する。
func (r Result) WriteJSON(path string) error {
	if !filepath.IsAbs(path) {
		return errors.New("resource output path must be absolute")
	}
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return fmt.Errorf("encode resource samples: %w", err)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create resource output: %w", err)
	}
	if _, err := file.Write(append(data, '\n')); err != nil {
		_ = file.Close()
		return fmt.Errorf("write resource output: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close resource output: %w", err)
	}
	return nil
}

func (s *Sampler) run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	defer close(s.done)
	for {
		select {
		case <-ctx.Done():
			s.mu.Lock()
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				s.runErr = fmt.Errorf("resource sampler deadline: %w", ctx.Err())
			}
			s.state = stateStopped
			s.mu.Unlock()
			return
		case <-ticker.C:
			sample, err := s.collector.collect(ctx)
			s.mu.Lock()
			if err != nil {
				s.result.Diagnostics = append(s.result.Diagnostics, Diagnostic{
					At: s.collector.now(), Error: err.Error(),
				})
			} else {
				s.result.Samples = append(s.result.Samples, sample)
			}
			s.mu.Unlock()
		}
	}
}

func cloneResult(result Result) Result {
	clone := Result{
		Samples:     append([]Sample(nil), result.Samples...),
		Diagnostics: append([]Diagnostic(nil), result.Diagnostics...),
	}
	for index := range clone.Samples {
		clone.Samples[index].SocketInodes = append([]uint64(nil), clone.Samples[index].SocketInodes...)
	}
	return clone
}
