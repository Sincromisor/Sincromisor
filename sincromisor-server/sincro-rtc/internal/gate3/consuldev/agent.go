package consuldev

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"sync"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/gate3/process"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

const (
	consulAddress   = "127.0.0.1:8500"
	readinessWindow = 5 * time.Second
	probeInterval   = 50 * time.Millisecond
)

type startOptions struct {
	address         string
	readinessWindow time.Duration
	probeInterval   time.Duration
	clientTimeout   time.Duration
}

func defaultStartOptions() startOptions {
	return startOptions{
		address:         consulAddress,
		readinessWindow: readinessWindow,
		probeInterval:   probeInterval,
		clientTimeout:   500 * time.Millisecond,
	}
}

var registrationOrder = []struct {
	service discovery.Service
	id      string
}{
	{discovery.ServiceExtractor, ExtractorServiceID},
	{discovery.ServiceRecognizer, RecognizerServiceID},
	{discovery.ServiceProcessor, ProcessorServiceID},
	{discovery.ServiceSynthesizer, SynthesizerServiceID},
}

// Agent は4登録と、その Consul node を作った process.Owner を所有する。
//
// Close は冪等で、context が失効して登録解除に失敗しても child を必ず join する。
type Agent struct {
	owner      *process.Owner
	client     *http.Client
	baseURL    string
	options    startOptions
	registered []string
	closeOnce  sync.Once
	closeErr   error
}

// Start は8500番 port の排他的所有を確認し、Consul を1回起動して空でない leader を待ち、
// pipeline 接続順で4 service を登録する。
func Start(cfg Config) (*Agent, error) {
	options := defaultStartOptions()
	if cfg.testOptions != nil {
		options = *cfg.testOptions
	}
	return start(cfg, options)
}

// start は production の固定値と試験用の時間・listen先を分離して所有処理を組み立てる。
// 公開 Start は常に 127.0.0.1:8500 / 5秒を渡し、試験だけが既存 Consul を変更せず短い別portを使う。
func start(cfg Config, options startOptions) (*Agent, error) {
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	if err := validateStartOptions(options); err != nil {
		return nil, err
	}
	listener, err := net.Listen("tcp", options.address)
	if err != nil {
		return nil, fmt.Errorf("%w: bind %s: %v", ErrPortInUse, options.address, err)
	}
	if err := listener.Close(); err != nil {
		return nil, fmt.Errorf("%w: release bind probe: %v", ErrPortInUse, err)
	}

	owner := process.New(process.Command{
		Path: cfg.Binary,
		Args: []string{"agent", "-dev", "-bind=127.0.0.1", "-client=127.0.0.1", "-http-port=8500"},
		Env:  []string{},
		Dir:  cfg.WorkDir,
	})
	if err := owner.Start(); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrProcess, err)
	}
	agent := &Agent{
		owner: owner, client: &http.Client{Timeout: options.clientTimeout},
		baseURL: "http://" + options.address, options: options,
	}
	if err := agent.waitReady(); err != nil {
		return nil, errors.Join(err, agent.cleanup(context.Background()))
	}
	for _, registration := range registrationOrder {
		endpoint := cfg.Services[registration.service]
		if err := agent.register(registration.id, registration.service, endpoint); err != nil {
			return nil, errors.Join(err, agent.cleanup(context.Background()))
		}
		agent.registered = append(agent.registered, registration.id)
	}
	return agent, nil
}

func validateStartOptions(options startOptions) error {
	host, port, err := net.SplitHostPort(options.address)
	if err != nil || host != "127.0.0.1" || port == "" ||
		options.readinessWindow <= 0 || options.probeInterval <= 0 || options.clientTimeout <= 0 {
		return fmt.Errorf("%w: invalid internal start options", ErrProtocol)
	}
	return nil
}

func validateConfig(cfg Config) error {
	if !filepath.IsAbs(cfg.Binary) || !filepath.IsAbs(cfg.WorkDir) {
		return fmt.Errorf("%w: Binary and WorkDir must be absolute", ErrProtocol)
	}
	if len(cfg.Services) != len(registrationOrder) {
		return fmt.Errorf("%w: Services must contain exactly four entries", ErrProtocol)
	}
	for _, registration := range registrationOrder {
		endpoint, found := cfg.Services[registration.service]
		if !found || endpoint.Host != "127.0.0.1" || endpoint.Port == 0 {
			return fmt.Errorf("%w: invalid endpoint for %s", ErrProtocol, registration.service)
		}
	}
	return nil
}

