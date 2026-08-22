//go:build gate3

package pipelinecontract

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

func TestPublicWebSocketRejectsServiceOrderViolation(t *testing.T) {
	set := newContractSet(t)
	defer closeContractSet(t, set)
	sessionID, speechID, sequenceID := produceExtraction(t, set)
	conn := dialContract(t, set, discovery.ServiceProcessor, "/api/v1/TextProcessor/sincro")
	defer conn.CloseNow()
	writeFixture(t, conn, fixturePath(t, "text_processor_request.msgpack"), func(value map[string]any) {
		value["session_id"] = sessionID
		value["sequence_id"] = sequenceID
		request := value["request_message"].(map[string]any)
		request["speech_id"] = speechID
	})
	if err := waitVerifyError(t, set, ErrProtocol); !errors.Is(err, ErrProtocol) {
		t.Fatalf("Verify() error = %v, want ErrProtocol", err)
	}
}

func TestPublicWebSocketRejectsIdentityMismatch(t *testing.T) {
	set := newContractSet(t)
	defer closeContractSet(t, set)
	sessionID, speechID, sequenceID := produceExtraction(t, set)
	conn := dialContract(t, set, discovery.ServiceRecognizer, "/api/v1/SpeechRecognizer/recognize")
	defer conn.CloseNow()
	writeFixture(t, conn, fixturePath(t, "extractor_result.msgpack"), func(value map[string]any) {
		value["session_id"] = sessionID
		value["speech_id"] = speechID + 1
		value["sequence_id"] = sequenceID
	})
	if err := waitVerifyError(t, set, ErrIdentity); !errors.Is(err, ErrIdentity) {
		t.Fatalf("Verify() error = %v, want ErrIdentity", err)
	}
}

func produceExtraction(t *testing.T, set *Set) (string, int64, int64) {
	t.Helper()
	conn := dialContract(t, set, discovery.ServiceExtractor, "/api/v1/SpeechExtractor/extract")
	defer conn.CloseNow()
	sessionID := "gate3-wire-negative-session"
	writeFixture(t, conn, fixturePath(t, "extractor_initialize.msgpack"), func(value map[string]any) {
		value["session_id"] = sessionID
	})
	writeBinary(t, conn, []byte{0, 4})
	payload := readBinary(t, conn)
	value, err := decodeMap(payload)
	if err != nil {
		t.Fatal(err)
	}
	speechID, _ := int64Field(value, "speech_id")
	sequenceID, _ := int64Field(value, "sequence_id")
	return sessionID, speechID, sequenceID
}

func dialContract(
	t *testing.T,
	set *Set,
	service discovery.Service,
	path string,
) *websocket.Conn {
	t.Helper()
	endpoint := set.Addresses()[service]
	target := "ws://" + net.JoinHostPort(endpoint.Host, fmt.Sprint(endpoint.Port)) + path
	conn, _, err := websocket.Dial(context.Background(), target, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", service, err)
	}
	return conn
}

func fixturePath(t *testing.T, name string) string {
	t.Helper()
	path, err := filepath.Abs(filepath.Join("..", "..", "pipeline", "protocol", "testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return path
}

func writeFixture(
	t *testing.T,
	conn *websocket.Conn,
	path string,
	patch func(map[string]any),
) {
	t.Helper()
	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if patch != nil {
		var value map[string]any
		if err := msgpack.Unmarshal(payload, &value); err != nil {
			t.Fatal(err)
		}
		patch(value)
		payload, err = msgpack.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
	}
	writeBinary(t, conn, payload)
}

func writeBinary(t *testing.T, conn *websocket.Conn, payload []byte) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := conn.Write(ctx, websocket.MessageBinary, payload); err != nil {
		t.Fatal(err)
	}
}

func readBinary(t *testing.T, conn *websocket.Conn) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	messageType, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if messageType != websocket.MessageBinary {
		t.Fatalf("message type = %v, want binary", messageType)
	}
	return payload
}

func waitVerifyError(t *testing.T, set *Set, target error) error {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		err := set.Verify()
		if errors.Is(err, target) {
			return err
		}
		time.Sleep(time.Millisecond)
	}
	return set.Verify()
}
