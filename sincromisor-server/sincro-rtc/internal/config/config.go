// Package config は Pion PoC の起動時設定を flag から検証済みの値へ変換する。
package config

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	defaultGatherTimeout = 5 * time.Second
	// DefaultMaxSessions はproductionで許可するactive session数の既定値かつ上限である。
	DefaultMaxSessions = 100
	// DefaultOfferCacheCapacity はin-flightを含むinitial Offer registryの既定値かつ上限である。
	DefaultOfferCacheCapacity = 1000
	// DefaultOfferCacheTTL はcompleted Answerとtombstoneの既定TTLかつ上限である。
	DefaultOfferCacheTTL = 2 * time.Minute
	minOfferCacheTTL     = 30 * time.Second
)

// Config はHTTP、static配信、ICE、session/cache admission、FFmpegに必要な起動時設定を保持する。
//
// Load が directory、executable path、URL を検証するため、下流 package はfilesystem探索を行わない。
// production compose、Consul、TURN の設定はこの PoC の対象外である。
type Config struct {
	HTTPAddress        string
	FrontendDir        string
	STUNURL            string
	MediaUDPPort       uint
	MediaIPv4          string
	PublicIPv4         string
	Interface          string
	GatherTimeout      time.Duration
	MaxSessions        int
	OfferCacheCapacity int
	OfferCacheTTL      time.Duration
	// ConsulAgentHost と ConsulAgentPort は discovery と service registration を有効にする組である。
	ConsulAgentHost string
	ConsulAgentPort uint
	// FallbackHost と FallbackPort は Consul 不可時に4 serviceへ共通で使う Caddy endpoint である。
	FallbackHost string
	FallbackPort uint
	// ServiceBindHost は service ID 用の設定値、ServiceBindIPv4 は起動時に解決した登録 address である。
	ServiceBindHost string
	ServiceBindIPv4 string
	// FFmpegPathはexec.LookPathで解決済みのabsolute executable pathである。
	FFmpegPath string
}

