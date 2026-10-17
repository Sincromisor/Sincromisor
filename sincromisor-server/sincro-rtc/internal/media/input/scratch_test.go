package input

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

// 固定Opusのmono/stereo両方を使い、実エンコーダーの差を測定へ混ぜない。
func scratchPackets(t testing.TB) [][]byte {
	t.Helper()
	data, err := os.ReadFile("testdata/opus_to_s16le.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Packets [][]byte `json:"packets"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	var packets [][]byte
	for _, test := range cases {
		packets = append(packets, test.Packets...)
	}
	if len(packets) == 0 {
		t.Fatal("no fixed packets")
	}
	return packets
}

func TestSubmittedFramesSurviveLaterDecodes(t *testing.T) {
	stream, err := newInputStream(1, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	var held, snapshots [][]byte
	submit := func(frame []byte) error {
		held = append(held, frame)
		snapshots = append(snapshots, bytes.Clone(frame))
		return nil
	}
	for range 3 {
		for _, payload := range scratchPackets(t) {
			if err := stream.decode(payload, &recordingInputObserver{}, submit); err != nil {
				t.Fatal(err)
			}
		}
	}
	if len(held) < 2 {
		t.Fatalf("frames = %d, want at least 2", len(held))
	}
	for i := range held {
		if !bytes.Equal(held[i], snapshots[i]) {
			t.Fatalf("frame %d overwritten by later packet", i)
		}
	}
}

func BenchmarkInputDecodeScratch(b *testing.B) {
	packets := scratchPackets(b)
	stream, err := newInputStream(1, 0, 0)
	if err != nil {
		b.Fatal(err)
	}
	observer := &recordingInputObserver{}
	submit := func([]byte) error { return nil }
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := stream.decode(packets[i%len(packets)], observer, submit); err != nil {
			b.Fatal(err)
		}
	}
}
