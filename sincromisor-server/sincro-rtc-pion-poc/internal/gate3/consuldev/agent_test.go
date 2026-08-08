//go:build gate3

package consuldev

import (
	"context"
	"errors"
	"net"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

func TestAgentRegistersHealthAndCleansUpInReverse(t *testing.T) {
	options := isolatedOptions(t, 500*time.Millisecond)
	cfg := fakeConfig(t, options, "")
	agent, err := startUsingOptions(t, cfg, options)
	if err != nil {
		t.Fatalf("start() error = %v", err)
	}
	assertRegisteredHealth(t, agent.baseURL, cfg.Services)
	if err := agent.Close(context.Background()); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	events := readFakeEvents(t, cfg.WorkDir)
	wantSuffix := []string{
		"deregister:" + SynthesizerServiceID,
		"deregister:" + ProcessorServiceID,
		"deregister:" + RecognizerServiceID,
		"deregister:" + ExtractorServiceID,
	}
	if len(events) < len(wantSuffix) ||
		!slices.Equal(events[len(events)-len(wantSuffix):], wantSuffix) {
		t.Fatalf("cleanup events = %v, want reverse suffix %v", events, wantSuffix)
	}
}

func TestAgentAcceptsConsulTwoSIGTERMExitCode(t *testing.T) {
	options := isolatedOptions(t, 500*time.Millisecond)
	agent, err := startUsingOptions(t, fakeConfig(t, options, "owner-close-one=true\n"), options)
	if err != nil {
		t.Fatalf("start() error = %v", err)
	}
	if err := agent.Close(context.Background()); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
}

func TestAgentRejectsOccupiedProductionPortWithoutStartingProcess(t *testing.T) {
	listener, err := net.Listen("tcp", consulAddress)
	if err != nil {
		// An existing Consul is the production conflict this boundary must preserve.
		cfg := fakeConfig(t, defaultStartOptions(), "")
		_, startErr := Start(cfg)
		if !errors.Is(startErr, ErrPortInUse) {
			t.Fatalf("Start() error = %v, want ErrPortInUse", startErr)
		}
		return
	}
	defer listener.Close()
	cfg := fakeConfig(t, defaultStartOptions(), "")
	_, err = Start(cfg)
	if !errors.Is(err, ErrPortInUse) {
		t.Fatalf("Start() error = %v, want ErrPortInUse", err)
	}
}

func TestConfigValidationClassifiesServiceSetAndEndpointErrors(t *testing.T) {
	valid := validServices()
	tests := []struct {
		name     string
		services map[discovery.Service]discovery.Endpoint
	}{
		{name: "missing", services: cloneWithout(valid, discovery.ServiceSynthesizer)},
		{name: "extra", services: withExtra(valid)},
		{name: "host", services: withEndpoint(valid, discovery.ServiceExtractor, discovery.Endpoint{Host: "127.0.0.2", Port: 12001})},
		{name: "port", services: withEndpoint(valid, discovery.ServiceExtractor, discovery.Endpoint{Host: "127.0.0.1"})},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := Start(Config{Binary: "/bin/true", WorkDir: t.TempDir(), Services: test.services})
			if !errors.Is(err, ErrProtocol) {
				t.Fatalf("Start() error = %v, want ErrProtocol", err)
			}
		})
	}
}

func TestOwnerStartFailureIsErrProcessWithoutCleanup(t *testing.T) {
	options := isolatedOptions(t, 200*time.Millisecond)
	cfg := Config{
		Binary:   filepath.Join(t.TempDir(), "missing-consul"),
		WorkDir:  t.TempDir(),
		Services: validServices(),
	}
	_, err := startUsingOptions(t, cfg, options)
	if !errors.Is(err, ErrProcess) || errors.Is(err, ErrCleanup) {
		t.Fatalf("start() error = %v, want only ErrProcess", err)
	}
}

func TestProcessExitBeforeReadinessIsErrProcess(t *testing.T) {
	options := isolatedOptions(t, 200*time.Millisecond)
	cfg := fakeConfig(t, options, "exit-before-ready=true\n")
	_, err := startUsingOptions(t, cfg, options)
	if !errors.Is(err, ErrProcess) || errors.Is(err, ErrCleanup) {
		t.Fatalf("start() error = %v, want only ErrProcess", err)
	}
}

func TestReadinessFailuresAreFiniteAndCleanupOwnedProcess(t *testing.T) {
	tests := []struct {
		name string
		mode string
	}{
		{name: "non-2xx", mode: "leader-status=503\n"},
		{name: "invalid-leader", mode: "leader-invalid=true\n"},
		{name: "timeout", mode: "leader-delay=true\n"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			options := isolatedOptions(t, 120*time.Millisecond)
			cfg := fakeConfig(t, options, test.mode)
			_, err := startUsingOptions(t, cfg, options)
			if !errors.Is(err, ErrReadiness) || errors.Is(err, ErrCleanup) {
				t.Fatalf("start() error = %v, want only ErrReadiness", err)
			}
		})
	}
}

func TestRegistrationFailureRollsBackWithoutChangingClassification(t *testing.T) {
	options := isolatedOptions(t, 500*time.Millisecond)
	cfg := fakeConfig(t, options, "register-fail=2\n")
	_, err := startUsingOptions(t, cfg, options)
	if !errors.Is(err, ErrRegistration) || errors.Is(err, ErrCleanup) {
		t.Fatalf("start() error = %v, want only ErrRegistration", err)
	}
	events := readFakeEvents(t, cfg.WorkDir)
	if !slices.Contains(events, "deregister:"+ExtractorServiceID) {
		t.Fatalf("partial registration was not rolled back: %v", events)
	}
}

func TestCloseFailureIsErrCleanupAndStillJoinsProcess(t *testing.T) {
	options := isolatedOptions(t, 500*time.Millisecond)
	cfg := fakeConfig(t, options, "deregister-fail=true\n")
	agent, err := startUsingOptions(t, cfg, options)
	if err != nil {
		t.Fatalf("start() error = %v", err)
	}
	if err := agent.Close(context.Background()); !errors.Is(err, ErrCleanup) {
		t.Fatalf("Close() error = %v, want ErrCleanup", err)
	}
	if agent.owner.State() != "exited" {
		t.Fatalf("owner state = %s, want exited", agent.owner.State())
	}
}

func TestOriginalAndCleanupFailuresPreserveBothSentinels(t *testing.T) {
	tests := []struct {
		name     string
		mode     string
		original error
	}{
		{
			name: "registration-and-deregister",
			mode: "register-fail=2\nderegister-fail=true\n", original: ErrRegistration,
		},
		{
			name: "readiness-and-owner-close",
			mode: "leader-status=503\nowner-close-fail=true\n", original: ErrReadiness,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			options := isolatedOptions(t, 120*time.Millisecond)
			cfg := fakeConfig(t, options, test.mode)
			_, err := startUsingOptions(t, cfg, options)
			if !errors.Is(err, test.original) || !errors.Is(err, ErrCleanup) {
				t.Fatalf("start() error = %v, want %v and ErrCleanup", err, test.original)
			}
		})
	}
}

func TestExpiredCloseStillAttemptsCleanupAndJoinsProcess(t *testing.T) {
	options := isolatedOptions(t, 500*time.Millisecond)
	agent, err := startUsingOptions(t, fakeConfig(t, options, ""), options)
	if err != nil {
		t.Fatalf("start() error = %v", err)
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
