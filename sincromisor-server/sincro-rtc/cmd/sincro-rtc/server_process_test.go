package main

import (
	"bytes"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestProcessSIGTERMStopsHTTPAndJoinsActiveSession(t *testing.T) {
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
	command := exec.Command(
		binaryPath,
		"--http", address,
		"--frontend-dir", frontendDir,
		"--gather-timeout", "2s",
		"--media-udp-port", mediaPort,
		"--public-ipv4", publicIPv4,
		"--interface", interfaceName,
	)
	var processOutput bytes.Buffer
	command.Stdout = &processOutput
	command.Stderr = &processOutput
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

	baseURL := "http://" + address
	waitForHTTPReady(t, baseURL+"/api/v1/RTCSignalingServer/config.json")
	client := newProcessTestPeer(t)
	defer func() {
		if err := client.Close(); err != nil {
			t.Errorf("client.Close() error = %v", err)
		}
	}()
	activeSessionSDP := createProcessSession(t, client, baseURL)

	signalAt := time.Now()
	if err := command.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatalf("send SIGTERM: %v", err)
	}
	waitResult := make(chan error, 1)
	go func() {
		waitResult <- command.Wait()
	}()

	httpClient := &http.Client{Timeout: 200 * time.Millisecond}
	status := waitForDrainingStatus(t, httpClient, baseURL, signalAt.Add(shutdownAdmissionWindow))
	if status.Ready || !status.Draining {
		t.Fatalf("draining status = %+v, want ready=false draining=true", status)
	}
	assertHTTPStatus(t, httpClient, http.MethodGet, baseURL+"/health/ready", "", http.StatusServiceUnavailable)
	drainingObservedAt := time.Now()
	assertHTTPStatus(
		t,
		httpClient,
		http.MethodPost,
		baseURL+"/api/v1/RTCSignalingServer/offer",
		processOfferBody(activeSessionSDP, "2a9910cd-8547-4a40-8863-fe51c7cfbba4"),
		http.StatusServiceUnavailable,
	)
	if elapsed := time.Since(drainingObservedAt); elapsed >= shutdownAdmissionWindow {
		t.Fatalf("initial Offer 503 took %s after draining observation, want less than %s", elapsed, shutdownAdmissionWindow)
	}
	waitForSessionCount(t, httpClient, baseURL, 0, signalAt.Add(shutdownAdmissionWindow))
	waitForHTTPStopped(t, httpClient, baseURL, signalAt.Add(3*time.Second))

	waitTimeout := time.Until(signalAt.Add(shutdownCleanupTimeout + shutdownHTTPTimeout))
	if waitTimeout <= 0 {
		t.Fatalf("sincro-rtc exceeded 6s shutdown limit before Wait observation\n%s", processOutput.String())
	}
	select {
	case err := <-waitResult:
		processExited = true
		if err != nil {
			t.Fatalf("sincro-rtc exit after SIGTERM = %v\n%s", err, processOutput.String())
		}
	case <-time.After(waitTimeout):
		t.Fatalf("sincro-rtc did not exit within 6s after SIGTERM\n%s", processOutput.String())
	}
	output := processOutput.String()
	for _, expected := range []string{
		`stage=listener_ready`,
		`shutdown signal received`,
		`reason=process_shutdown`,
		`session registry updated`,
		`stage=shutdown_complete`,
		`count=0`,
		`sincro-rtc stopped`,
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("process output missing %q:\n%s", expected, output)
		}
	}
	for _, forbidden := range []string{
		`http=`,
		`frontend_dir=`,
		`initial_goroutines=`,
		`signal=`,
		`active_sessions=`,
		`final_goroutines=`,
	} {
		if strings.Contains(output, forbidden) {
			t.Fatalf("process output contains forbidden lifecycle field %q:\n%s", forbidden, output)
		}
	}
}
