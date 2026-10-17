package rtc

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	medialog "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media"
	"github.com/pion/interceptor"
	"github.com/pion/rtp"
)

func TestMediaFailureJSONKeepsOnlyOperationTypeAndKnownIDs(t *testing.T) {
	speechID := int64(9)
	for _, operation := range []string{"read_rtp", "decode_opus", "submit_pcm", "encode_opus", "write_rtp", "read_rtcp"} {
		var logs bytes.Buffer
		s := &Session{id: "media-session", logger: slog.New(slog.NewJSONHandler(&logs, nil))}
		failure := &medialog.OperationError{Operation: operation, Err: errors.New("secret-audio-sdp-address"), SpeechID: &speechID}
		s.logger.Error("media stopped", s.mediaFailureAttrs("unknown", failure)...)
		var event map[string]any
		if err := json.Unmarshal(logs.Bytes(), &event); err != nil {
			t.Fatal(err)
		}
		if event["session_id"] != s.id || event["operation"] != operation || event["speech_id"] != float64(9) || event["exception_type"] != "*errors.errorString" || event["reason"] != "failed" {
			t.Fatal(event)
		}
		if strings.Contains(logs.String(), "secret-") {
			t.Fatal(logs.String())
		}
	}
}

func TestMediaReadersLogActualOperationAndKeepNormalEOF(t *testing.T) {
	for _, operation := range []string{"read_rtp", "decode_opus", "read_rtcp", "normal"} {
		t.Run(operation, func(t *testing.T) {
			var logs bytes.Buffer
			_, s := newManagedLifecycleSession(t, SystemClock{}, blockingPipelineFactory{})
			s.logger = slog.New(slog.NewJSONHandler(&logs, nil))
			s.wg.Add(1)
			switch operation {
			case "read_rtcp":
				s.startRTCPDrain(failingRTCPReader{})
			case "read_rtp":
				s.startInbound(failingRTPReader{})
			case "decode_opus":
				s.startInbound(&singlePacketReader{packet: &rtp.Packet{Payload: []byte{0xff}}})
			default:
				s.startInbound(&singlePacketReader{})
			}
			waitSessionDone(t, s)
			if operation == "normal" {
				if s.lifecycle.closeReason != "normal" || strings.Contains(logs.String(), "processing stopped") {
					t.Fatal(logs.String())
				}
			} else if !strings.Contains(logs.String(), `"operation":"`+operation+`"`) || strings.Contains(logs.String(), "secret-") {
				t.Fatal(logs.String())
			}
		})
	}
}

func TestMediaCancellationPreservesErrorChain(t *testing.T) {
	for _, cause := range []error{context.Canceled, io.EOF} {
		err := &medialog.OperationError{Operation: "read_rtp", Err: cause}
		if !errors.Is(err, cause) {
			t.Fatal("lost normal termination")
		}
	}
}

type failingRTCPReader struct{}

func (failingRTCPReader) Read([]byte) (int, interceptor.Attributes, error) {
	return 0, nil, errors.New("secret-rtcp")
}

type failingRTPReader struct{}

func (failingRTPReader) ReadRTP() (*rtp.Packet, interceptor.Attributes, error) {
	return nil, nil, errors.New("secret-rtp")
}
