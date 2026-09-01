package signaling

import "net/http"

type iceServerResponse struct {
	URLs string `json:"urls"`
}

type configResponse struct {
	OfferURL     string              `json:"offerURL"`
	CandidateURL string              `json:"candidateURL"`
	ICEServers   []iceServerResponse `json:"iceServers"`
}

func (s *Server) handleConfig(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writeError(writer, http.StatusMethodNotAllowed, "Method not allowed.")
		return
	}
	writeJSON(writer, http.StatusOK, configResponse{
		OfferURL:     offerPath,
		CandidateURL: candidatePath,
		ICEServers:   s.iceServers,
	})
}
