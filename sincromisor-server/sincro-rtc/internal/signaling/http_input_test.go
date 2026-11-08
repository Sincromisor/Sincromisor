package signaling

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
)

func TestRequestBodyBoundary(t *testing.T) {
	base := validOfferBody("v=0\r\n")
	exact := base + strings.Repeat(" ", maxRequestBytes-len(base))
	over := exact + " "
	for _, test := range []struct {
		name       string
		body       string
		wantStatus int
	}{
		{name: "exact", body: exact, wantStatus: http.StatusOK},
		{name: "over", body: over, wantStatus: http.StatusRequestEntityTooLarge},
	} {
		t.Run(test.name, func(t *testing.T) {
			fake := &fakeSessions{answer: rtc.Answer{
				SDP: "answer", Type: "answer", SessionID: "01K1AF2Y0H0000000000000004", Revision: 1,
			}}
			response := performRequest(newTestServer(t, fake, "").Handler(), http.MethodPost, offerPath, test.body)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, test.wantStatus)
			}
		})
	}
}

func TestInitialOfferRejectsNullIdentityBeforeCreation(t *testing.T) {
	for _, fields := range []string{
		`"offer_request_id":null`,
		`"offer_revision":null`,
		`"offer_request_id":null,"offer_revision":null`,
	} {
		t.Run(fields, func(t *testing.T) {
			fake := &fakeSessions{}
			body := `{"sdp":"v=0\r\n","type":"offer","talk_mode":"chat",` + fields + `}`
			response := performRequest(newTestServer(t, fake, "").Handler(), http.MethodPost, offerPath, body)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", response.Code)
			}
			if fake.lastOffer.OfferRequestID != "" {
				t.Fatal("invalid identity reached session creation")
			}
		})
	}
}
