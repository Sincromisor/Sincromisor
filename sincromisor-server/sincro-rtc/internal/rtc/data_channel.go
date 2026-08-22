package rtc

import (
	"context"
	"errors"
	"fmt"
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

type dataChannelWriter interface {
	SendText(string) error
	BufferedAmount() uint64
	SetBufferedAmountLowThreshold(uint64)
	OnBufferedAmountLow(func())
	OnClose(func())
	ReadyState() webrtc.DataChannelState
}

// DataChannelStats はpayloadを保持しないdispatcherのsession累積観測値である。
type DataChannelStats struct {
	TextRejected     uint64
	TelopDropped     uint64
	TelopSendDropped uint64
	GenerationPurged uint64
	ActiveWorkers    int64
	TextQueued       int
	TelopQueued      int
	Closed           bool
}

// DataChannelDispatcher はtext/telop queue、Pion bufferedAmount backpressure、送信workerを所有する。
//
// textは64件FIFOでoverflow/send failureをsession errorへ返す。telopは128件FIFOでoverflow時に
// 最古だけをdropし、単発送信失敗でもsessionを継続する。Closeはworkerをcancelしてjoinするが、
// DataChannel object自体はPeerConnection所有なのでcloseしない。
type DataChannelDispatcher struct {
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
	textChannel       dataChannelWriter
	telopChannel      dataChannelWriter
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

// DataChannelDispatcherOptions connects payload-free metrics and the owning
// Session panic boundary. RecoverPanic must be safe after Session closing.
type DataChannelDispatcherOptions struct {
	// Recorder receives payload-free queue and send-error events.
	Recorder observability.Recorder
	// RecoverPanic transfers worker/callback panic ownership to the Session.
	RecoverPanic func(stage string)
}

// NewDataChannelDispatcher はidle dispatcherを作り、session context cancellationをworkerへ伝播する。
//
// onErrorはreliable text failure、backpressure timeout、channel closeをSession.Closeへ集約する。
func NewDataChannelDispatcher(
	parent context.Context,
	logger *slog.Logger,
	onError func(error),
	options ...DataChannelDispatcherOptions,
) (*DataChannelDispatcher, error) {
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
	return &DataChannelDispatcher{
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
func (d *DataChannelDispatcher) AttachText(channel dataChannelWriter) error {
	return d.attach(channel, true)
}

// AttachTelop はidentity検証済みでopenしたunreliable telop_chを1回だけworkerへ接続する。
func (d *DataChannelDispatcher) AttachTelop(channel dataChannelWriter) error {
	return d.attach(channel, false)
}

func (d *DataChannelDispatcher) attach(channel dataChannelWriter, text bool) error {
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

// Purge はgeneration barrierより前に取り込んだtext/telop eventを一括破棄する。
func (d *DataChannelDispatcher) Purge() {
	d.sendMu.Lock()
	defer d.sendMu.Unlock()
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return
	}
	d.purgeLocked()
	d.mu.Unlock()
}

func (d *DataChannelDispatcher) purgeLocked() {
	count := len(d.textQueue) + len(d.telopQueue)
	textCount, telopCount := len(d.textQueue), len(d.telopQueue)
	d.generationEpoch++
	close(d.generationChanged)
	d.generationChanged = make(chan struct{})
	d.textQueue = nil
	d.telopQueue = nil
	if textCount > 0 {
		d.recorder.QueueDepthDelta("text", -float64(textCount))
	}
	if telopCount > 0 {
		d.recorder.QueueDepthDelta("telop", -float64(telopCount))
	}
	if count > 0 {
		total := d.generationPurged.Add(uint64(count))
		d.logger.Info("purged data channel events",
			"stage", "data_channel_queue", "reason", "generation", "count", total,
		)
	}
}

// Stats はdispatcherのpayload非保持counter snapshotを返す。
func (d *DataChannelDispatcher) Stats() DataChannelStats {
	d.mu.Lock()
	textQueued, telopQueued, closed := len(d.textQueue), len(d.telopQueue), d.closed
	d.mu.Unlock()
	return DataChannelStats{
		TextRejected:     d.textRejected.Load(),
		TelopDropped:     d.telopDropped.Load(),
		TelopSendDropped: d.telopSendDropped.Load(),
		GenerationPurged: d.generationPurged.Load(),
		ActiveWorkers:    d.activeWorkers.Load(),
		TextQueued:       textQueued,
		TelopQueued:      telopQueued,
		Closed:           closed,
	}
}

// Close はdispatcher workerをcancelし、進行中のbackpressure waitを含めて一度だけjoinする。
func (d *DataChannelDispatcher) Close() error {
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

func (d *DataChannelDispatcher) run(channel dataChannelWriter, text bool, wake <-chan struct{}) {
	d.activeWorkers.Add(1)
	defer func() {
		if recover() != nil {
			d.recoverPanic("data_channel_worker")
		}
		d.activeWorkers.Add(-1)
		d.wg.Done()
	}()
	for {
		payload, epoch, generationChanged, ok := d.pop(text)
		if !ok {
			select {
			case <-d.ctx.Done():
				return
			case <-wake:
				continue
			}
		}
		if err := d.waitWritable(channel, generationChanged); err != nil {
			if errors.Is(err, errStaleDataChannelEvent) {
				continue
			}
			d.onError(err)
			return
		}
		sendErr, stale := func() (error, bool) {
			d.sendMu.Lock()
			defer d.sendMu.Unlock()
			d.mu.Lock()
			stale := epoch != d.generationEpoch
			d.mu.Unlock()
			if stale {
				return nil, true
			}
			return channel.SendText(string(payload)), false
		}()
		if stale {
			continue
		}
		if sendErr != nil {
			if text {
				d.recorder.DataChannelError("text")
				d.onError(fmt.Errorf("send reliable text data channel payload: %w", sendErr))
				return
			}
			d.recorder.DataChannelError("telop")
			count := d.telopSendDropped.Add(1)
			d.logger.Warn("dropped data channel event",
				"stage", "telop", "reason", "data_channel_error", "count", count,
			)
		}
	}
}

func (d *DataChannelDispatcher) pop(text bool) ([]byte, uint64, <-chan struct{}, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	queue := &d.telopQueue
	if text {
		queue = &d.textQueue
	}
	if len(*queue) == 0 {
		return nil, 0, nil, false
	}
	payload := (*queue)[0]
	copy(*queue, (*queue)[1:])
	*queue = (*queue)[:len(*queue)-1]
	queueName := "telop"
	if text {
		queueName = "text"
	}
	d.recorder.QueueDepthDelta(queueName, -1)
	return payload, d.generationEpoch, d.generationChanged, true
}

// waitWritableは1 MiB high-waterで送信を止め、256 KiB low-water eventまで最大5秒待つ。
//
// callbackは通知をcoalesceするだけで、復帰判定はBufferedAmountを再読してspurious/古いeventを拒否する。
func (d *DataChannelDispatcher) waitWritable(
	channel dataChannelWriter,
	generationChanged <-chan struct{},
) error {
	if channel.ReadyState() != webrtc.DataChannelStateOpen {
		return errors.New("data channel is closed")
	}
	if channel.BufferedAmount() < bufferedAmountHigh {
		return nil
	}
	timer := time.NewTimer(d.backpressureTimeout)
	defer timer.Stop()
	low := make(chan struct{}, 1)
	channel.OnBufferedAmountLow(d.safeCallback("data_channel_backpressure", func() { signal(low) }))
	for {
		if channel.ReadyState() != webrtc.DataChannelStateOpen {
			return errors.New("data channel closed during backpressure")
		}
		if channel.BufferedAmount() <= bufferedAmountLow {
			return nil
		}
		select {
		case <-d.ctx.Done():
			return d.ctx.Err()
		case <-generationChanged:
			return errStaleDataChannelEvent
		case <-timer.C:
			return errors.New("data channel backpressure timeout")
		case <-low:
		}
	}
}

func (d *DataChannelDispatcher) safeCallback(stage string, callback func()) func() {
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
