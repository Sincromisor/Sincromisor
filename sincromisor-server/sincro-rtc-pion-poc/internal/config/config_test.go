package config

import (
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoad(t *testing.T) {
	configureTestInterface(t)
	frontendDir := t.TempDir()
	cfg, err := Load([]string{
		"--http", "127.0.0.1:9090",
		"--frontend-dir", frontendDir,
		"--stun", "stun:stun.example.test:3478",
		"--media-udp-port", "3478",
		"--public-ipv4", testInterfaceIPv4,
		"--interface", testInterfaceName,
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
	if cfg.MediaIPv4 != testInterfaceIPv4 || cfg.MediaUDPPort != 3478 {
		t.Errorf("media bind = %s:%d, want %s:3478", cfg.MediaIPv4, cfg.MediaUDPPort, testInterfaceIPv4)
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
	cfg, err := Load(append([]string{"--frontend-dir", t.TempDir()}, networkArgs(t)...))
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

func TestLoadConfiguresConsulDiscovery(t *testing.T) {
	bindHost := testInterfaceIPv4
	cfg, err := Load(append([]string{
		"--frontend-dir", t.TempDir(),
		"--consul-agent-host", "consul.local",
		"--consul-agent-port", "8500",
		"--fallback-host", "caddy.local",
		"--fallback-port", "8000",
		"--service-bind-host", bindHost,
	}, networkArgs(t)...))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.ServiceBindIPv4 != bindHost || cfg.ConsulAgentPort != 8500 || cfg.FallbackPort != 8000 {
		t.Fatalf("discovery config = %+v", cfg)
	}
}

func TestLoadConfiguresRemoteConsulOverVPN(t *testing.T) {
	cfg, err := Load(append([]string{
		"--frontend-dir", t.TempDir(),
		"--consul-agent-host", "10.39.2.8",
		"--consul-agent-port", "8500",
		"--service-bind-host", "10.39.2.1",
	}, networkArgs(t)...))
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.ConsulAgentHost != "10.39.2.8" || cfg.ConsulAgentPort != 8500 || cfg.ServiceBindIPv4 != "10.39.2.1" {
		t.Fatalf("remote Consul config = %+v", cfg)
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
			args := append([]string{"--frontend-dir", t.TempDir()}, networkArgs(t)...)
			args = append(args, test.args...)
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
		{name: "invalid public IPv4", args: []string{"--frontend-dir", t.TempDir(), "--public-ipv4", "::1"}},
		{name: "zero media port", args: []string{"--frontend-dir", t.TempDir(), "--media-udp-port", "0"}},
		{name: "out of range media port", args: []string{"--frontend-dir", t.TempDir(), "--media-udp-port", "65536"}},
		{name: "missing interface", args: []string{"--frontend-dir", t.TempDir(), "--interface", "missing-test-interface"}},
		{name: "partial Consul config", args: []string{"--frontend-dir", t.TempDir(), "--consul-agent-host", "consul.local"}},
		{name: "partial fallback config", args: []string{"--frontend-dir", t.TempDir(), "--fallback-port", "8000"}},
		{name: "Consul without service bind host", args: []string{"--frontend-dir", t.TempDir(), "--consul-agent-host", "consul.local", "--consul-agent-port", "8500"}},
		{name: "Consul agent port out of range", args: []string{"--frontend-dir", t.TempDir(), "--consul-agent-host", "consul.local", "--consul-agent-port", "65536", "--service-bind-host", testInterfaceIPv4}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			args := append(networkArgs(t), test.args...)
			if _, err := Load(args); err == nil {
				t.Fatal("Load() error = nil, want boundary validation error")
			}
		})
	}
}

func networkArgs(t *testing.T) []string {
	t.Helper()
	configureTestInterface(t)
	return []string{
		"--media-udp-port", "3478",
		"--public-ipv4", testInterfaceIPv4,
		"--interface", testInterfaceName,
	}
}

func TestSelectMediaIPv4(t *testing.T) {
	originalByName, originalAddrs := interfaceByName, interfaceAddrs
	t.Cleanup(func() {
		interfaceByName, interfaceAddrs = originalByName, originalAddrs
	})
	iface := &net.Interface{Name: "test0", Flags: net.FlagUp}
	interfaceByName = func(name string) (*net.Interface, error) {
		if name != iface.Name {
			return nil, &net.OpError{Op: "route", Net: "ip", Err: os.ErrNotExist}
		}
		return iface, nil
	}
	for _, test := range []struct {
		name    string
		flags   net.Flags
		addrs   []net.Addr
		want    string
		wantErr bool
	}{
		{name: "single IPv4", flags: net.FlagUp, addrs: []net.Addr{&net.IPNet{IP: net.ParseIP("192.0.2.10")}}, want: "192.0.2.10"},
		{name: "no IPv4", flags: net.FlagUp, addrs: []net.Addr{&net.IPNet{IP: net.ParseIP("2001:db8::1")}}, wantErr: true},
		{name: "multiple IPv4", flags: net.FlagUp, addrs: []net.Addr{&net.IPNet{IP: net.ParseIP("192.0.2.10")}, &net.IPAddr{IP: net.ParseIP("192.0.2.11")}}, wantErr: true},
		{name: "unspecified IPv4", flags: net.FlagUp, addrs: []net.Addr{&net.IPNet{IP: net.IPv4zero}}, wantErr: true},
		{name: "down interface", flags: 0, addrs: []net.Addr{&net.IPNet{IP: net.ParseIP("192.0.2.10")}}, wantErr: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			iface.Flags = test.flags
			interfaceAddrs = func(*net.Interface) ([]net.Addr, error) { return test.addrs, nil }
			got, err := selectMediaIPv4("test0")
			if test.wantErr {
				if err == nil {
					t.Fatal("selectMediaIPv4() error = nil")
				}
				return
			}
			if err != nil || got.String() != test.want {
				t.Fatalf("selectMediaIPv4() = %v, %v; want %s, nil", got, err, test.want)
			}
		})
	}
	if _, err := selectMediaIPv4("missing"); err == nil {
		t.Fatal("selectMediaIPv4(missing) error = nil")
	}
}

const (
	testInterfaceName = "test0"
	testInterfaceIPv4 = "192.0.2.10"
)

func configureTestInterface(t *testing.T) {
	t.Helper()
	originalByName, originalAddrs := interfaceByName, interfaceAddrs
	iface := &net.Interface{Name: testInterfaceName, Flags: net.FlagUp}
	interfaceByName = func(name string) (*net.Interface, error) {
		if name != testInterfaceName {
			return nil, os.ErrNotExist
		}
		return iface, nil
	}
	interfaceAddrs = func(*net.Interface) ([]net.Addr, error) {
		return []net.Addr{&net.IPNet{IP: net.ParseIP(testInterfaceIPv4)}}, nil
	}
	t.Cleanup(func() { interfaceByName, interfaceAddrs = originalByName, originalAddrs })
}
