package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/pion/webrtc/v4"
)

// newProcessTestPeer は実processへOfferを送る受信専用のPion接続を作る。
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

// createProcessSession はICE収集済みOfferを実processへ送り、応答をPion接続へ適用する。
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
