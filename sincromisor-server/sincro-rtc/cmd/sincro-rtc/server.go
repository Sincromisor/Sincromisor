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

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/config"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/signaling"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/signaling/offer"
)

// serve はHTTP待受、終了シグナルの待機、資源の後始末、HTTP停止を順に調停する。
// シグナル受信時は1秒間待受を保ってdrainingを公開する。HTTP提供の失敗時は観測窓を省く。
// 終了処理の失敗はshutdownProcessから受け取り、HTTP提供の失敗と合わせてrunへ返す。
func serve(
	cfg config.Config,
	sessions *rtc.Manager,
	offers *offer.Registry,
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

// logListenerReady は待受の開始と稼働処理数だけを記録する。
// 待受アドレスやフロントエンドのパスなどの環境情報は記録しない。
func logListenerReady(logger *slog.Logger, goroutineCount int) {
	logger.Info("sincro-rtc listening", "stage", "listener_ready", "count", goroutineCount)
}

// logShutdownRequested は終了要求を固定の理由で記録し、シグナル名を公開しない。
func logShutdownRequested(logger *slog.Logger) {
	logger.Info("shutdown signal received", "reason", "process_shutdown")
}

// logShutdownComplete は終了完了と残るセッション数を記録し、終了時の処理数は公開しない。
func logShutdownComplete(logger *slog.Logger, activeSessionCount int) {
	logger.Info("sincro-rtc stopped", "stage", "shutdown_complete", "count", activeSessionCount)
}
