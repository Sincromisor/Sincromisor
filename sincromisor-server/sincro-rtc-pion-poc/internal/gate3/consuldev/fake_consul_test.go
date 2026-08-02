//go:build gate3

package consuldev

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

func isolatedOptions(t *testing.T, window time.Duration) startOptions {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	return startOptions{
		address: address, readinessWindow: window,
		probeInterval: 10 * time.Millisecond, clientTimeout: 50 * time.Millisecond,
	}
}

// startUsingOptions は unexported Config seam から public Start へ別loopback portと短い期限を渡す。
// 外部callerが構築できる Config は常に8500/5秒となるため、production契約は変化しない。
func startUsingOptions(t *testing.T, cfg Config, options startOptions) (*Agent, error) {
	t.Helper()
	cfg.testOptions = &options
	return Start(cfg)
}

func fakeConfig(t *testing.T, options startOptions, mode string) Config {
	t.Helper()
	workDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(workDir, "fake-consul-mode"), []byte(mode), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workDir, "fake-consul-address"), []byte(options.address), 0o600); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(workDir, "fake-consul")
	if err := os.WriteFile(binary, []byte(fakeConsulScript), 0o700); err != nil {
		t.Fatal(err)
	}
	return Config{Binary: binary, WorkDir: workDir, Services: validServices()}
}

func validServices() map[discovery.Service]discovery.Endpoint {
	services := make(map[discovery.Service]discovery.Endpoint, len(registrationOrder))
	for index, registration := range registrationOrder {
		services[registration.service] = discovery.Endpoint{Host: "127.0.0.1", Port: uint16(12001 + index)}
	}
	return services
}

func cloneWithout(
	services map[discovery.Service]discovery.Endpoint,
	remove discovery.Service,
) map[discovery.Service]discovery.Endpoint {
	result := mapsClone(services)
	delete(result, remove)
	return result
}

func withExtra(services map[discovery.Service]discovery.Endpoint) map[discovery.Service]discovery.Endpoint {
	result := mapsClone(services)
	result[discovery.Service("ExtraService")] = discovery.Endpoint{Host: "127.0.0.1", Port: 12999}
	return result
}

func withEndpoint(
	services map[discovery.Service]discovery.Endpoint,
	service discovery.Service,
	endpoint discovery.Endpoint,
) map[discovery.Service]discovery.Endpoint {
	result := mapsClone(services)
	result[service] = endpoint
	return result
}

func mapsClone[K comparable, V any](source map[K]V) map[K]V {
	result := make(map[K]V, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

type fakeRegistration struct {
	ID      string `json:"ID"`
	Name    string `json:"Name"`
	Address string `json:"Address"`
	Port    uint16 `json:"Port"`
}

func readFakeEvents(t *testing.T, workDir string) []string {
	t.Helper()
	payload, err := os.ReadFile(filepath.Join(workDir, "fake-consul-events"))
	if err != nil {
		t.Fatal(err)
	}
	return strings.Fields(string(payload))
}

func assertRegisteredHealth(
	t *testing.T,
	baseURL string,
	services map[discovery.Service]discovery.Endpoint,
) {
	t.Helper()
	for _, registration := range registrationOrder {
		response, err := http.Get(
			baseURL + "/v1/health/service/" + string(registration.service) + "?passing=true",
		)
		if err != nil {
			t.Fatalf("health %s: %v", registration.service, err)
		}
		var entries []struct {
			Service fakeRegistration
		}
		decodeErr := json.NewDecoder(response.Body).Decode(&entries)
		_ = response.Body.Close()
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		want := services[registration.service]
		if len(entries) != 1 || entries[0].Service.ID != registration.id ||
			entries[0].Service.Name != string(registration.service) ||
			entries[0].Service.Address != want.Host || entries[0].Service.Port != want.Port {
			t.Fatalf("health entry for %s = %+v, want ID=%s endpoint=%+v",
				registration.service, entries, registration.id, want)
		}
	}
}

const fakeConsulScript = `#!/usr/bin/python3
import json
import os
import signal
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

mode = open("fake-consul-mode", encoding="utf-8").read()
address = open("fake-consul-address", encoding="utf-8").read().strip()
host, port = address.rsplit(":", 1)
registrations = {}
register_count = 0

def event(value):
    with open("fake-consul-events", "a", encoding="utf-8") as output:
        output.write(value + "\n")

def terminate(_signal, _frame):
    os._exit(3 if "owner-close-fail=true" in mode else 0)

signal.signal(signal.SIGTERM, terminate)

if "exit-before-ready=true" in mode:
    os._exit(0)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/v1/status/leader":
            if "leader-status=503" in mode:
                self.send_response(503)
                self.end_headers()
                return
            if "leader-delay=true" in mode:
                time.sleep(0.25)
            self.send_response(200)
            self.end_headers()
            payload = {"leader": "invalid"} if "leader-invalid=true" in mode else "127.0.0.1:8300"
            self.wfile.write(json.dumps(payload).encode())
            return
        if self.path == "/v1/agent/services":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(registrations).encode())
            return
        if self.path.startswith("/v1/health/service/"):
            name = self.path.split("/v1/health/service/", 1)[1].split("?", 1)[0]
            entries = [{"Service": value} for value in registrations.values() if value["Name"] == name]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(entries).encode())
            return
        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        global register_count
        if self.path == "/v1/agent/service/register":
            length = int(self.headers.get("Content-Length", "0"))
            registration = json.loads(self.rfile.read(length))
            register_count += 1
            event("register:" + registration["ID"])
            if "register-fail=" + str(register_count) in mode:
                self.send_response(500)
                self.end_headers()
                return
            registrations[registration["ID"]] = registration
            self.send_response(200)
            self.end_headers()
            return
        prefix = "/v1/agent/service/deregister/"
        if self.path.startswith(prefix):
            identifier = self.path[len(prefix):]
            event("deregister:" + identifier)
            if "deregister-fail=true" in mode:
                self.send_response(500)
                self.end_headers()
                return
            registrations.pop(identifier, None)
            self.send_response(200)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, _format, *_args):
        pass

HTTPServer((host, int(port)), Handler).serve_forever()
`
