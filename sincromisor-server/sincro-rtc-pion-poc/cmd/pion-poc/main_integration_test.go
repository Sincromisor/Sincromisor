package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

func TestProcessSIGTERMStopsHTTPAndJoinsActiveSession(t *testing.T) {
	moduleRoot, err := filepath.Abs("../..")
	if err != nil {
		t.Fatalf("resolve module root: %v", err)
	}
	binaryPath := filepath.Join(t.TempDir(), "pion-poc")
	build := exec.Command("go", "build", "-buildvcs=false", "-o", binaryPath, "./cmd/pion-poc")
	build.Dir = moduleRoot
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build pion-poc: %v\n%s", err, output)
	}

	frontendDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("pion poc"), 0o600); err != nil {
		t.Fatalf("write frontend fixture: %v", err)
	}
	address := reserveTCPAddress(t)
	command := exec.Command(
		binaryPath,
		"--http", address,
		"--frontend-dir", frontendDir,
		"--gather-timeout", "2s",
	)
	var processOutput bytes.Buffer
	command.Stdout = &processOutput
	command.Stderr = &processOutput
	if err := command.Start(); err != nil {
		t.Fatalf("start pion-poc: %v", err)
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
		t.Fatalf("pion-poc exceeded 6s shutdown limit before Wait observation\n%s", processOutput.String())
	}
	select {
	case err := <-waitResult:
		processExited = true
		if err != nil {
			t.Fatalf("pion-poc exit after SIGTERM = %v\n%s", err, processOutput.String())
		}
	case <-time.After(waitTimeout):
		t.Fatalf("pion-poc did not exit within 6s after SIGTERM\n%s", processOutput.String())
	}
	output := processOutput.String()
	for _, expected := range []string{
		`stage=listener_ready`,
		`shutdown signal received`,
		`reason=process_shutdown`,
		`session registry updated`,
		`stage=shutdown_complete`,
		`count=0`,
		`pion poc stopped`,
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

type processStatus struct {
	Sessions int  `json:"sessions"`
	Ready    bool `json:"ready"`
	Draining bool `json:"draining"`
}

func reserveTCPAddress(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve TCP address: %v", err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("release TCP address: %v", err)
	}
	return address
}

func waitForHTTPReady(t *testing.T, url string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	client := &http.Client{Timeout: 200 * time.Millisecond}
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			t.Fatalf("create readiness request: %v", err)
		}
		response, err := client.Do(request)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return
			}
		}
		select {
		case <-ctx.Done():
			t.Fatalf("pion-poc HTTP did not become ready: %v", ctx.Err())
		case <-ticker.C:
		}
	}
}

func newProcessTestPeer(t *testing.T) *webrtc.PeerConnection {
	t.Helper()
	client, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("NewPeerConnection() error = %v", err)
	}
	if _, err := client.AddTransceiverFromKind(
		webrtc.RTPCodecTypeAudio,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly},
	); err != nil {
		_ = client.Close()
		t.Fatalf("AddTransceiverFromKind() error = %v", err)
	}
	return client
}

func createProcessSession(t *testing.T, client *webrtc.PeerConnection, baseURL string) string {
	t.Helper()
	offer, err := client.CreateOffer(nil)
	if err != nil {
		t.Fatalf("CreateOffer() error = %v", err)
	}
	gatherComplete := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(offer); err != nil {
		t.Fatalf("SetLocalDescription() error = %v", err)
	}
	<-gatherComplete
	local := client.LocalDescription()
	if local == nil {
		t.Fatal("client local description is nil")
	}
	body := processOfferBody(local.SDP, "ca55c1dc-6b83-4f7d-a4e2-2e9fb65a0eae")
	response, err := http.Post(
		baseURL+"/api/v1/RTCSignalingServer/offer",
		"application/json",
		strings.NewReader(body),
	)
	if err != nil {
		t.Fatalf("POST offer: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("POST offer status = %d, want 200; body=%s", response.StatusCode, payload)
	}
	var answer struct {
		SDP  string `json:"sdp"`
		Type string `json:"type"`
	}
	if err := json.NewDecoder(response.Body).Decode(&answer); err != nil {
		t.Fatalf("decode offer response: %v", err)
	}
	if err := client.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  answer.SDP,
	}); err != nil {
		t.Fatalf("SetRemoteDescription() error = %v", err)
	}
	return local.SDP
}

func processOfferBody(sdp, requestID string) string {
	return fmt.Sprintf(
		`{"sdp":%q,"type":"offer","talk_mode":"chat","offer_request_id":%q,"offer_revision":1}`,
		sdp,
		requestID,
	)
}

func waitForDrainingStatus(
	t *testing.T,
	client *http.Client,
	baseURL string,
	deadline time.Time,
) processStatus {
	t.Helper()
	for time.Now().Before(deadline) {
		status, err := fetchProcessStatus(client, baseURL)
		if err == nil && status.Draining {
			return status
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("draining status was not observable before admission window closed")
	return processStatus{}
}

func waitForSessionCount(
	t *testing.T,
	client *http.Client,
	baseURL string,
	want int,
	deadline time.Time,
) {
	t.Helper()
	for time.Now().Before(deadline) {
		status, err := fetchProcessStatus(client, baseURL)
		if err == nil && status.Sessions == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("session count did not become %d before admission window closed", want)
}

func fetchProcessStatus(client *http.Client, baseURL string) (processStatus, error) {
	response, err := client.Get(baseURL + "/api/v1/RTCSignalingServer/statuses")
	if err != nil {
		return processStatus{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return processStatus{}, fmt.Errorf("statuses response: %s", response.Status)
	}
	var status processStatus
	if err := json.NewDecoder(response.Body).Decode(&status); err != nil {
		return processStatus{}, fmt.Errorf("decode statuses: %w", err)
	}
	return status, nil
}

func assertHTTPStatus(
	t *testing.T,
	client *http.Client,
	method string,
	url string,
	body string,
	want int,
) {
	t.Helper()
	request, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		t.Fatalf("create %s request: %v", method, err)
	}
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("%s %s returned connection error, want HTTP %d: %v", method, url, want, err)
	}
	defer response.Body.Close()
	if response.StatusCode != want {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("%s %s status = %d, want %d; body=%s", method, url, response.StatusCode, want, payload)
	}
}

func waitForHTTPStopped(t *testing.T, client *http.Client, baseURL string, deadline time.Time) {
	t.Helper()
	for time.Now().Before(deadline) {
		response, err := client.Get(baseURL + "/health/live")
		if err != nil {
			return
		}
		_ = response.Body.Close()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("HTTP listener still accepted connections after shutdown")
}
