package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/config"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/signaling"
)

func TestNewSynthDecoderProbesAbsoluteConfiguredPath(t *testing.T) {
	runner := &startupRunner{stdout: []byte("ffmpeg version 6.1.1 Copyright\n")}
	ffmpegPath := filepath.Join(string(filepath.Separator), "opt", "ffmpeg", "bin", "ffmpeg")
	decoder, err := newSynthDecoder(context.Background(), ffmpegPath, runner)
	if err != nil {
		t.Fatalf("newSynthDecoder() error = %v", err)
	}
	if decoder == nil || runner.executable != ffmpegPath {
		t.Fatalf("probe executable = %q, want %q", runner.executable, ffmpegPath)
	}
	if runner.calls != 1 {
		t.Fatalf("probe calls = %d, want 1 before listener setup", runner.calls)
	}
}

func TestNewSynthDecoderRejectsProbeFailure(t *testing.T) {
	runner := &startupRunner{exitCode: 1, err: errors.New("probe failed")}
	if _, err := newSynthDecoder(context.Background(), "/absolute/ffmpeg", runner); err == nil {
		t.Fatal("newSynthDecoder() error = nil, want startup failure")
	}
}

func TestRunProbeFailureDoesNotReachHTTPListenerBoundary(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	serveCalls := 0
	serveProbe := func(
		config.Config,
		*rtc.Manager,
		*signaling.OfferRegistry,
		context.CancelFunc,
		*slog.Logger,
	) error {
		serveCalls++
		return nil
	}
	err = runWithBoundaries(
		[]string{"--frontend-dir", t.TempDir(), "--ffmpeg", executable, "--media-udp", "127.0.0.1:3478", "--public-ipv4", "127.0.0.1", "--interface", "lo"},
		&startupRunner{exitCode: 1, err: errors.New("probe failed")},
		serveProbe,
	)
	if err == nil {
		t.Fatal("runWithBoundaries() error = nil, want FFmpeg probe startup failure")
	}
	if serveCalls != 0 {
		t.Fatalf("serve boundary calls = %d, want 0 before listener creation", serveCalls)
	}
}

type startupRunner struct {
	stdout     []byte
	exitCode   int
	err        error
	calls      int
	executable string
}

func (r *startupRunner) Run(
	_ context.Context,
	executable string,
	_ []byte,
	_ int64,
	_ int64,
	_ ...string,
) ([]byte, []byte, int, error) {
	r.calls++
	r.executable = executable
	return r.stdout, nil, r.exitCode, r.err
}
