package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoad(t *testing.T) {
	frontendDir := t.TempDir()
	cfg, err := Load([]string{
		"--http", "127.0.0.1:9090",
		"--frontend-dir", frontendDir,
		"--stun", "stun:stun.example.test:3478",
		"--gather-timeout", "2s",
	})
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.HTTPAddress != "127.0.0.1:9090" {
		t.Errorf("HTTPAddress = %q, want 127.0.0.1:9090", cfg.HTTPAddress)
	}
	if cfg.GatherTimeout != 2*time.Second {
		t.Errorf("GatherTimeout = %s, want 2s", cfg.GatherTimeout)
	}
	if !filepath.IsAbs(cfg.FrontendDir) {
		t.Errorf("FrontendDir = %q, want absolute path", cfg.FrontendDir)
	}
}

func TestLoadRejectsInvalidBoundaryValues(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "frontend")
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		args []string
	}{
		{name: "missing frontend", args: nil},
		{name: "frontend is file", args: []string{"--frontend-dir", file.Name()}},
		{name: "non-positive timeout", args: []string{"--frontend-dir", t.TempDir(), "--gather-timeout", "0s"}},
		{name: "turn is out of scope", args: []string{"--frontend-dir", t.TempDir(), "--stun", "turn:turn.example.test"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := Load(test.args); err == nil {
				t.Fatal("Load() error = nil, want boundary validation error")
			}
		})
	}
}