// waitReady は process 終了を readiness failure より優先して分類しながら leader を probe する。
// 一時的な接続拒否は agent 起動中の正常な中間状態なので5秒の所有期限まで再試行する。
func (a *Agent) waitReady() error {
	deadline := time.Now().Add(a.options.readinessWindow)
	var lastErr error
	for time.Now().Before(deadline) {
		if a.owner.State() == process.StateExited {
			return fmt.Errorf("%w: child exited before leader readiness", ErrProcess)
		}
		response, err := a.client.Get(a.baseURL + "/v1/status/leader")
		if err == nil {
			payload, readErr := io.ReadAll(io.LimitReader(response.Body, 1025))
			closeErr := response.Body.Close()
			if response.StatusCode >= 200 && response.StatusCode < 300 &&
				readErr == nil && closeErr == nil && len(payload) <= 1024 {
				var leader string
				if json.Unmarshal(payload, &leader) == nil && leader != "" {
					return nil
				}
			}
			lastErr = fmt.Errorf("leader probe status=%d", response.StatusCode)
		} else {
			lastErr = err
		}
		time.Sleep(a.options.probeInterval)
	}
	return fmt.Errorf("%w: leader not ready within %s: %v", ErrReadiness, a.options.readinessWindow, lastErr)
}

// register は Consul の公開 DTO を ID/Name/Address/Port に限定し、
// health check や既存 node の設定を暗黙に追加しない。
func (a *Agent) register(id string, service discovery.Service, endpoint discovery.Endpoint) error {
	body, err := json.Marshal(struct {
		ID      string `json:"ID"`
		Name    string `json:"Name"`
		Address string `json:"Address"`
		Port    uint16 `json:"Port"`
	}{ID: id, Name: string(service), Address: endpoint.Host, Port: endpoint.Port})
	if err != nil {
		return fmt.Errorf("%w: marshal %s: %v", ErrRegistration, service, err)
	}
	request, err := http.NewRequest(http.MethodPut, a.baseURL+"/v1/agent/service/register", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("%w: create request for %s: %v", ErrRegistration, service, err)
	}
	response, err := a.client.Do(request)
	if err != nil {
		return fmt.Errorf("%w: register %s: %v", ErrRegistration, service, err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1024))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("%w: register %s status %d", ErrRegistration, service, response.StatusCode)
	}
	return nil
}

// Close は所有 ID を逆順で登録解除してから process owner を無条件に join する。
// 複数 cleanup error は errors.Is でそれぞれ判定できる。
func (a *Agent) Close(ctx context.Context) error {
	a.closeOnce.Do(func() {
		a.closeErr = a.cleanup(ctx)
	})
	return a.closeErr
}

// cleanup は登録の逆順解除を全件試行し、その成否に関係なく context を取らない Owner.Close へ進む。
// これにより期限切れ context でも process と background waiter の所有権が残らない。
func (a *Agent) cleanup(ctx context.Context) error {
	var cleanupErr error
	for index := len(a.registered) - 1; index >= 0; index-- {
		if err := a.deregister(ctx, a.registered[index]); err != nil {
			cleanupErr = errors.Join(cleanupErr, err)
		}
	}
	a.registered = nil
	wasRunning := a.owner.State() == process.StateRunning
	result, err := a.owner.Close()
	// Consul 2.xはSIGTERMの正常shutdownをexit 1で返す。Agentが実際にrunning childを
	// 停止した場合だけこのcodeを受理し、先に異常終了したchildのexit 1は隠さない。
	if err != nil && !(wasRunning && result.ExitCode == 1) {
		cleanupErr = errors.Join(cleanupErr, fmt.Errorf("close Consul owner: %v", err))
	}
	if cleanupErr != nil {
		return errors.Join(ErrCleanup, cleanupErr)
	}
	return nil
}

func (a *Agent) deregister(ctx context.Context, id string) error {
	endpoint := a.baseURL + "/v1/agent/service/deregister/" + url.PathEscape(id)
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint, nil)
	if err != nil {
		return fmt.Errorf("create deregister request for %s: %w", id, err)
	}
	response, err := a.client.Do(request)
	if err != nil {
		return fmt.Errorf("deregister %s: %w", id, err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1024))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("deregister %s status %d", id, response.StatusCode)
	}
	return nil
}
