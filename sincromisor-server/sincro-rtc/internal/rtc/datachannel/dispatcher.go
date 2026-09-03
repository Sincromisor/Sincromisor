package datachannel

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pion/webrtc/v4"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
)

const (
	textChannelLabel  = "text_ch"
	telopChannelLabel = "telop_ch"

	textQueueCapacity       = 64
	telopQueueCapacity      = 128
	dataChannelPayloadLimit = 64 * 1024
	bufferedAmountHigh      = 1024 * 1024
	bufferedAmountLow       = 256 * 1024
	bufferedAmountTimeout   = 5 * time.Second
)

var (
	// ErrTextQueueFull はreliable text queueが満杯でincomingを保持できないことを表す。
	ErrTextQueueFull = errors.New("text data channel queue is full")
	// ErrDataChannelPayloadTooLarge はUTF-8 JSON payloadが64 KiBを超えたことを表す。
	ErrDataChannelPayloadTooLarge = errors.New("data channel payload exceeds 64 KiB")
	// ErrDataChannelDispatcherClosed はclose開始後のattach/enqueueを拒否したことを表す。
	ErrDataChannelDispatcherClosed = errors.New("data channel dispatcher is closed")
	errStaleDataChannelEvent       = errors.New("data channel event belongs to an old generation")
)

type channelWriter interface {
	SendText(string) error
	BufferedAmount() uint64
	SetBufferedAmountLowThreshold(uint64)
	OnBufferedAmountLow(func())
	OnClose(func())
	ReadyState() webrtc.DataChannelState
}

// Stats はペイロードを保持しない送信処理担当のセッション累積観測値である。
type Stats struct {
	// TextRejected はtextキュー満杯で拒否した累積件数である。
	TextRejected uint64
	// TelopDropped はtelopキュー満杯で破棄した最古イベントの累積件数である。
	TelopDropped uint64
	// TelopSendDropped は信頼性なしチャネルの送信失敗で破棄した累積件数である。
	TelopSendDropped uint64
	// GenerationPurged は世代更新によって送信前に破棄した累積件数である。
	GenerationPurged uint64
	// ActiveWorkers は現在動作中の送信処理担当数である。
	ActiveWorkers int64
	// TextQueued は現在のtextキュー件数である。
	TextQueued int
	// TelopQueued は現在のtelopキュー件数である。
	TelopQueued int
	// Closed はClose開始後で新しい接続と追加を拒否することを表す。
	Closed bool
}

// Dispatcher はtext/telopキュー、PionのbufferedAmountによる送信抑制、送信処理担当を所有する。
//
// textは64件FIFOでoverflow/send failureをsession errorへ返す。telopは128件FIFOでoverflow時に
// 最古だけをdropし、単発送信失敗でもsessionを継続する。Closeはworkerをcancelしてjoinするが、
// DataChannel object自体はPeerConnection所有なのでcloseしない。
type Dispatcher struct {
	ctx                 context.Context
	cancel              context.CancelFunc
	logger              *slog.Logger
	onError             func(error)
	backpressureTimeout time.Duration

	mu                sync.Mutex
	sendMu            sync.Mutex
	generationEpoch   uint64
	generationChanged chan struct{}
	closed            bool
	textQueue         [][]byte
	telopQueue        [][]byte
	textWake          chan struct{}
	telopWake         chan struct{}
	textChannel       channelWriter
	telopChannel      channelWriter
	wg                sync.WaitGroup
	closeOnce         sync.Once

	textRejected     atomic.Uint64
	telopDropped     atomic.Uint64
	telopSendDropped atomic.Uint64
	generationPurged atomic.Uint64
	activeWorkers    atomic.Int64
	recorder         observability.Recorder
	recoverPanic     func(stage string)
}

// Options はペイロードを保持しない観測と、所有セッションのpanic境界を接続する。
type Options struct {
	// Recorder はキューと送信失敗だけを受け取り、ペイロードを保持しない。
	Recorder observability.Recorder
	// RecoverPanic は処理担当とコールバックのpanicを所有セッションへ渡す。
	RecoverPanic func(stage string)
}

