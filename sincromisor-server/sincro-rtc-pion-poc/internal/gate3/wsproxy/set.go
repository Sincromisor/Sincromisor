package wsproxy

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

var services = []discovery.Service{
	discovery.ServiceExtractor,
	discovery.ServiceRecognizer,
	discovery.ServiceProcessor,
	discovery.ServiceSynthesizer,
}

type proxy struct {
	service  discovery.Service
	upstream discovery.Endpoint
	listener net.Listener
	server   *http.Server
}

type serviceState struct {
	requestsInFlight int
	rejects          int
	completed        int
	counts           Counts
}

// Set は4つの透過 proxy と1つの atomic な有限規則列を所有する。
type Set struct {
	ctx    context.Context
	cancel context.CancelFunc

	mu        sync.Mutex
	proxies   map[discovery.Service]*proxy
	addresses map[discovery.Service]discovery.Endpoint
	state     map[discovery.Service]*serviceState
	rules     []Rule
	errs      []error
	closing   bool
	handlerWG sync.WaitGroup

	wg        sync.WaitGroup
	closeOnce sync.Once
	closeErr  error
}

// NewSet は完全な upstream set を検証し、4つの loopback proxy を開く。
func NewSet(cfg Config) (*Set, error) {
	if cfg.ListenHost == "" {
		cfg.ListenHost = "127.0.0.1"
	}
	if address := net.ParseIP(cfg.ListenHost); address == nil || !address.IsLoopback() {
		return nil, fmt.Errorf("%w: ListenHost must be a loopback IP address", ErrProtocol)
	}
	if err := validateUpstreams(cfg.Upstreams); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	set := &Set{
		ctx: ctx, cancel: cancel, proxies: make(map[discovery.Service]*proxy),
		addresses: make(map[discovery.Service]discovery.Endpoint),
		state:     make(map[discovery.Service]*serviceState),
	}
	for _, service := range services {
		if err := set.start(service, cfg.ListenHost, cfg.Upstreams[service]); err != nil {
			_ = set.Close(context.Background())
			return nil, err
		}
	}
	return set, nil
}

func validateUpstreams(upstreams map[discovery.Service]discovery.Endpoint) error {
	if len(upstreams) != len(services) {
		return fmt.Errorf("%w: Upstreams must contain exactly four services", ErrProtocol)
	}
	for _, service := range services {
		endpoint, found := upstreams[service]
		address := net.ParseIP(endpoint.Host)
		if !found || address == nil || !address.IsLoopback() || endpoint.Port == 0 {
			return fmt.Errorf("%w: invalid upstream for %s", ErrProtocol, service)
		}
	}
	return nil
}

func (s *Set) start(service discovery.Service, host string, upstream discovery.Endpoint) error {
	listener, err := net.Listen("tcp", net.JoinHostPort(host, "0"))
	if err != nil {
		return fmt.Errorf("%w: listen %s: %v", ErrProtocol, service, err)
	}
	proxy := &proxy{service: service, upstream: upstream, listener: listener}
	proxy.server = &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.beginHandler() {
			http.Error(w, "proxy set is closing", http.StatusServiceUnavailable)
			return
		}
		defer s.handlerWG.Done()
		s.serve(proxy, w, r)
	})}
	s.proxies[service] = proxy
	s.addresses[service] = discovery.Endpoint{Host: host, Port: uint16(listener.Addr().(*net.TCPAddr).Port)}
	s.state[service] = &serviceState{}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		if serveErr := proxy.server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			s.record(fmt.Errorf("%w: serve %s: %v", ErrProtocol, service, serveErr))
		}
	}()
	return nil
}

// Addresses は4つの proxy endpoint を防御的 map copy として返す。
func (s *Set) Addresses() map[discovery.Service]discovery.Endpoint {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make(map[discovery.Service]discovery.Endpoint, len(s.addresses))
	for service, endpoint := range s.addresses {
		result[service] = endpoint
	}
	return result
}

// Arm は request/response 交換間に空でない有限規則列を設定する。
//
// 既存規則、未実行 reconnect 拒否、response 待ち request、正常 turn 未完了のいずれかでは
// 状態を変えず ErrArmConflict を返す。
func (s *Set) Arm(rules []Rule) error {
	if err := validateRules(rules); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.rules) != 0 {
		return ErrArmConflict
	}
	for _, state := range s.state {
		if state.completed == 0 || state.requestsInFlight != 0 || state.rejects != 0 {
			return ErrArmConflict
		}
	}
	s.rules = append([]Rule(nil), rules...)
	return nil
}

func validateRules(rules []Rule) error {
	if len(rules) == 0 {
		return fmt.Errorf("%w: rule sequence must not be empty", ErrArmConflict)
	}
	for _, rule := range rules {
		if rule.MatchOrdinal != 1 || rule.RejectReconnects != 1 ||
			(rule.Action != ActionClose && rule.Action != ActionMalformed && rule.Action != ActionHeldClose) {
			return fmt.Errorf("%w: invalid finite rule", ErrProtocol)
		}
		validService := false
		for _, service := range services {
			validService = validService || rule.Service == service
		}
		if !validService {
			return fmt.Errorf("%w: invalid rule service", ErrProtocol)
		}
	}
	return nil
}

// Ledger は request payload を公開せず単調な接続数を返す。
func (s *Set) Ledger() Ledger {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := Ledger{Connections: make(map[discovery.Service]Counts, len(s.state))}
	for service, state := range s.state {
		result.Connections[service] = state.counts
	}
	return result
}

// VerifyConsumed は残存規則、拒否、交換、worker error を scenario error として返す。
func (s *Set) VerifyConsumed() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var result error
	if len(s.rules) != 0 {
		result = errors.Join(result, fmt.Errorf("%w: %d rules remain", ErrRuleUnconsumed, len(s.rules)))
	}
	for service, state := range s.state {
		if state.rejects != 0 || state.requestsInFlight != 0 {
			result = errors.Join(result, fmt.Errorf("%w: %s has pending finite state", ErrRuleUnconsumed, service))
		}
	}
	return errors.Join(result, errors.Join(s.errs...))
}

// Close は接続を cancel し、listener を逆順で閉じて worker を join する。
func (s *Set) Close(ctx context.Context) error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closing = true
		s.mu.Unlock()
		s.cancel()
		for index := len(services) - 1; index >= 0; index-- {
			proxy := s.proxies[services[index]]
			if proxy == nil {
				continue
			}
			s.closeErr = errors.Join(s.closeErr, proxy.server.Shutdown(ctx))
			if err := proxy.listener.Close(); err != nil && !errors.Is(err, net.ErrClosed) {
				s.closeErr = errors.Join(s.closeErr, err)
			}
		}
		s.handlerWG.Wait()
		s.wg.Wait()
	})
	return s.closeErr
}

// beginHandler は net/http が Shutdown で追跡しない hijacked WebSocket を Set 所有へ加える。
// Close と同じ mutex により、新規 Add を停止してから安全に全 handler を join できる。
func (s *Set) beginHandler() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		return false
	}
	s.handlerWG.Add(1)
	return true
}

func (s *Set) record(err error) {
	if err == nil {
		return
	}
	s.mu.Lock()
	s.errs = append(s.errs, err)
	s.mu.Unlock()
}
