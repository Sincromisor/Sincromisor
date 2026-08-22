package discovery

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRegistrationUsesPythonCompatibleIDAndReadyCheck(t *testing.T) {
	var registration struct {
		ID      string
		Name    string
		Address string
		Port    uint16
		Check   struct {
			HTTP                           string
			Interval                       string
			Timeout                        string
			DeregisterCriticalServiceAfter string
		}
	}
	var deregistered string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodPut && request.URL.Path == "/v1/agent/service/register":
			if err := json.NewDecoder(request.Body).Decode(&registration); err != nil {
				t.Errorf("decode registration: %v", err)
			}
		case request.Method == http.MethodPut && strings.HasPrefix(request.URL.Path, "/v1/agent/service/deregister/"):
			deregistered = strings.TrimPrefix(request.URL.Path, "/v1/agent/service/deregister/")
		default:
			t.Errorf("unexpected request %s %s", request.Method, request.URL.Path)
		}
		writer.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	host, port := serverHostPort(t, server.URL)
	client, err := NewRegistration(Registration{
		AgentHost: host, AgentPort: port, Host: "pion", Address: "172.18.0.4", Port: 8001,
	})
	if err != nil {
		t.Fatalf("NewRegistration() error = %v", err)
	}
	if err := client.Register(context.Background()); err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if err := client.Deregister(context.Background()); err != nil {
		t.Fatalf("Deregister() error = %v", err)
	}
	wantID := "RTCSignalingServer_pion_172.18.0.4:8001"
	if registration.ID != wantID || registration.Name != "RTCSignalingServer" ||
		registration.Address != "172.18.0.4" || registration.Port != 8001 ||
		registration.Check.HTTP != "http://172.18.0.4:8001/health/ready" ||
		registration.Check.Interval != "10s" || registration.Check.Timeout != "5s" ||
		registration.Check.DeregisterCriticalServiceAfter != "10m" || deregistered != wantID {
		t.Fatalf("registration = %+v, deregistered = %q", registration, deregistered)
	}
}

func serverHostPort(t *testing.T, rawURL string) (string, uint16) {
	t.Helper()
	parts := strings.Split(strings.TrimPrefix(rawURL, "http://"), ":")
	if len(parts) != 2 {
		t.Fatalf("server URL = %q", rawURL)
	}
	var port uint16
	if _, err := fmt.Sscan(parts[1], &port); err != nil {
		t.Fatalf("parse port: %v", err)
	}
	return parts[0], port
}