// New は待機状態のDispatcherを作り、セッションのcontext取消を送信処理担当へ伝播する。
//
// onErrorはreliable textの失敗、送信抑制の時間切れ、チャネル切断をSession.Closeへ集約する。
func New(
	parent context.Context,
	logger *slog.Logger,
	onError func(error),
	options ...Options,
) (*Dispatcher, error) {
	if parent == nil || logger == nil || onError == nil {
		return nil, errors.New("data channel dispatcher dependencies must not be nil")
	}
	ctx, cancel := context.WithCancel(parent)
	recorder := observability.Discard()
	recoverPanic := func(string) {}
	if len(options) > 0 {
		if options[0].Recorder != nil {
			recorder = options[0].Recorder
		}
		if options[0].RecoverPanic != nil {
			recoverPanic = options[0].RecoverPanic
		}
	}
	return &Dispatcher{
		ctx: ctx, cancel: cancel, logger: logger, onError: onError,
		backpressureTimeout: bufferedAmountTimeout,
		textWake:            make(chan struct{}, 1),
		telopWake:           make(chan struct{}, 1),
		generationChanged:   make(chan struct{}),
		recorder:            recorder,
		recoverPanic:        recoverPanic,
	}, nil
}

// AttachText はidentity検証済みでopenしたreliable text_chを1回だけworkerへ接続する。
func (d *Dispatcher) AttachText(channel channelWriter) error {
	return d.attach(channel, true)
}

// AttachTelop はidentity検証済みでopenしたunreliable telop_chを1回だけworkerへ接続する。
func (d *Dispatcher) AttachTelop(channel channelWriter) error {
	return d.attach(channel, false)
}

func (d *Dispatcher) attach(channel channelWriter, text bool) error {
	if channel == nil || channel.ReadyState() != webrtc.DataChannelStateOpen {
		return errors.New("data channel is not open")
	}
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return ErrDataChannelDispatcherClosed
	}
	target := &d.telopChannel
	wake := d.telopWake
	if text {
		target = &d.textChannel
		wake = d.textWake
	}
	if *target != nil {
		d.mu.Unlock()
		return errors.New("data channel dispatcher already attached")
	}
	*target = channel
	channel.SetBufferedAmountLowThreshold(bufferedAmountLow)
	channel.OnBufferedAmountLow(d.safeCallback("data_channel_buffered_low", func() { signal(wake) }))
	channel.OnClose(d.safeCallback("data_channel_close", func() {
		select {
		case <-d.ctx.Done():
		default:
			d.onError(errors.New("data channel closed"))
		}
	}))
	d.wg.Add(1)
	d.mu.Unlock()
	go d.run(channel, text, wake)
	signal(wake)
	return nil
}

// Close は送信処理担当を取り消し、進行中の送信抑制待ちを含めて一度だけ待ち合わせる。
func (d *Dispatcher) Close() error {
	d.closeOnce.Do(func() {
		// attachの開始権とWaitGroup予約は同じmutexで直列化する。closed確定後は
		// 新しいAdd/worker開始がないため、このunlock後のWaitはAddと競合しない。
		d.mu.Lock()
		d.closed = true
		d.cancel()
		d.mu.Unlock()
		signal(d.textWake)
		signal(d.telopWake)
		d.wg.Wait()
		d.sendMu.Lock()
		d.mu.Lock()
		textCount, telopCount := len(d.textQueue), len(d.telopQueue)
		d.textQueue = nil
		d.telopQueue = nil
		d.mu.Unlock()
		d.sendMu.Unlock()
		if textCount > 0 {
			d.recorder.QueueDepthDelta("text", -float64(textCount))
		}
		if telopCount > 0 {
			d.recorder.QueueDepthDelta("telop", -float64(telopCount))
		}
	})
	return nil
}

func (d *Dispatcher) safeCallback(stage string, callback func()) func() {
	return func() {
		defer func() {
			if recover() != nil {
				d.recoverPanic(stage)
			}
		}()
		callback()
	}
}

func signal(target chan<- struct{}) {
	select {
	case target <- struct{}{}:
	default:
	}
}
