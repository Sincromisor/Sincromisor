package network

import (
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"
)

func TestProcessReusesUDPPortAndClosesSocket(t *testing.T) {
	iface := loopbackInterface(t)
	socket, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
	if err != nil {
		t.Fatalf("listen UDP: %v", err)
	}
	address := socket.LocalAddr().(*net.UDPAddr)
	processNetwork, err := New(socket, "127.0.0.1", iface, 5*time.Second)
	if err != nil {
		_ = socket.Close()
		t.Fatalf("New() error = %v", err)
	}

	for session := 1; session <= 2; session++ {
		peer, err := processNetwork.API.NewPeerConnection(webrtc.Configuration{})
		if err != nil {
			t.Fatalf("session %d NewPeerConnection() error = %v", session, err)
		}
		if _, err := peer.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio); err != nil {
			_ = peer.Close()
			t.Fatalf("session %d add audio transceiver: %v", session, err)
		}
		offer, err := peer.CreateOffer(nil)
		if err != nil {
			_ = peer.Close()
			t.Fatalf("session %d CreateOffer() error = %v", session, err)
		}
		gathered := webrtc.GatheringCompletePromise(peer)
		if err := peer.SetLocalDescription(offer); err != nil {
			_ = peer.Close()
			t.Fatalf("session %d SetLocalDescription() error = %v", session, err)
		}
		<-gathered
		if !strings.Contains(peer.LocalDescription().SDP, fmt.Sprintf(" 127.0.0.1 %d typ host", address.Port)) {
			t.Fatalf("session %d offer does not advertise shared UDP port %d:\n%s", session, address.Port, peer.LocalDescription().SDP)
		}
		if err := peer.Close(); err != nil {
			t.Fatalf("session %d PeerConnection.Close() error = %v", session, err)
		}
	}

	if err := processNetwork.Close(); err != nil {
		t.Fatalf("Process.Close() error = %v", err)
	}
	if err := processNetwork.Close(); err != nil {
		t.Fatalf("second Process.Close() error = %v", err)
	}
	replacement, err := net.ListenUDP("udp4", address)
	if err != nil {
		t.Fatalf("shared UDP socket remained bound after shutdown: %v", err)
	}
	if err := replacement.Close(); err != nil {
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
