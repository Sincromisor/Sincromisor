package main

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
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

// fakeConsul は登録、死活確認、登録解除に必要なConsul HTTP境界だけを再現する。
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

// reserveTCPAddress はprocess起動前に利用可能なHTTP待受アドレスを一度確保して返す。
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

// reserveUDPPort はprocess起動前に利用可能なメディア用UDPポートを一度確保して返す。
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
