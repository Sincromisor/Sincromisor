package rtc

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"

	inputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/input"
	outputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc/datachannel"
)

// SessionDependencies は session 作成前に検証する遅延 pipeline、入力観測、deadline の依存境界である。
//
// PipelineFactory は media readiness 成立後の Coordinator.Start まで network I/O を開始してはならない。
// InputObserver は process 内の全 Session が共有し、payload を保持せず drop decision を集計する。
// Clock は Answer 後と transport 後の有限 deadline を生成し、nil dependency は無効である。
type SessionDependencies struct {
	PipelineFactory pipeline.ClientSetFactory
	InputObserver   inputmedia.Observer
	Clock           Clock
}

// Session は1 PeerConnection、revision transaction、pipeline、codec、timer、session goroutineを所有する。
//
// Close は closing を同期的に一度だけ確定して直ちに返す。resource close と join は cleanup goroutine が
// 継続し、全 resource 終了後だけ closed、registry remove、Done channel closeへ進む。
type Session struct {
	id       string
	talkMode string
	pc       *webrtc.PeerConnection
	pipeline *pipeline.Coordinator
	// synthDecoderはprocess-wide immutable dependencyへの非所有参照である。Session cleanupは
	// processを保持しないDecoderをcloseせず、別Sessionの同一参照を継続利用可能に保つ。
	synthDecoder synthSpeechDecoder
	input        *inputmedia.Processor
	logger       *slog.Logger
	onClosed     func(string)
	lifecycle    *sessionLifecycle
	recorder     observability.Recorder

	ctx                context.Context
	cancel             context.CancelFunc
	wg                 sync.WaitGroup
	encoder            *outputmedia.Encoder
	output             *outputmedia.Processor
	dispatcher         *datachannel.Dispatcher
	outboundMu         sync.Mutex
	outboundGeneration uint64
	outboundTrack      *webrtc.TrackLocalStaticSample
	outboundSender     *webrtc.RTPSender
	done               chan struct{}
	closeStarted       time.Time
	closeMetricOnce    sync.Once
	closers            sessionResourceClosers
	revision           *revisionState
	// productionではnegotiateDescriptionへ固定する。test差し替えもremote適用済みboolを正しく返し、
	// partial apply後だけcloseするtransaction契約を維持しなければならない。
	negotiateUpdate func(context.Context, string) (webrtc.SessionDescription, bool, error)
	// productionではaddCandidateへ固定し、revision/dedupe/limit通過後だけ呼ぶPion適用境界である。
	candidateApplier func(webrtc.ICECandidateInit) error
}

// synthSpeechDecoderはprocess-wide decoderとdecode完了競合testを共有する非所有境界である。
type synthSpeechDecoder interface {
	Decode(context.Context, protocol.SynthesizerResult) (synthdecode.DecodedSpeech, error)
}

// sessionResourceClosers はSession cleanupが並行開始して完了を待つ所有resource境界である。
//
// productionではPeerConnection、codec、OutputProcessor、datachannel.Dispatcher、Coordinatorへ固定し、
// testではblocking closeを注入してCloseの非blocking返却、close-once、全join後公開を観測する。
type sessionResourceClosers struct {
	peer       func() error
	codec      func() error
	output     func() error
	dispatcher func() error
	pipeline   func() error
}
