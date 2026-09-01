package rtc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/pion/webrtc/v4"

	inputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/input"
	outputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/output"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc/datachannel"
)

// newSession は検証済みdependencyからPeerConnection、input.Processor、codec、lifecycle ownerを組み立てる。
//
// talk modeとdependencyをresource作成前に拒否する。成功後の所有resourceはSession.Closeだけが破棄し、
// setup途中の失敗は作成済みresourceを同期的に巻き戻してregistryへ公開しない。SynthDecoderは
// process-wide非所有参照なのでcloserへ加えず、Session終了後も他Sessionが同じpointerを利用できる。
func newSession(
	id string,
	talkMode string,
	configuration webrtc.Configuration,
	gatherTimeout time.Duration,
	coordinator *pipeline.Coordinator,
	synthDecoder *synthdecode.Decoder,
	inputObserver inputmedia.Observer,
	clock Clock,
	logger *slog.Logger,
	onClosed func(string),
	api *webrtc.API,
	recorders ...observability.Recorder,
) (*Session, error) {
	if id == "" || (talkMode != "chat" && talkMode != "sincro") {
		return nil, errors.New("rtc session identity or talk mode is invalid")
	}
	if coordinator == nil || synthDecoder == nil || inputObserver == nil || clock == nil || logger == nil || onClosed == nil {
		return nil, errors.New("rtc session dependencies must not be nil")
	}
	recorder := observability.Discard()
	if len(recorders) > 0 && recorders[0] != nil {
		recorder = recorders[0]
	}
	input, err := inputmedia.New(inputObserver)
	if err != nil {
		return nil, err
	}
	lifecycle, err := newSessionLifecycle(clock)
	if err != nil {
		return nil, err
	}
	pc, err := newPeerConnection(configuration, gatherTimeout, api)
	if err != nil {
		return nil, fmt.Errorf("create peer connection: %w", err)
	}
	encoder, err := outputmedia.NewEncoder()
	if err != nil {
		_ = pc.Close()
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	session := &Session{
		id: id, talkMode: talkMode, pc: pc, pipeline: coordinator, synthDecoder: synthDecoder, input: input, logger: logger,
		onClosed: onClosed, lifecycle: lifecycle, ctx: ctx, cancel: cancel,
		encoder: encoder, done: make(chan struct{}), recorder: recorder,
	}
	if err := coordinator.ConfigureRuntime(recorder, func(stage string) {
		logger.Error("pipeline worker panic", "session_id", id, "stage", stage, "reason", "panic")
		_ = session.Close("panic")
	}); err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		cancel()
		return nil, err
	}
	dispatcher, err := datachannel.New(ctx, logger, func(err error) {
		logger.Error("data channel dispatcher stopped", "session_id", id, "reason", "data_channel_error", "error", err)
		_ = session.Close("data_channel_error")
	}, datachannel.Options{
		Recorder: recorder,
		RecoverPanic: func(stage string) {
			logger.Error("data channel callback panic", "session_id", id, "stage", stage, "reason", "panic")
			_ = session.Close("panic")
		},
	})
	if err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		cancel()
		return nil, err
	}
	session.dispatcher = dispatcher
	session.negotiateUpdate = session.negotiateDescription
	session.candidateApplier = session.addCandidate
	if err := session.installOutboundTrack(); err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		_ = dispatcher.Close()
		cancel()
		return nil, err
	}
	output, err := outputmedia.New(
		encoder,
		pionSampleWriter{track: session.outboundTrack},
		dispatcher.EnqueueTelop,
		logger,
		recorder,
	)
	if err != nil {
		_ = pc.Close()
		_ = encoder.Close()
		_ = dispatcher.Close()
		cancel()
		return nil, err
	}
	session.output = output
	session.closers = sessionResourceClosers{
		peer:       pc.Close,
		codec:      encoder.Close,
		output:     output.Close,
		dispatcher: dispatcher.Close,
		pipeline:   coordinator.Close,
	}
	session.installCallbacks()
	logger.Info("rtc session created", "session_id", id)
	return session, nil
}

// newPeerConnection はHTTP Answer生成deadlineをPion内部のSTUN transaction上限へ伝播する。
//
// request contextだけを先に返すと、Pionの既定STUN gatherが背後で継続し、Closeとregistry removeが
// 最大数秒遅れる。process共有APIがある場合はstartup済みのUDP mux設定を必ず再利用し、local test用
// APIがない場合だけ正数durationを新しいSettingEngineへ設定する。
func newPeerConnection(
	configuration webrtc.Configuration,
	gatherTimeout time.Duration,
	api *webrtc.API,
) (*webrtc.PeerConnection, error) {
	if api != nil {
		return api.NewPeerConnection(configuration)
	}
	if gatherTimeout <= 0 {
		return webrtc.NewPeerConnection(configuration)
	}
	settings := webrtc.SettingEngine{}
	settings.SetSTUNGatherTimeout(gatherTimeout)
	localAPI := webrtc.NewAPI(webrtc.WithSettingEngine(settings))
	return localAPI.NewPeerConnection(configuration)
}
