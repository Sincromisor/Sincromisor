// Command pion-poc は build 済み Frontend と Pion signaling/media PoC を同一 origin で起動する。
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/config"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline"
	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/signaling"
)

const (
	shutdownCleanupTimeout  = 5 * time.Second
	shutdownAdmissionWindow = 1 * time.Second
	shutdownHTTPTimeout     = 1 * time.Second
	// discoveryRequestTimeout は local Consul 障害が readiness 後のsession cleanupを長時間妨げない上限である。
	discoveryRequestTimeout = 2 * time.Second
	localConsulURL          = "http://127.0.0.1:8500"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "pion-poc: %v\n", err)
		os.Exit(1)
	}
}

// run は config load、HTTP serve、signal shutdown を 1 つの process lifecycle として調停する。
//
// SIGINT / SIGTERMではdrainingを先に公開し、1秒間initial Offerを503で拒否できるlistenerを維持する。
// その間にprocess context、Offer owner、全sessionを共通期限で収束させ、最後にHTTPを停止する。
// listener起動失敗を含むshutdown failureはmainへ返し、下位packageでは終了しない。
func run(args []string) error {
	return runWithBoundaries(args, synthdecode.ExecRunner{}, serve)
}

// serveBoundaryは検証済みstartup resourceからHTTP listener lifecycleへ移る最後の境界である。
type serveBoundary func(
	config.Config,
	*rtc.Manager,
	*signaling.OfferRegistry,
	context.CancelFunc,
	*slog.Logger,
) error

// runWithBoundariesはstartup依存の検証完了後だけHTTP listener境界へ到達する。
//
// FFmpeg probeをpipeline/Manager/Offer registryより先に完了させ、失敗時はserveBoundaryを呼ばない。
// runnerとserveBoundaryの注入は、この順序を実listenerなしで固定するstartup test seamである。
func runWithBoundaries(
	args []string,
	runner synthdecode.CommandRunner,
	serveProcess serveBoundary,
) error {
	cfg, err := config.Load(args)
	if err != nil {
		return err
	}
	if serveProcess == nil {
		return errors.New("serve boundary must not be nil")
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	processCtx, cancelProcess := context.WithCancel(context.Background())
	defer cancelProcess()
	synthDecoder, err := newSynthDecoder(processCtx, cfg.FFmpegPath, runner)
	if err != nil {
		return err
	}
	metrics := observability.NewRegistry()
	pipelineFactory, err := newPipelineFactory(logger)
	if err != nil {
		return err
	}
	sessions, err := rtc.NewManager(cfg.STUNURL, rtc.ManagerConfig{
		PipelineFactory: pipelineFactory,
		InputObserver:   metrics,
		Clock:           rtc.SystemClock{},
		Logger:          logger,
		MaxSessions:     cfg.MaxSessions,
		SynthDecoder:    synthDecoder,
		Recorder:        metrics,
	})
	if err != nil {
		return fmt.Errorf("create rtc manager: %w", err)
	}
	offers, err := signaling.NewOfferRegistry(sessions, signaling.OfferRegistryConfig{
		ProcessContext: processCtx,
		GatherTimeout:  cfg.GatherTimeout,
		Capacity:       cfg.OfferCacheCapacity,
		TTL:            cfg.OfferCacheTTL,
		Clock:          signaling.SystemOfferRegistryClock(),
		Logger:         logger,
		Recorder:       metrics,
	})
	if err != nil {
		return fmt.Errorf("create offer registry: %w", err)
	}
	return serveProcess(cfg, sessions, offers, cancelProcess, logger)
}

// newSynthDecoderは解決済みpathからprocess-wide Decoderを作り、listener作成前にversionをprobeする。
//
// ここで失敗を確定することで、HTTPだけが利用可能で最初の音声decode時に失敗する部分起動を防ぐ。
// runner注入はstartup testでもproductionと同じpath/version契約を検証するためのprocess seamである。
func newSynthDecoder(
	ctx context.Context,
	ffmpegPath string,
	runner synthdecode.CommandRunner,
) (*synthdecode.Decoder, error) {
	decoder, err := synthdecode.NewDecoder(ffmpegPath, runner)
	if err != nil {
		return nil, fmt.Errorf("create synthesized audio decoder: %w", err)
	}
	if err := decoder.ProbeVersion(ctx); err != nil {
		return nil, fmt.Errorf("probe ffmpeg: %w", err)
	}
	return decoder, nil
}

// newPipelineFactory はPoC local Consulから4 serviceを遅延解決するfactoryを構築する。
//
// serviceごとにportが異なるため共通fallbackは意図的に未設定とし、Consul障害時に誤ったserviceへ
// 接続しない。resolver/factory構築はnetwork I/Oを行わず、media readiness後のStartまで接続を遅延する。
func newPipelineFactory(logger *slog.Logger) (pipeline.ClientSetFactory, error) {
	resolver, err := discovery.NewResolver(discovery.ResolverConfig{
		ConsulBaseURL:  localConsulURL,
		RequestTimeout: discoveryRequestTimeout,
	}, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("create pipeline resolver: %w", err)
	}
	pipelineFactory, err := pclient.NewSetFactory(resolver, logger, time.Now)
	if err != nil {
		return nil, fmt.Errorf("create pipeline factory: %w", err)
	}
	return pipelineFactory, nil
}

// shutdownOperationsはsignal後に終了させるprocess ownerとlistener ownerを関数境界へ束ねる。
//
// productionと単体テストは同じ調停ロジックを使い、観測窓だけを実timerと手動channelで差し替える。
// 各errorを返す操作は失敗しても後続ownerの終了を妨げず、shutdownProcessが全結果を集約する。
type shutdownOperations struct {
	BeginDrain          func()
	CancelProcess       func()
	WaitOffers          func(context.Context) error
	CloseSessions       func(context.Context, string) error
	ShutdownHTTP        func(context.Context) error
	WaitAdmissionWindow func(context.Context) error
}

// shutdownProcessはdraining観測窓とprocess cleanupを完了してからHTTP listenerを停止する。
//
// BeginDrainは最初に実行し、CancelProcess、Offer owner join、session closeはsignal後の共通5秒期限で
// 収束させる。cleanupが早く終わっても1秒の受付拒否観測窓は短縮せず、両方の完了後に独立した
// 1秒期限でHTTPを停止する。各段階の失敗はerrors.Joinで保持し、未join resourceを正常終了にしない。
func shutdownProcess(operations shutdownOperations) error {
	operations.BeginDrain()
	cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), shutdownCleanupTimeout)
	operations.CancelProcess()

	cleanupErrors := make(chan error, 2)
	go func() {
		err := operations.WaitOffers(cleanupCtx)
		if err != nil {
			err = fmt.Errorf("wait offers: %w", err)
		}
		cleanupErrors <- err
	}()
	go func() {
		err := operations.CloseSessions(cleanupCtx, "process_shutdown")
		if err != nil {
			err = fmt.Errorf("close sessions: %w", err)
		}
		cleanupErrors <- err
	}()

	admissionErr := operations.WaitAdmissionWindow(cleanupCtx)
	if admissionErr != nil {
		admissionErr = fmt.Errorf("wait admission window: %w", admissionErr)
	}
	firstCleanupErr := <-cleanupErrors
	secondCleanupErr := <-cleanupErrors
	cancelCleanup()

	httpCtx, cancelHTTP := context.WithTimeout(context.Background(), shutdownHTTPTimeout)
	httpErr := operations.ShutdownHTTP(httpCtx)
	cancelHTTP()
	if httpErr != nil {
		httpErr = fmt.Errorf("shutdown http: %w", httpErr)
	}

	return errors.Join(admissionErr, firstCleanupErr, secondCleanupErr, httpErr)
}

