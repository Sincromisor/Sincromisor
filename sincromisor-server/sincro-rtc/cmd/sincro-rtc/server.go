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

// 以下の3つのprocess lifecycle log helperは、運用上の段階と有限な集計値だけを公開するprivacy境界である。
//
// listener address、Frontend path、signal名、終了時goroutine数は環境情報を漏らすため記録しない。
// fieldを追加する場合はstructured log allow-listとprivacy契約を先に改訂する。
