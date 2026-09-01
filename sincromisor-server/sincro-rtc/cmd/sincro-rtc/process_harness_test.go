package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

type fakeConsulRegistration struct {
	ID      string
	Name    string
	Address string
	Port    int
	Check   struct {
		HTTP                           string
		Interval                       string
		Timeout                        string
		DeregisterCriticalServiceAfter string
	}
}

type fakeConsul struct {
	server       *httptest.Server
	host         string
	port         int
	registered   chan fakeConsulRegistration
	deregistered chan string
	mu           sync.Mutex
	service      fakeConsulRegistration
}

func newFakeConsul(t *testing.T) *fakeConsul {
	t.Helper()
	consul := &fakeConsul{registered: make(chan fakeConsulRegistration, 1), deregistered: make(chan string, 1)}
	consul.server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodPut && request.URL.Path == "/v1/agent/service/register":
			var service fakeConsulRegistration
			if err := json.NewDecoder(request.Body).Decode(&service); err != nil {
				http.Error(writer, err.Error(), http.StatusBadRequest)
				return
			}
			consul.mu.Lock()
			consul.service = service
			consul.mu.Unlock()
			consul.registered <- service
		case request.Method == http.MethodPut && strings.HasPrefix(request.URL.Path, "/v1/agent/service/deregister/"):
			consul.deregistered <- strings.TrimPrefix(request.URL.Path, "/v1/agent/service/deregister/")
		case request.Method == http.MethodGet && strings.HasPrefix(request.URL.Path, "/v1/health/service/"):
			consul.mu.Lock()
			service := consul.service
			consul.mu.Unlock()
			if service.ID != "" {
				response, err := http.Get(service.Check.HTTP)
				if err == nil && response.StatusCode == http.StatusOK {
					_ = json.NewEncoder(writer).Encode([]fakeConsulRegistration{service})
					_ = response.Body.Close()
					return
				}
				if response != nil {
					_ = response.Body.Close()
				}
			}
			_ = json.NewEncoder(writer).Encode([]fakeConsulRegistration{})
		default:
			http.NotFound(writer, request)
		}
	}))
	host, rawPort, err := net.SplitHostPort(strings.TrimPrefix(consul.server.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	consul.host = host
	consul.port, err = strconv.Atoi(rawPort)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(consul.server.Close)
	return consul
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

func reserveUDPPort(t *testing.T) string {
	t.Helper()
	socket, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
	if err != nil {
		t.Fatalf("reserve UDP address: %v", err)
	}
	port := strconv.Itoa(socket.LocalAddr().(*net.UDPAddr).Port)
	if err := socket.Close(); err != nil {
		t.Fatalf("release UDP address: %v", err)
	}
	return port
}

// singleIPv4Interface はproduction設定と同じ唯一IPv4のinterfaceを統合試験へ渡す。
// loはVPN addressを併設するhostがあるため、固定名を渡すとstartup validationより前にHTTP検証へ進めない。
func singleIPv4Interface(t *testing.T) (string, string) {
	t.Helper()
	interfaces, err := net.Interfaces()
	if err != nil {
		t.Fatalf("list interfaces: %v", err)
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addresses, err := iface.Addrs()
		if err != nil {
			t.Fatalf("list interface addresses for %q: %v", iface.Name, err)
		}
		var ipv4 net.IP
		for _, address := range addresses {
			var ip net.IP
			switch typed := address.(type) {
			case *net.IPNet:
				ip = typed.IP
			case *net.IPAddr:
				ip = typed.IP
			}
			if candidate := ip.To4(); candidate != nil && !candidate.IsUnspecified() {
				if ipv4 != nil {
					ipv4 = nil
					break
				}
				ipv4 = candidate
			}
		}
		if ipv4 != nil {
			return iface.Name, ipv4.String()
		}
	}
	t.Fatal("no up non-loopback interface has exactly one non-unspecified IPv4 address")
	return "", ""
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
			t.Fatalf("sincro-rtc HTTP did not become ready: %v", ctx.Err())
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
