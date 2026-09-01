package main

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
)

func TestProcessRegistersReadyServiceAndDeregistersOnSIGTERM(t *testing.T) {
	consul := newFakeConsul(t)
	moduleRoot, err := filepath.Abs("../..")
	if err != nil {
		t.Fatalf("resolve module root: %v", err)
	}
	binaryPath := filepath.Join(t.TempDir(), "sincro-rtc")
	build := exec.Command("go", "build", "-buildvcs=false", "-o", binaryPath, "./cmd/sincro-rtc")
	build.Dir = moduleRoot
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build sincro-rtc: %v\n%s", err, output)
	}
	frontendDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("sincro-rtc"), 0o600); err != nil {
		t.Fatalf("write frontend fixture: %v", err)
	}
	address := reserveTCPAddress(t)
	mediaPort := reserveUDPPort(t)
	interfaceName, publicIPv4 := singleIPv4Interface(t)
	command := exec.Command(binaryPath,
		"--http", address, "--frontend-dir", frontendDir, "--media-udp-port", mediaPort,
		"--public-ipv4", publicIPv4, "--interface", interfaceName, "--consul-agent-host", consul.host,
		"--consul-agent-port", strconv.Itoa(consul.port), "--service-bind-host", "127.0.0.1",
		"--fallback-host", "caddy.local", "--fallback-port", "8000",
	)
	if err := command.Start(); err != nil {
		t.Fatalf("start sincro-rtc: %v", err)
	}
	processExited := false
	t.Cleanup(func() {
		if !processExited && command.Process != nil {
			_ = command.Process.Kill()
			_ = command.Wait()
		}
	})
	registration := <-consul.registered
	port, err := strconv.Atoi(strings.Split(address, ":")[1])
	if err != nil {
		t.Fatal(err)
	}
	wantID := "RTCSignalingServer_127.0.0.1_127.0.0.1:" + strconv.Itoa(port)
	if registration.ID != wantID || registration.Name != "RTCSignalingServer" || registration.Address != "127.0.0.1" ||
		registration.Port != port || registration.Check.HTTP != "http://"+address+"/health/ready" ||
		registration.Check.Interval != "10s" || registration.Check.Timeout != "5s" || registration.Check.DeregisterCriticalServiceAfter != "10m" {
		t.Fatalf("registration = %+v", registration)
	}
	waitForHTTPReady(t, "http://"+address+"/health/ready")
	response, err := http.Get(consul.server.URL + "/v1/health/service/RTCSignalingServer?passing=true")
	if err != nil {
		t.Fatalf("query passing service: %v", err)
	}
	var passing []fakeConsulRegistration
	if err := json.NewDecoder(response.Body).Decode(&passing); err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if len(passing) != 1 || passing[0].ID != wantID {
		t.Fatalf("passing services = %+v", passing)
	}
	if err := command.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatalf("send SIGTERM: %v", err)
	}
	if got := <-consul.deregistered; got != wantID {
		t.Fatalf("deregistered = %q, want %q", got, wantID)
	}
	if err := command.Wait(); err != nil {
		t.Fatalf("sincro-rtc exit after SIGTERM = %v", err)
	}
	processExited = true
}
