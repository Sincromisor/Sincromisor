package signaling

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

// offerRequest はinitial/updateの識別fieldについてJSON presenceとtypeをdecode後まで保持する。
// RawMessageにより、omitemptyのGo zero valueへ潰れるnull/空文字とfield省略を境界で区別する。
type offerRequest struct {
	SDP               string          `json:"sdp"`
	Type              string          `json:"type"`
	TalkMode          string          `json:"talk_mode"`
	SessionID         json.RawMessage `json:"session_id,omitempty"`
	OfferRequestID    *string         `json:"offer_request_id"`
	OfferRevision     *uint64         `json:"offer_revision"`
	PreviousSessionID json.RawMessage `json:"previous_session_id,omitempty"`
}

// decodeJSON は1 MiBを超えるbody、未知field、複数JSON valueをdomain処理より先に拒否する。
// MaxBytesErrorは呼び出し側が413へ分離できるsentinelを保ち、その他の構文・型エラーは400へ委ねる。
func decodeJSON(writer http.ResponseWriter, request *http.Request, target any) error {
	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return fmt.Errorf("%w: %v", errRequestBodyTooLarge, err)
		}
		return fmt.Errorf("decode json: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); isMaxBytesError(err) {
		return fmt.Errorf("%w: %v", errRequestBodyTooLarge, err)
	} else if !errors.Is(err, io.EOF) {
		return errors.New("json body must contain one value")
	}
	return nil
}

func isMaxBytesError(err error) bool {
	var maxBytesErr *http.MaxBytesError
	return errors.As(err, &maxBytesErr)
}

func validUUID(value string) bool {
	parsed, err := uuid.Parse(value)
	return err == nil && strings.EqualFold(parsed.String(), value)
}
