package config

import (
	"os"
	"path/filepath"
	"strings"
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
		"--max-sessions", "99",
		"--offer-cache-capacity", "999",
		"--offer-cache-ttl", "90s",
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
	if cfg.MaxSessions != 99 || cfg.OfferCacheCapacity != 999 || cfg.OfferCacheTTL != 90*time.Second {
		t.Errorf("bounded limits = %d/%d/%s, want 99/999/90s",
			cfg.MaxSessions, cfg.OfferCacheCapacity, cfg.OfferCacheTTL)
	}
	if !filepath.IsAbs(cfg.FrontendDir) {
		t.Errorf("FrontendDir = %q, want absolute path", cfg.FrontendDir)
	}
	if !filepath.IsAbs(cfg.FFmpegPath) {
		t.Errorf("FFmpegPath = %q, want absolute path", cfg.FFmpegPath)
	}
}

func TestLoadUsesProductionLimitDefaults(t *testing.T) {
	cfg, err := Load([]string{"--frontend-dir", t.TempDir()})
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.MaxSessions != 100 ||
		cfg.OfferCacheCapacity != 1000 ||
		cfg.OfferCacheTTL != 120*time.Second {
		t.Fatalf("defaults = %d/%d/%s, want 100/1000/2m",
			cfg.MaxSessions, cfg.OfferCacheCapacity, cfg.OfferCacheTTL)
	}
}

func TestLoadAcceptsLimitBoundaries(t *testing.T) {
	for _, test := range []struct {
		name string
		args []string
		want int64
	}{
		{name: "sessions 99", args: []string{"--max-sessions", "99"}, want: 99},
		{name: "sessions 100", args: []string{"--max-sessions", "100"}, want: 100},
		{name: "capacity 999", args: []string{"--offer-cache-capacity", "999"}, want: 999},
		{name: "capacity 1000", args: []string{"--offer-cache-capacity", "1000"}, want: 1000},
		{name: "ttl 30", args: []string{"--offer-cache-ttl", "30s"}, want: 30},
		{name: "ttl 120", args: []string{"--offer-cache-ttl", "120s"}, want: 120},
	} {
		t.Run(test.name, func(t *testing.T) {
			args := append([]string{"--frontend-dir", t.TempDir()}, test.args...)
			cfg, err := Load(args)
			if err != nil {
				t.Fatalf("Load() error = %v", err)
			}
			var got int64
			switch {
			case strings.HasPrefix(test.name, "sessions"):
				got = int64(cfg.MaxSessions)
			case strings.HasPrefix(test.name, "capacity"):
				got = int64(cfg.OfferCacheCapacity)
			default:
				got = int64(cfg.OfferCacheTTL / time.Second)
			}
			if got != test.want {
				t.Fatalf("boundary = %d, want %d", got, test.want)
			}
		})
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
		{name: "missing ffmpeg", args: []string{"--frontend-dir", t.TempDir(), "--ffmpeg", "missing-ffmpeg-for-test"}},
		{name: "frontend is file", args: []string{"--frontend-dir", file.Name()}},
		{name: "non-positive timeout", args: []string{"--frontend-dir", t.TempDir(), "--gather-timeout", "0s"}},
		{name: "turn is out of scope", args: []string{"--frontend-dir", t.TempDir(), "--stun", "turn:turn.example.test"}},
		{name: "zero sessions", args: []string{"--frontend-dir", t.TempDir(), "--max-sessions", "0"}},
		{name: "sessions above production maximum", args: []string{"--frontend-dir", t.TempDir(), "--max-sessions", "101"}},
		{name: "zero offer capacity", args: []string{"--frontend-dir", t.TempDir(), "--offer-cache-capacity", "0"}},
		{name: "offer capacity above production maximum", args: []string{"--frontend-dir", t.TempDir(), "--offer-cache-capacity", "1001"}},
		{name: "offer ttl below minimum", args: []string{"--frontend-dir", t.TempDir(), "--offer-cache-ttl", "29s"}},
		{name: "offer ttl above production maximum", args: []string{"--frontend-dir", t.TempDir(), "--offer-cache-ttl", "121s"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := Load(test.args); err == nil {
				t.Fatal("Load() error = nil, want boundary validation error")
			}
		})
	}
}