// Load は command line flag を解析し、起動前に有限 timeout とローカル実行境界を検証する。
//
// args に未知flag、不正なlisten address、存在しないstatic directory/FFmpeg、STUN以外のURLが
// ある場合はerrorを返す。FFmpegはexec.LookPathでabsolute pathへ確定するが、version probeと
// processの終了判断はmainに委ねる。
func Load(args []string) (Config, error) {
	flags := flag.NewFlagSet("sincro-rtc", flag.ContinueOnError)
	var cfg Config
	flags.StringVar(&cfg.HTTPAddress, "http", "127.0.0.1:8080", "HTTP listen address")
	flags.StringVar(&cfg.FrontendDir, "frontend-dir", "", "built frontend directory")
	flags.StringVar(&cfg.STUNURL, "stun", "", "optional STUN URL")
	flags.UintVar(&cfg.MediaUDPPort, "media-udp-port", 0, "UDP4 port for the shared ICE mux")
	flags.StringVar(&cfg.PublicIPv4, "public-ipv4", "", "advertised IPv4 host candidate")
	flags.StringVar(&cfg.Interface, "interface", "", "network interface used for ICE candidates")
	flags.DurationVar(&cfg.GatherTimeout, "gather-timeout", defaultGatherTimeout, "ICE gathering timeout")
	flags.IntVar(&cfg.MaxSessions, "max-sessions", DefaultMaxSessions, "active session limit")
	flags.IntVar(&cfg.OfferCacheCapacity, "offer-cache-capacity", DefaultOfferCacheCapacity, "initial Offer registry limit")
	flags.DurationVar(&cfg.OfferCacheTTL, "offer-cache-ttl", DefaultOfferCacheTTL, "completed initial Offer lifetime")
	flags.StringVar(&cfg.ConsulAgentHost, "consul-agent-host", "", "Consul agent host")
	flags.UintVar(&cfg.ConsulAgentPort, "consul-agent-port", 0, "Consul agent port")
	flags.StringVar(&cfg.FallbackHost, "fallback-host", "", "Caddy fallback host for pipeline services")
	flags.UintVar(&cfg.FallbackPort, "fallback-port", 0, "Caddy fallback port for pipeline services")
	flags.StringVar(&cfg.ServiceBindHost, "service-bind-host", "", "container IPv4 registered for the HTTP service")
	flags.StringVar(&cfg.FFmpegPath, "ffmpeg", "ffmpeg", "FFmpeg executable path")
	if err := flags.Parse(args); err != nil {
		return Config{}, fmt.Errorf("parse flags: %w", err)
	}
	if flags.NArg() != 0 {
		return Config{}, fmt.Errorf("unexpected positional arguments: %v", flags.Args())
	}
	httpAddress, err := net.ResolveTCPAddr("tcp", cfg.HTTPAddress)
	if err != nil {
		return Config{}, fmt.Errorf("invalid http address: %w", err)
	}
	if err := validateDiscoveryConfig(&cfg, httpAddress.Port); err != nil {
		return Config{}, err
	}
	if cfg.MediaUDPPort < 1 || cfg.MediaUDPPort > 65535 {
		return Config{}, errors.New("media-udp-port must be between 1 and 65535")
	}
	mediaIPv4, err := selectMediaIPv4(cfg.Interface)
	if err != nil {
		return Config{}, err
	}
	cfg.MediaIPv4 = mediaIPv4.String()
	if ip := net.ParseIP(cfg.PublicIPv4); ip == nil || ip.To4() == nil || ip.IsUnspecified() {
		return Config{}, errors.New("public-ipv4 must be a non-unspecified IPv4 address")
	}
	if cfg.GatherTimeout <= 0 {
		return Config{}, errors.New("gather-timeout must be positive")
	}
	if cfg.MaxSessions < 1 || cfg.MaxSessions > DefaultMaxSessions {
		return Config{}, fmt.Errorf("max-sessions must be between 1 and %d", DefaultMaxSessions)
	}
	if cfg.OfferCacheCapacity < 1 || cfg.OfferCacheCapacity > DefaultOfferCacheCapacity {
		return Config{}, fmt.Errorf("offer-cache-capacity must be between 1 and %d", DefaultOfferCacheCapacity)
	}
	if cfg.OfferCacheTTL < minOfferCacheTTL || cfg.OfferCacheTTL > DefaultOfferCacheTTL {
		return Config{}, fmt.Errorf("offer-cache-ttl must be between %s and %s", minOfferCacheTTL, DefaultOfferCacheTTL)
	}
	if cfg.FrontendDir == "" {
		return Config{}, errors.New("frontend-dir is required")
	}
	absoluteDir, err := filepath.Abs(cfg.FrontendDir)
	if err != nil {
		return Config{}, fmt.Errorf("resolve frontend-dir: %w", err)
	}
	info, err := os.Stat(absoluteDir)
	if err != nil {
		return Config{}, fmt.Errorf("inspect frontend-dir: %w", err)
	}
	if !info.IsDir() {
		return Config{}, errors.New("frontend-dir must be a directory")
	}
	cfg.FrontendDir = absoluteDir
	if cfg.STUNURL != "" {
		parsed, parseErr := url.Parse(cfg.STUNURL)
		if parseErr != nil || parsed.Scheme != "stun" || (parsed.Host == "" && parsed.Opaque == "") {
			return Config{}, errors.New("stun must be a valid stun: URL")
		}
	}
	ffmpegPath, err := exec.LookPath(cfg.FFmpegPath)
	if err != nil {
		return Config{}, fmt.Errorf("resolve ffmpeg executable: %w", err)
	}
	cfg.FFmpegPath, err = filepath.Abs(ffmpegPath)
	if err != nil {
		return Config{}, fmt.Errorf("resolve ffmpeg absolute path: %w", err)
	}
	return cfg, nil
}

