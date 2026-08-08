package discovery

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"
)

const (
	registrationTimeout = 2 * time.Second
	registrationName    = "RTCSignalingServer"
)

// Registration は Consul agent に登録する Pion HTTP endpoint を表す。
// Address は container 内から到達する IPv4、Port は HTTP listener の port である。
type Registration struct {
	AgentHost string
	AgentPort uint16
	Host      string
	Address   string
	Port      uint16
}

type registrationClient struct {
	baseURL *url.URL
	service Registration
	client  *http.Client
}

var errRegistrationRedirect = errors.New("consul registration redirect rejected")

// NewRegistration は RTCSignalingServer の登録と解除を行う client を作る。
// network I/O は行わず、agent と service endpoint の不正値は listener を公開する前に返す。
func NewRegistration(service Registration) (*registrationClient, error) {
	if service.AgentHost == "" || service.AgentPort == 0 || service.Host == "" || service.Port == 0 {
		return nil, errors.New("registration host and ports must be set")
	}
	if ip := net.ParseIP(service.Address); ip == nil || ip.To4() == nil || ip.IsUnspecified() {
		return nil, errors.New("registration address must be a non-unspecified IPv4 address")
	}
	baseURL, err := url.Parse("http://" + net.JoinHostPort(service.AgentHost, fmt.Sprint(service.AgentPort)))
	if err != nil || baseURL.Hostname() == "" {
		return nil, errors.New("registration agent must be a valid HTTP host and port")
	}
	return &registrationClient{
		baseURL: baseURL,
		service: service,
		client: &http.Client{
			Timeout: registrationTimeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return errRegistrationRedirect
			},
		},
	}, nil
}

// Register は non-ready listener を Consul agent へ登録する。
// readiness は caller が registration 成功後に /health/ready を公開して Consul check に委ねる。
func (c *registrationClient) Register(ctx context.Context) error {
	payload, err := json.Marshal(struct {
		ID      string `json:"ID"`
		Name    string `json:"Name"`
		Address string `json:"Address"`
		Port    uint16 `json:"Port"`
		Check   struct {
			HTTP                           string `json:"HTTP"`
			Interval                       string `json:"Interval"`
			Timeout                        string `json:"Timeout"`
			DeregisterCriticalServiceAfter string `json:"DeregisterCriticalServiceAfter"`
		} `json:"Check"`
	}{
		ID:      c.ID(),
		Name:    registrationName,
		Address: c.service.Address,
		Port:    c.service.Port,
		Check: struct {
			HTTP                           string `json:"HTTP"`
			Interval                       string `json:"Interval"`
			Timeout                        string `json:"Timeout"`
			DeregisterCriticalServiceAfter string `json:"DeregisterCriticalServiceAfter"`
		}{
			HTTP:                           "http://" + net.JoinHostPort(c.service.Address, fmt.Sprint(c.service.Port)) + "/health/ready",
			Interval:                       "10s",
			Timeout:                        "5s",
			DeregisterCriticalServiceAfter: "10m",
		},
	})
	if err != nil {
		return fmt.Errorf("encode Consul registration: %w", err)
	}
	return c.do(ctx, http.MethodPut, "/v1/agent/service/register", payload)
}

// Deregister は service ID を Consul agent から解除する。
func (c *registrationClient) Deregister(ctx context.Context) error {
	return c.do(ctx, http.MethodPut, "/v1/agent/service/deregister/"+url.PathEscape(c.ID()), nil)
}

// ID は Python RTC と共有する service identifier を返す。
func (c *registrationClient) ID() string {
	return registrationName + "_" + c.service.Host + "_" + c.service.Address + ":" + fmt.Sprint(c.service.Port)
}

// do は redirect を許可せず、agent API の成功 status だけを registration lifecycle へ返す。
func (c *registrationClient) do(ctx context.Context, method, path string, payload []byte) error {
	requestURL := *c.baseURL
	requestURL.Path = path
	requestCtx, cancel := context.WithTimeout(ctx, registrationTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, method, requestURL.String(), bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create Consul request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := c.client.Do(request)
	if err != nil {
		return fmt.Errorf("send Consul request: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("Consul request returned %s", response.Status)
	}
	return nil
}
