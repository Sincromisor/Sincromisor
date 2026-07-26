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
	build := exec.Command("go", "build", "-o", binaryPath, "./cmd/pion-poc")
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
	createProcessSession(t, client, baseURL)

	if err := command.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatalf("send SIGTERM: %v", err)
	}
	waitResult := make(chan error, 1)
	go func() {
		waitResult <- command.Wait()
	}()
	select {
	case err := <-waitResult:
		processExited = true
		if err != nil {
			t.Fatalf("pion-poc exit after SIGTERM = %v\n%s", err, processOutput.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("pion-poc did not exit after SIGTERM\n%s", processOutput.String())
	}

	httpClient := &http.Client{Timeout: 200 * time.Millisecond}
	if response, err := httpClient.Get(baseURL + "/api/v1/RTCSignalingServer/config.json"); err == nil {
		_ = response.Body.Close()
		t.Fatalf("HTTP still accepted after process exit: status=%d", response.StatusCode)
	}
	output := processOutput.String()
	for _, expected := range []string{
		`shutdown signal received`,
		`signal=terminated`,
		`session registry updated`,
		`active_sessions=0`,
		`pion poc stopped`,
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("process output missing %q:\n%s", expected, output)
		}
	}
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

func createProcessSession(t *testing.T, client *webrtc.PeerConnection, baseURL string) {
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
	body := fmt.Sprintf(
		`{"sdp":%q,"type":"offer","talk_mode":"chat"}`,
		local.SDP,
	)
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
}
