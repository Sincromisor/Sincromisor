//go:build gate3

package consuldev

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

func TestMain(m *testing.M) {
	if len(os.Args) > 1 && os.Args[1] == "agent" {
		runFakeConsul()
		return
	}
	os.Exit(m.Run())
}

func TestAgentRegistersHealthAndCleansUp(t *testing.T) {
	requirePortFree(t)
	cfg := fakeConfig(t, "")
	agent, err := Start(cfg)
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	for _, registration := range registrationOrder {
		response, requestErr := http.Get(
			"http://" + consulAddress + "/v1/health/service/" + string(registration.service) + "?passing=true",
		)
		if requestErr != nil {
			t.Fatalf("health %s: %v", registration.service, requestErr)
		}
		var entries []struct {
			Service struct {
				ID      string
				Address string
				Port    uint16
			}
		}
		if decodeErr := json.NewDecoder(response.Body).Decode(&entries); decodeErr != nil {
			t.Fatal(decodeErr)
		}
		_ = response.Body.Close()
		if len(entries) != 1 || entries[0].Service.ID != registration.id ||
			entries[0].Service.Address != "127.0.0.1" ||
			entries[0].Service.Port != cfg.Services[registration.service].Port {
			t.Fatalf("health entry for %s = %+v", registration.service, entries)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := agent.Close(ctx); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestAgentRejectsOccupiedPortWithoutStartingProcess(t *testing.T) {
	listener, err := net.Listen("tcp", consulAddress)
	if err != nil {
		t.Skipf("port unavailable before test: %v", err)
	}
	defer listener.Close()
	_, err = Start(fakeConfig(t, ""))
	if !errors.Is(err, ErrPortInUse) {
		t.Fatalf("Start() error = %v, want ErrPortInUse", err)
	}
}

func TestAgentClassifiesProcessExitBeforeReadiness(t *testing.T) {
	requirePortFree(t)
	cfg := fakeConfig(t, "")
	cfg.Binary = "/bin/true"
	_, err := Start(cfg)
	if !errors.Is(err, ErrProcess) {
		t.Fatalf("Start() error = %v, want ErrProcess", err)
	}
}

func TestRegistrationAndRollbackFailuresPreserveBothSentinels(t *testing.T) {
	requirePortFree(t)
	cfg := fakeConfig(t, "register-fail=2\nderegister-fail=true\n")
	_, err := Start(cfg)
	if !errors.Is(err, ErrRegistration) || !errors.Is(err, ErrCleanup) {
		t.Fatalf("Start() error = %v, want ErrRegistration and ErrCleanup", err)
	}
}

func TestExpiredCloseStillJoinsProcess(t *testing.T) {
	requirePortFree(t)
	agent, err := Start(fakeConfig(t, ""))
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := agent.Close(ctx); !errors.Is(err, ErrCleanup) {
		t.Fatalf("Close() error = %v, want ErrCleanup", err)
	}
	if agent.owner.State() != "exited" {
		t.Fatalf("owner state = %s, want exited", agent.owner.State())
	}
}

func requirePortFree(t *testing.T) {
	t.Helper()
	listener, err := net.Listen("tcp", consulAddress)
	if err != nil {
		t.Skipf("dedicated Consul port is not available: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
}

func fakeConfig(t *testing.T, mode string) Config {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	workDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(workDir, "fake-consul-mode"), []byte(mode), 0o600); err != nil {
		t.Fatal(err)
	}
	services := make(map[discovery.Service]discovery.Endpoint, len(registrationOrder))
	for index, registration := range registrationOrder {
		services[registration.service] = discovery.Endpoint{Host: "127.0.0.1", Port: uint16(12001 + index)}
	}
	return Config{Binary: executable, WorkDir: workDir, Services: services}
}

type fakeRegistration struct {
	ID      string `json:"ID"`
	Name    string `json:"Name"`
	Address string `json:"Address"`
	Port    uint16 `json:"Port"`
}

func runFakeConsul() {
	modeBytes, _ := os.ReadFile("fake-consul-mode")
	mode := string(modeBytes)
	registrations := make(map[string]fakeRegistration)
	var mu sync.Mutex
	registerCount := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/status/leader", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`"127.0.0.1:8300"`))
	})
	mux.HandleFunc("/v1/agent/service/register", func(w http.ResponseWriter, request *http.Request) {
		var registration fakeRegistration
		if json.NewDecoder(request.Body).Decode(&registration) != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		registerCount++
		if strings.Contains(mode, fmt.Sprintf("register-fail=%d", registerCount)) {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		registrations[registration.ID] = registration
	})
	mux.HandleFunc("/v1/agent/service/deregister/", func(w http.ResponseWriter, request *http.Request) {
		if strings.Contains(mode, "deregister-fail=true") {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		id := strings.TrimPrefix(request.URL.Path, "/v1/agent/service/deregister/")
		mu.Lock()
		delete(registrations, id)
		mu.Unlock()
	})
	mux.HandleFunc("/v1/health/service/", func(w http.ResponseWriter, request *http.Request) {
		name := strings.TrimPrefix(request.URL.Path, "/v1/health/service/")
		mu.Lock()
		defer mu.Unlock()
		entries := make([]map[string]any, 0, 1)
		for _, registration := range registrations {
			if registration.Name == name {
				entries = append(entries, map[string]any{"Service": registration})
			}
		}
		_ = json.NewEncoder(w).Encode(entries)
	})
	server := &http.Server{Addr: consulAddress, Handler: mux}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM)
	go func() {
		<-signals
		_ = server.Shutdown(context.Background())
	}()
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		os.Exit(2)
	}
}
