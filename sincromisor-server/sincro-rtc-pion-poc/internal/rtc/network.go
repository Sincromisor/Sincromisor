package rtc

import (
	"errors"
	"io"
	"net"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
)

// ProcessNetwork は全Sessionで共有するPion APIとUDP muxを所有する。
// muxへ渡ったconnはCloseだけが破棄し、mainやSessionが直接closeしてはならない。
type ProcessNetwork struct {
	API       *webrtc.API
	mux       io.Closer
	closeOnce sync.Once
	closeErr  error
}

// NewProcessNetwork は全SessionのPeerConnectionに1つのprocess所有UDP muxを設定する。
// 成功return後はmuxがconnの唯一のclose ownerとなる。このAPIは別socketを開かず、TCPとIPv6も有効化しない。
func NewProcessNetwork(
	conn net.PacketConn,
	publicIPv4 string,
	interfaceName string,
	gatherTimeout time.Duration,
) (*ProcessNetwork, error) {
	if conn == nil {
		return nil, errors.New("ice udp connection must not be nil")
	}
	if ip := net.ParseIP(publicIPv4); ip == nil || ip.To4() == nil || ip.IsUnspecified() {
		return nil, errors.New("public IPv4 must be a non-unspecified IPv4 address")
	}
	if interfaceName == "" {
		return nil, errors.New("ice interface must not be empty")
	}
	settings := webrtc.SettingEngine{}
	mux := webrtc.NewICEUDPMux(nil, conn)
	settings.SetICEUDPMux(mux)
	settings.SetNAT1To1IPs([]string{publicIPv4}, webrtc.ICECandidateTypeHost)
	settings.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	settings.SetInterfaceFilter(func(name string) bool { return name == interfaceName })
	settings.SetIncludeLoopbackCandidate(true)
	if gatherTimeout > 0 {
		settings.SetSTUNGatherTimeout(gatherTimeout)
	}
	return &ProcessNetwork{API: webrtc.NewAPI(webrtc.WithSettingEngine(settings)), mux: mux}, nil
}

// Close はmuxとsocketを一度だけ閉じる。全SessionとOffer ownerの収束後にprocess ownerが呼ぶ。
func (n *ProcessNetwork) Close() error {
	if n == nil {
		return nil
	}
	n.closeOnce.Do(func() { n.closeErr = n.mux.Close() })
	return n.closeErr
}
