package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/config"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
	pclient "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/client"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc/network"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/signaling/offer"
)

type serveBoundary func(
	config.Config,
	*rtc.Manager,
	*offer.Registry,
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
	processNetwork, err := network.New(mediaSocket, cfg.PublicIPv4, cfg.Interface, cfg.GatherTimeout)
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
	offers, err := offer.New(sessions, offer.Config{
		ProcessContext: processCtx,
		GatherTimeout:  cfg.GatherTimeout,
		Capacity:       cfg.OfferCacheCapacity,
		TTL:            cfg.OfferCacheTTL,
		Clock:          offer.SystemClock(),
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
