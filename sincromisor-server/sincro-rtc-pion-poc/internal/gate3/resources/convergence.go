package resources

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// BaselineFrom は readiness 後かつ session 開始前のちょうど3 sampleから最大値を求める。
//
// 3 sampleすべてが Ready、非 Draining、Sessions=0 でなければ基準値に採用しない。
// Goroutines は3件すべてに存在する同一 process modeだけ保持する。
func BaselineFrom(samples []Sample) (Baseline, error) {
	if len(samples) != 3 {
		return Baseline{}, fmt.Errorf("baseline requires exactly 3 samples, got %d", len(samples))
	}
	baseline := Baseline{}
	sameProcess := true
	maxGoroutines := 0
	for _, sample := range samples {
		if !sample.Ready || sample.Draining || sample.Sessions != 0 {
			return Baseline{}, errors.New("baseline sample must be ready, non-draining, and session-free")
		}
		baseline.FDCount = max(baseline.FDCount, sample.FDCount)
		baseline.Socket = max(baseline.Socket, len(sample.SocketInodes))
		if sample.Goroutines == nil {
			sameProcess = false
		} else {
			maxGoroutines = max(maxGoroutines, *sample.Goroutines)
		}
	}
	if sameProcess {
		baseline.Goroutines = &maxGoroutines
	}
	return baseline, nil
}

// CaptureBaseline は250ms間隔で3 sampleを取得し、BaselineFrom の開始前条件を適用する。
func (s *Sampler) CaptureBaseline(ctx context.Context) (Baseline, []Sample, error) {
	samples := make([]Sample, 0, 3)
	for len(samples) < 3 {
		sample, err := s.SampleOnce(ctx)
		if err != nil {
			return Baseline{}, samples, err
		}
		samples = append(samples, sample)
		if len(samples) == 3 {
			break
		}
		timer := time.NewTimer(s.interval)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return Baseline{}, samples, ctx.Err()
		case <-timer.C:
		}
	}
	baseline, err := BaselineFrom(samples)
	return baseline, samples, err
}

// Converged は末尾3 sampleが連続して終了条件を満たす場合だけ true を返す。
//
// active session と4 queueは0、FDとsocketは基準値+2以下を要求する。同一 process modeを示す
// baseline.Goroutines がある場合は、各 sample の goroutine が基準値+5以下であることも要求する。
func Converged(baseline Baseline, samples []Sample) bool {
	if len(samples) < requiredStableRuns {
		return false
	}
	for _, sample := range samples[len(samples)-requiredStableRuns:] {
		if !sampleConverged(baseline, sample) {
			return false
		}
	}
	return true
}

// WaitForConvergence は session 終了後を想定して250ms間隔で採取し、10秒を上限に収束を待つ。
//
// 成功時は判定に使った全 sample を返す。取得失敗または期限超過は収束失敗として error にする。
func (s *Sampler) WaitForConvergence(ctx context.Context, baseline Baseline) ([]Sample, error) {
	waitCtx, cancel := context.WithTimeout(ctx, convergenceTimeout)
	defer cancel()
	samples := make([]Sample, 0, requiredStableRuns)
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-waitCtx.Done():
			return samples, fmt.Errorf("resources did not converge within 10 seconds: %w", waitCtx.Err())
		case <-ticker.C:
			sample, err := s.SampleOnce(waitCtx)
			if err != nil {
				return samples, err
			}
			samples = append(samples, sample)
			if Converged(baseline, samples) {
				return samples, nil
			}
		}
	}
}

func sampleConverged(baseline Baseline, sample Sample) bool {
	if sample.Sessions != 0 ||
		sample.Queues.Input != 0 ||
		sample.Queues.Speech != 0 ||
		sample.Queues.Text != 0 ||
		sample.Queues.Telop != 0 ||
		sample.FDCount > baseline.FDCount+2 ||
		len(sample.SocketInodes) > baseline.Socket+2 {
		return false
	}
	if baseline.Goroutines == nil {
		return sample.Goroutines == nil
	}
	return sample.Goroutines != nil && *sample.Goroutines <= *baseline.Goroutines+5
}
