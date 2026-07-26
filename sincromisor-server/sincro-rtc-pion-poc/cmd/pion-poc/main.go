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
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/signaling"
)

const shutdownTimeout = 5 * time.Second

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "pion-poc: %v\n", err)
		os.Exit(1)
	}
}

// run は config load、HTTP serve、signal shutdown を 1 つの process lifecycle として調停する。
//
// SIGINT / SIGTERM では新規 HTTP request を停止してから全 session を close する。listener 起動失敗、
// HTTP shutdown timeout、session cleanup failure は main へ返し、下位 package では process を終了しない。
func run(args []string) error {
	cfg, err := config.Load(args)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	sessions := rtc.NewManager(cfg.STUNURL, logger)
	handler := signaling.New(
		sessions,
		cfg.FrontendDir,
		cfg.STUNURL,
		cfg.GatherTimeout,
		logger,
	).Handler()
	server := &http.Server{
		Addr:              cfg.HTTPAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("pion poc listening",
			"http", cfg.HTTPAddress,
			"frontend_dir", cfg.FrontendDir,
			"initial_goroutines", runtime.NumGoroutine(),
		)
		serverErrors <- server.ListenAndServe()
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve http: %w", err)
		}
	case signalValue := <-signals:
		logger.Info("shutdown signal received", "signal", signalValue.String())
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	httpErr := server.Shutdown(shutdownCtx)
	sessionErr := sessions.CloseAll("process_shutdown")
	if err := errors.Join(httpErr, sessionErr); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	logger.Info("pion poc stopped",
		"active_sessions", sessions.Count(),
		"final_goroutines", runtime.NumGoroutine(),
	)
	return nil
}