// waitShutdownAdmissionWindowはdraining responseを外部監督が観測できる1秒をlistener停止前に確保する。
//
// cleanup共通期限が先に失効した場合はそのerrorを返し、HTTP停止へ進んでも時間契約違反を隠さない。
func waitShutdownAdmissionWindow(ctx context.Context) error {
	timer := time.NewTimer(shutdownAdmissionWindow)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// serve はHTTP受理、signal待機、process cleanup、HTTP停止の所有順序を調停する。
//
// signal時だけlistenerを1秒維持してdrainingを公開する。listener失敗時は観測対象がないため待機せず、
// 同じcleanup経路でprocess ownerを収束させる。全errorはshutdownProcessと結合してrunへ返す。
func serve(
	cfg config.Config,
	sessions *rtc.Manager,
	offers *signaling.OfferRegistry,
	cancelProcess context.CancelFunc,
	logger *slog.Logger,
) error {
	processState := signaling.NewProcessState()
	processState.MarkReady()
	recorder := sessions.Recorder()
	var metricsHandler http.Handler
	if registry, ok := recorder.(*observability.Registry); ok {
		metricsHandler = registry.Handler()
	}
	handler := signaling.New(
		sessions,
		offers,
		cfg.FrontendDir,
		cfg.STUNURL,
		logger,
		signaling.Options{State: processState, Recorder: recorder, Metrics: metricsHandler},
	).Handler()
	server := &http.Server{
		Addr:              cfg.HTTPAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	serverErrors := make(chan error, 1)
	go func() {
		logListenerReady(logger, runtime.NumGoroutine())
		serverErrors <- server.ListenAndServe()
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	var serveErr error
	waitAdmissionWindow := func(context.Context) error { return nil }
	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			serveErr = fmt.Errorf("serve http: %w", err)
		}
	case <-signals:
		logShutdownRequested(logger)
		waitAdmissionWindow = waitShutdownAdmissionWindow
	}

	shutdownErr := shutdownProcess(shutdownOperations{
		BeginDrain:    processState.BeginDrain,
		CancelProcess: cancelProcess,
		WaitOffers:    offers.Wait,
		CloseSessions: func(ctx context.Context, reason string) error {
			return sessions.CloseAll(ctx, reason)
		},
		ShutdownHTTP:        server.Shutdown,
		WaitAdmissionWindow: waitAdmissionWindow,
	})
	if err := errors.Join(serveErr, shutdownErr); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	logShutdownComplete(logger, sessions.Count())
	return nil
}

// 以下の3つのprocess lifecycle log helperは、運用上の段階と有限な集計値だけを公開するprivacy境界である。
//
// listener address、Frontend path、signal名、終了時goroutine数は環境情報を漏らすため記録しない。
// fieldを追加する場合はstructured log allow-listとprivacy契約を先に改訂する。
func logListenerReady(logger *slog.Logger, goroutineCount int) {
	logger.Info("pion poc listening", "stage", "listener_ready", "count", goroutineCount)
}

func logShutdownRequested(logger *slog.Logger) {
	logger.Info("shutdown signal received", "reason", "process_shutdown")
}

func logShutdownComplete(logger *slog.Logger, activeSessionCount int) {
	logger.Info("pion poc stopped", "stage", "shutdown_complete", "count", activeSessionCount)
}
