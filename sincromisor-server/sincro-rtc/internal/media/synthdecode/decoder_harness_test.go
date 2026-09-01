package synthdecode

import (
	"context"
	"encoding/binary"
	"errors"
	"strings"
	"testing"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

func validResult(audioFormat string) protocol.SynthesizerResult {
	return protocol.SynthesizerResult{
		SpeechID: 42, Voice: []byte("encoded"), AudioFormat: audioFormat, SpeakingTime: 0.1,
	}
}

func newFakeDecoder(t *testing.T, runner *fakeRunner) *Decoder {
	t.Helper()
	decoder, err := NewDecoder("/test/ffmpeg", runner)
	if err != nil {
		t.Fatalf("NewDecoder() error = %v", err)
	}
	return decoder
}

func assertDecodeKind(t *testing.T, err error, want ErrorKind) {
	t.Helper()
	var decodeErr *DecodeError
	if !errors.As(err, &decodeErr) {
		t.Fatalf("error = %v, want *DecodeError", err)
	}
	if decodeErr.Kind != want {
		t.Fatalf("DecodeError.Kind = %q, want %q; error=%v", decodeErr.Kind, want, err)
	}
}

func assertZeroDecodedSpeech(t *testing.T, result DecodedSpeech) {
	t.Helper()
	if result.SpeechID != 0 || result.PCM != nil || result.Mora != nil {
		t.Fatalf("DecodedSpeech = %#v, want zero value on error", result)
	}
}

func pcmBytes(samples int) []byte {
	output := make([]byte, samples*2)
	for index := range samples {
		binary.LittleEndian.PutUint16(output[index*2:], uint16(int16(index%200-100)))
	}
	return output
}

func containsAdjacent(values []string, left string, right string) bool {
	return strings.Contains(strings.Join(values, "\x00"), left+"\x00"+right)
}

type fakeRunner struct {
	stdout         []byte
	stderr         []byte
	exitCode       int
	err            error
	waitForContext bool
	calls          int
	executable     string
	args           []string
}

func (r *fakeRunner) Run(
	ctx context.Context,
	executable string,
	_ []byte,
	_ int64,
	_ int64,
	args ...string,
) ([]byte, []byte, int, error) {
	r.calls++
	r.executable = executable
	r.args = append([]string(nil), args...)
	if r.waitForContext {
		<-ctx.Done()
		return nil, nil, -1, ctx.Err()
	}
	return r.stdout, r.stderr, r.exitCode, r.err
}