func validateDiscoveryConfig(cfg *Config, httpPort int) error {
	consulConfigured := cfg.ConsulAgentHost != "" || cfg.ConsulAgentPort != 0
	if consulConfigured && (cfg.ConsulAgentHost == "" || cfg.ConsulAgentPort == 0) {
		return errors.New("consul-agent-host and consul-agent-port must be set together")
	}
	if cfg.ConsulAgentPort > 65535 {
		return errors.New("consul-agent-port must be between 1 and 65535")
	}
	fallbackConfigured := cfg.FallbackHost != "" || cfg.FallbackPort != 0
	if fallbackConfigured && (cfg.FallbackHost == "" || cfg.FallbackPort == 0) {
		return errors.New("fallback-host and fallback-port must be set together")
	}
	if cfg.FallbackPort > 65535 {
		return errors.New("fallback-port must be between 1 and 65535")
	}
	if consulConfigured {
		if err := validateHost(cfg.ConsulAgentHost); err != nil {
			return fmt.Errorf("invalid consul-agent-host: %w", err)
		}
		if httpPort < 1 || httpPort > 65535 {
			return errors.New("http port must be between 1 and 65535 when Consul is configured")
		}
		resolved, err := resolveSingleIPv4(cfg.ServiceBindHost)
		if err != nil {
			return fmt.Errorf("invalid service-bind-host: %w", err)
		}
		cfg.ServiceBindIPv4 = resolved
	}
	if fallbackConfigured {
		if err := validateHost(cfg.FallbackHost); err != nil {
			return fmt.Errorf("invalid fallback-host: %w", err)
		}
	}
	return nil
}

func resolveSingleIPv4(host string) (string, error) {
	if host == "" {
		return "", errors.New("must be set when Consul is configured")
	}
	addresses, err := net.LookupIP(host)
	if err != nil {
		return "", fmt.Errorf("resolve host: %w", err)
	}
	var ipv4 net.IP
	for _, address := range addresses {
		if candidate := address.To4(); candidate != nil {
			if ipv4 != nil && !ipv4.Equal(candidate) {
				return "", errors.New("must resolve to a single IPv4 address")
			}
			ipv4 = candidate
		}
	}
	if ipv4 == nil {
		return "", errors.New("must resolve to an IPv4 address")
	}
	return ipv4.String(), nil
}

func validateHost(host string) error {
	if host == "" || strings.TrimSpace(host) != host || strings.ContainsAny(host, "/?#@") {
		return errors.New("host must not be empty or contain URL components")
	}
	if net.ParseIP(strings.Trim(host, "[]")) != nil {
		return nil
	}
	if strings.Contains(host, ":") {
		return errors.New("host must not contain a port or scheme")
	}
	for _, label := range strings.Split(host, ".") {
		if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return errors.New("host has an invalid DNS label")
		}
		for _, character := range label {
			if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') &&
				(character < '0' || character > '9') && character != '-' {
				return errors.New("host has an invalid DNS character")
			}
		}
	}
	return nil
}

var (
	interfaceByName = net.InterfaceByName
	interfaceAddrs  = func(iface *net.Interface) ([]net.Addr, error) { return iface.Addrs() }
)

// selectMediaIPv4 は指定interfaceの唯一の非-unspecified IPv4をshared ICE muxのbind先として返す。
// interfaceの複数addressを推測して選ぶとcandidate filterとsocket bindがずれるため、listenerを開く前に拒否する。
func selectMediaIPv4(interfaceName string) (net.IP, error) {
	if interfaceName == "" {
		return nil, errors.New("interface is required")
	}
	iface, err := interfaceByName(interfaceName)
	if err != nil {
		return nil, fmt.Errorf("inspect interface: %w", err)
	}
	if iface.Flags&net.FlagUp == 0 {
		return nil, fmt.Errorf("interface %q is not up", interfaceName)
	}
	addresses, err := interfaceAddrs(iface)
	if err != nil {
		return nil, fmt.Errorf("list interface addresses: %w", err)
	}
	var mediaIPv4 net.IP
	for _, address := range addresses {
		var ip net.IP
		switch typed := address.(type) {
		case *net.IPNet:
			ip = typed.IP
		case *net.IPAddr:
			ip = typed.IP
		}
		if ipv4 := ip.To4(); ipv4 != nil && !ipv4.IsUnspecified() {
			if mediaIPv4 != nil {
				return nil, fmt.Errorf("interface %q must have exactly one non-unspecified IPv4 address", interfaceName)
			}
			mediaIPv4 = ipv4
		}
	}
	if mediaIPv4 == nil {
		return nil, fmt.Errorf("interface %q must have exactly one non-unspecified IPv4 address", interfaceName)
	}
	return mediaIPv4, nil
}
