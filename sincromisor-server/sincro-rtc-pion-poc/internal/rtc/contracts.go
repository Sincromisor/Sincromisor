package rtc

// Offer はFrontendのinitial OfferをPion session作成境界へ渡す。
//
// OfferRequestIDはcanonical UUID、Typeはoffer、TalkModeはchat/sincroでなければCreateが拒否する。
// 成功時は新しいPeerConnectionとpipelineを所有するSessionを作り、OnClosedは全resource join後に呼ぶ。
type Offer struct {
	SDP            string
	Type           string
	TalkMode       string
	OfferRequestID string
	// OnClosedはSessionの全resource join後にserver発行IDを通知し、cached Answerを有限tombstoneへ変換する。
	OnClosed func(string)
}

// Answer はcandidate収集済みSDP、server発行ULID、accepted Offer revisionをHTTP境界へ返す。
type Answer struct {
	SDP       string `json:"sdp"`
	Type      string `json:"type"`
	SessionID string `json:"session_id"`
	Revision  uint64 `json:"offer_revision"`
}

// UpdateOffer は既存Sessionへ適用するstrictly-next ICE restart Offer identityを表す。
//
// initialと同じOfferRequestID、保存済みTalkMode、current+1のRevisionを要求する。同revision retryは
// 同一SDPだけがcache済みAnswerを得て、identity競合はPeerConnectionを変更せず拒否される。
type UpdateOffer struct {
	SDP            string
	Type           string
	TalkMode       string
	SessionID      string
	OfferRequestID string
	Revision       uint64
}

// Candidate はFrontendのTrickle ICE candidateをwire bytesのままrevision transactionへ渡す。
//
// *Candidate自体のnilは`candidate: null`のend-of-candidatesである。optional pointerのnilは
// missing/nullを同一視し、dedupe前に文字列をtrimまたはcase変換しない。
type Candidate struct {
	Candidate        string  `json:"candidate"`
	SDPMid           *string `json:"sdpMid,omitempty"`
	SDPMLineIndex    *uint16 `json:"sdpMLineIndex,omitempty"`
	UsernameFragment *string `json:"usernameFragment,omitempty"`
}
