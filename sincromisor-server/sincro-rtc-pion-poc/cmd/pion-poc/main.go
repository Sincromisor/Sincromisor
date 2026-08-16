// Command pion-poc は build 済み Frontend と Pion signaling/media PoC を同一 origin で起動する。
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
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
	// shutdownCleanupTimeout はOffer ownerと全sessionが共有するcleanup contextの期限である。
	// 短くすると正常なresource解放までdeadline errorになり、長くするとHTTP停止と合わせたprocess終了上限が延びる。
	// 変更時はPion README、rollout運用文書、shutdownProcess期限試験、実process SIGTERM試験を同期する。
	shutdownCleanupTimeout = 5 * time.Second
	// shutdownAdmissionWindow はdrainingとinitial Offer 503を観測させるためlistenerを維持する時間である。
	// 短くすると外部監督が503を見逃し、長くするとcleanupが早い場合のHTTP停止を遅らせる。
	// cleanup期限を超える値は観測窓自体をdeadline errorにする。変更時はPion README、rollout運用文書、
	// shutdownProcess期限試験、実process SIGTERM試験を同期する。
	shutdownAdmissionWindow = 1 * time.Second
	// shutdownHTTPTimeout はcleanupと観測窓の完了後にhttp.Serverだけを停止する独立期限である。
	// 短くすると接続終了がdeadline errorになり、長くするとprocess終了上限がcleanup期限との合計6秒を超える。
	// 変更時はPion README、rollout運用文書、shutdownProcess期限試験、実process SIGTERM試験を同期する。
	shutdownHTTPTimeout = 1 * time.Second
	// discoveryRequestTimeout は local Consul 障害が readiness 後のsession cleanupを長時間妨げない上限である。
	discoveryRequestTimeout = 2 * time.Second
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
) (returnErr error) {
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
	mediaSocket, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.ParseIP(cfg.MediaIPv4), Port: int(cfg.MediaUDPPort)})
	if err != nil {
		return fmt.Errorf("bind media udp socket: %w", err)
	}
	processNetwork, err := rtc.NewProcessNetwork(mediaSocket, cfg.PublicIPv4, cfg.Interface, cfg.GatherTimeout)
	if err != nil {
		_ = mediaSocket.Close()
		return fmt.Errorf("create production rtc API: %w", err)
	}
	defer func() { returnErr = errors.Join(returnErr, processNetwork.Close()) }()
	metrics := observability.NewRegistry()
	pipelineFactory, err := newPipelineFactory(cfg, logger)
	if err != nil {
		return err
	}
	sessions, err := rtc.NewManager(cfg.STUNURL, rtc.ManagerConfig{
		PipelineFactory: pipelineFactory,
		InputObserver:   metrics,
		Clock:           rtc.SystemClock{},
		Logger:          logger,
		MaxSessions:     cfg.MaxSessions,
		API:             processNetwork.API,
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

// newPipelineFactory は設定済み Consul agent から4 serviceを遅延解決するfactoryを構築する。
//
// Consul未設定時とlookup失敗時は、設定済みの共通 Caddy fallback を使う。resolver/factory構築はnetwork I/Oを
// 行わず、media readiness後のStartまで接続を遅延する。
func newPipelineFactory(cfg config.Config, logger *slog.Logger) (pipeline.ClientSetFactory, error) {
	consulURL := ""
	if cfg.ConsulAgentHost != "" {
		consulURL = "http://" + net.JoinHostPort(cfg.ConsulAgentHost, fmt.Sprint(cfg.ConsulAgentPort))
	}
	resolver, err := discovery.NewResolver(discovery.ResolverConfig{
		ConsulBaseURL:  consulURL,
		FallbackHost:   cfg.FallbackHost,
		FallbackPort:   uint16(cfg.FallbackPort),
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
	Deregister          func(context.Context) error
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
	deregister := operations.Deregister
	if deregister == nil {
		deregister = func(context.Context) error { return nil }
	}

	cleanupErrors := make(chan error, 3)
	go func() {
		deregisterCtx, cancelDeregister := context.WithTimeout(context.Background(), 2*time.Second)
		err := deregister(deregisterCtx)
		cancelDeregister()
		if err != nil {
			err = fmt.Errorf("deregister Consul service: %w", err)
		}
		cleanupErrors <- err
	}()
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
	thirdCleanupErr := <-cleanupErrors
	cancelCleanup()

	httpCtx, cancelHTTP := context.WithTimeout(context.Background(), shutdownHTTPTimeout)
	httpErr := operations.ShutdownHTTP(httpCtx)
	cancelHTTP()
	if httpErr != nil {
		httpErr = fmt.Errorf("shutdown http: %w", httpErr)
	}

	return errors.Join(admissionErr, firstCleanupErr, secondCleanupErr, thirdCleanupErr, httpErr)
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
	listener, err := net.Listen("tcp", cfg.HTTPAddress)
	if err != nil {
		return fmt.Errorf("bind http listener: %w", err)
	}
	serverErrors := make(chan error, 1)
	go func() {
		logListenerReady(logger, runtime.NumGoroutine())
		serverErrors <- server.Serve(listener)
	}()
	var deregister func(context.Context) error
	if cfg.ConsulAgentHost != "" {
		registration, registrationErr := discovery.NewRegistration(discovery.Registration{
			AgentHost: cfg.ConsulAgentHost,
			AgentPort: uint16(cfg.ConsulAgentPort),
			Host:      cfg.ServiceBindHost,
			Address:   cfg.ServiceBindIPv4,
			Port:      uint16(listener.Addr().(*net.TCPAddr).Port),
		})
		if registrationErr == nil {
			registrationErr = registration.Register(context.Background())
		}
		if registrationErr != nil {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownHTTPTimeout)
			shutdownErr := server.Shutdown(shutdownCtx)
			cancel()
			return errors.Join(fmt.Errorf("register Consul service: %w", registrationErr), shutdownErr)
		}
		deregister = registration.Deregister
	}
	processState.MarkReady()

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
		BeginDrain: processState.BeginDrain,
		Deregister: func(ctx context.Context) error {
			if deregister == nil {
				return nil
			}
			return deregister(ctx)
		},
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
