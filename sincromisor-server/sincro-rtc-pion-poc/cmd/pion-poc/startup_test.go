package main

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
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
