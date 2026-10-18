package signaling

import (
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pion/ice/v4"
	"github.com/pion/transport/v5/stdnet"
	"github.com/pion/webrtc/v4"
)

// newSignalingTestAPI は実UDPを使いながら、ホストのNIC数やmDNS探索にOfferの期限判定を依存させない。
// stdnetの初期列挙はSetRemoteDescription時まで遅延するとOfferの1秒期限を消費するため、ここで済ませる。
func newSignalingTestAPI(t *testing.T) *webrtc.API {
	t.Helper()
	network, err := stdnet.NewNet()
	if err != nil {
		t.Fatalf("stdnet.NewNet() error = %v", err)
	}
	settings := webrtc.SettingEngine{}
	settings.SetNet(network)
	settings.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	settings.SetIncludeLoopbackCandidate(true)
	settings.SetIPFilter(func(ip net.IP) bool { return ip.IsLoopback() })
	settings.SetICEMulticastDNSMode(ice.MulticastDNSModeDisabled)
	return webrtc.NewAPI(webrtc.WithSettingEngine(settings))
}

// assertLoopbackCandidates は収集を省略せず、実UDPのローカル候補が生成されたことを確認する。
func assertLoopbackCandidates(t *testing.T, sdp string) {
	t.Helper()
	count := 0
	for _, line := range strings.Split(sdp, "\n") {
		if !strings.HasPrefix(line, "a=candidate:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 8 || !strings.EqualFold(fields[2], "udp") || fields[6] != "typ" || fields[7] != "host" {
			t.Fatalf("unexpected candidate: %q", line)
		}
		ip := net.ParseIP(fields[4])
		if ip == nil || ip.To4() == nil || !ip.IsLoopback() {
			t.Fatalf("non-loopback IPv4 candidate: %q", line)
		}
		count++
	}
	if count == 0 {
		t.Fatal("no loopback host candidate")
	}
}

// TestRealManagerConcurrentOffers は全体race検査と同じ並行初期化でも正常系が期限内に完了することを確認する。
func TestRealManagerConcurrentOffers(t *testing.T) {
	for i := 0; i < 4; i++ {
		t.Run(strconv.Itoa(i), func(t *testing.T) {
			t.Parallel()
			manager := newRealTestManager(t, "")
			t.Cleanup(func() {
				if err := manager.CloseAll(closeContext(t), "test_teardown"); err != nil {
					t.Error(err)
				}
			})
			server := New(manager, newTestOfferRegistry(t, manager, time.Second), t.TempDir(), "", slog.New(slog.NewTextHandler(io.Discard, nil)))
			createRealManagerSession(t, server)
		})
	}
}
