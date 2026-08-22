package rtc

import (
	"context"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

func TestProcessNetworkReusesUDPPortAndClosesSocket(t *testing.T) {
	iface := loopbackInterface(t)
	socket, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
	if err != nil {
		t.Fatalf("listen UDP: %v", err)
	}
	address := socket.LocalAddr().(*net.UDPAddr)
	processNetwork, err := NewProcessNetwork(socket, "127.0.0.1", iface, 5*time.Second)
	if err != nil {
		_ = socket.Close()
		t.Fatalf("NewProcessNetwork() error = %v", err)
	}
	manager, err := NewManager("", ManagerConfig{
		PipelineFactory: blockingPipelineFactory{},
		InputObserver:   testInputObserver(),
		Clock:           SystemClock{},
		Logger:          testLogger(),
		MaxSessions:     2,
		SynthDecoder:    testSynthDecoder(t),
		API:             processNetwork.API,
	})
	if err != nil {
		_ = socket.Close()
		t.Fatalf("NewManager() error = %v", err)
	}

	for session := 1; session <= 2; session++ {
		client := loopbackPeer(t, iface)
		answer := negotiateProductionPair(t, manager, client, fmt.Sprintf("8e0e18a9-243b-4c72-8e97-a1b103854e4%d", session))
		if !strings.Contains(answer.SDP, fmt.Sprintf(" 127.0.0.1 %d typ host", address.Port)) {
			t.Fatalf("session %d answer does not advertise shared UDP port %d:\n%s", session, address.Port, answer.SDP)
		}
		if err := client.Close(); err != nil {
			t.Fatalf("session %d client.Close() error = %v", session, err)
		}
	}
	if err := manager.CloseAll(testCloseContext(t), "test_teardown"); err != nil {
		t.Fatalf("CloseAll() error = %v", err)
	}
	if err := processNetwork.Close(); err != nil {
		t.Fatalf("ProcessNetwork.Close() error = %v", err)
	}
	if err := processNetwork.Close(); err != nil {
		t.Fatalf("second ProcessNetwork.Close() error = %v", err)
	}
	listener, err := net.ListenUDP("udp4", address)
	if err != nil {
		t.Fatalf("shared UDP socket remained bound after shutdown: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("close replacement UDP socket: %v", err)
	}
}

func loopbackInterface(t *testing.T) string {
	t.Helper()
	interfaces, err := net.Interfaces()
	if err != nil {
		t.Fatalf("list interfaces: %v", err)
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 {
			return iface.Name
		}
	}
	t.Fatal("loopback interface not found")
	return ""
}

func loopbackPeer(t *testing.T, iface string) *webrtc.PeerConnection {
	t.Helper()
	settings := webrtc.SettingEngine{}
	settings.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	settings.SetInterfaceFilter(func(name string) bool { return name == iface })
	settings.SetIncludeLoopbackCandidate(true)
	api := webrtc.NewAPI(webrtc.WithSettingEngine(settings))
	client, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("create loopback peer: %v", err)
	}
	if _, err := client.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio); err != nil {
		_ = client.Close()
		t.Fatalf("add audio transceiver: %v", err)
	}
	return client
}

func negotiateProductionPair(t *testing.T, manager *Manager, client *webrtc.PeerConnection, requestID string) Answer {
	t.Helper()
	offer, err := client.CreateOffer(nil)
	if err != nil {
		t.Fatalf("CreateOffer() error = %v", err)
	}
	gathered := webrtc.GatheringCompletePromise(client)
	if err := client.SetLocalDescription(offer); err != nil {
		t.Fatalf("SetLocalDescription() error = %v", err)
	}
	<-gathered
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	answer, err := manager.Create(ctx, Offer{SDP: client.LocalDescription().SDP, Type: "offer", TalkMode: "chat", OfferRequestID: requestID})
	if err != nil {
		t.Fatalf("Manager.Create() error = %v", err)
	}
	if err := client.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: answer.SDP}); err != nil {
		t.Fatalf("SetRemoteDescription() error = %v", err)
	}
	waitForCondition(t, 5*time.Second, func() bool { return client.ConnectionState() == webrtc.PeerConnectionStateConnected })
	return answer
}
