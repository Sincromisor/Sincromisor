package synthdecode

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os/exec"
	"strings"
	"testing"
)

func TestProcessDiagnosticIsBoundedAndPrivate(t *testing.T) {
	for _, stage := range []string{"decode", "probe"} {
		runner := &fakeRunner{stderr: []byte("Invalid data found; Bearer artificial-private-token https://user:secret@host/?text=private\n" + strings.Repeat("private", 12000)), exitCode: 7, err: errors.New("private failure")}
		decoder := newFakeDecoder(t, runner)
		var err error
		if stage == "decode" {
			result, e := decoder.Decode(context.Background(), validResult("audio/wav"))
			err = e
			assertZeroDecodedSpeech(t, result)
		} else {
			err = decoder.ProbeVersion(context.Background())
		}
		var output bytes.Buffer
		slog.New(slog.NewJSONHandler(&output, nil)).Error("failed", DiagnosticAttrs(err)...)
		t.Log(output.String())
		var row map[string]any
		if e := json.Unmarshal(output.Bytes(), &row); e != nil {
			t.Fatal(e)
		}
		if row["stage"] != stage || row["exit_code"] != float64(7) || row["stderr_truncated"] != true || row["stderr_diagnostic"] != "invalid data found" {
			t.Fatalf("diagnostic = %s", output.Bytes())
		}
		if strings.Contains(output.String(), "private") || strings.Contains(output.String(), "secret") || runner.calls != 1 {
			t.Fatal("unsafe output or repeated execution")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := newFakeDecoder(t, &fakeRunner{waitForContext: true}).Decode(ctx, validResult("audio/wav"))
	var output bytes.Buffer
	slog.New(slog.NewJSONHandler(&output, nil)).Info("cancelled", DiagnosticAttrs(err)...)
	if !errors.Is(err, context.Canceled) || !strings.Contains(output.String(), `"outcome":"cancelled"`) {
		t.Fatalf("cancellation = %s, %v", output.Bytes(), err)
	}
}

func TestExecRunnerInvalidAudioDiagnostic(t *testing.T) {
	path, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("FFmpeg is not installed")
	}
	decoder, err := NewDecoder(path, ExecRunner{})
	if err != nil {
		t.Fatal(err)
	}
	input := validResult("audio/wav")
	input.Voice = []byte("artificial-private-token")
	result, err := decoder.Decode(context.Background(), input)
	assertZeroDecodedSpeech(t, result)
	assertDecodeKind(t, err, ErrorProcess)
	var output bytes.Buffer
	slog.New(slog.NewJSONHandler(&output, nil)).Error("failed", DiagnosticAttrs(err)...)
	if strings.Contains(output.String(), "artificial-private") || !strings.Contains(output.String(), `"stage":"decode"`) {
		t.Fatalf("diagnostic = %s", output.Bytes())
	}
	t.Log(output.String())
}
