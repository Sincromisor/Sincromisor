package rtc

import (
	"context"
	"log/slog"

	audiomedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

// outboundErrorSynthDecoder は合成音声の復号失敗をSession境界へ注入する。
type outboundErrorSynthDecoder struct{ err error }

func (d outboundErrorSynthDecoder) Decode(context.Context, protocol.SynthesizerResult) (synthdecode.DecodedSpeech, error) {
	return synthdecode.DecodedSpeech{}, d.err
}

// outboundPCMRunner は指定した標本数の無音PCMをffmpeg境界の結果として返す。
type outboundPCMRunner struct{ samples int }

func (r outboundPCMRunner) Run(
	context.Context,
	string,
	[]byte,
	int64,
	int64,
	...string,
) ([]byte, []byte, int, error) {
	return make([]byte, r.samples*2), nil, 0, nil
}

type outboundCapturedRecord struct {
	message string
	attrs   map[string]any
}

// outboundCaptureHandler は復号失敗ログの分類属性だけを試験用に保存する。
type outboundCaptureHandler struct{ records []outboundCapturedRecord }

func (h *outboundCaptureHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *outboundCaptureHandler) Handle(_ context.Context, record slog.Record) error {
	attrs := make(map[string]any, record.NumAttrs())
	record.Attrs(func(attr slog.Attr) bool {
		attrs[attr.Key] = attr.Value.Any()
		return true
	})
	h.records = append(h.records, outboundCapturedRecord{message: record.Message, attrs: attrs})
	return nil
}

func (h *outboundCaptureHandler) WithAttrs([]slog.Attr) slog.Handler { return h }

func (h *outboundCaptureHandler) WithGroup(string) slog.Handler { return h }

func equalOutboundAttrs(got, want map[string]any) bool {
	if len(got) != len(want) {
		return false
	}
	for key, wantValue := range want {
		if got[key] != wantValue {
			return false
		}
	}
	return true
}

// blockingSynthDecoder は復号完了と出力終了の順序を試験側から制御する。
type blockingSynthDecoder struct {
	entered chan struct{}
	release chan struct{}
}

func newBlockingSynthDecoder() *blockingSynthDecoder {
	return &blockingSynthDecoder{entered: make(chan struct{}), release: make(chan struct{})}
}

func (d *blockingSynthDecoder) Decode(
	context.Context,
	protocol.SynthesizerResult,
) (synthdecode.DecodedSpeech, error) {
	close(d.entered)
	<-d.release
	return synthdecode.DecodedSpeech{
		SpeechID: 7,
		PCM:      make([]int16, audiomedia.SampleRate/50),
	}, nil
}

// rtcDiscardTrack は出力標本を保持せず正常終了するRTCトラック境界である。
type rtcDiscardTrack struct{}

func (rtcDiscardTrack) WriteSample(audiomedia.Sample) error { return nil }
