package rtc

import (
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"

	inputmedia "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/input"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/media/synthdecode"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline"
)

// ManagerConfig は全sessionで共有するdependencyとactive session上限の起動時境界である。
//
// NewManager はnil dependencyと非正数MaxSessionsを拒否する。sessionごとに同じfactoryから専用Coordinatorを1つ作り、
// observerはprocess集計を行うため全sessionから同期的に呼ばれる。Clockは各session固有timerだけを
// 生成する。SynthDecoderはimmutableな非所有参照として全sessionへ同じpointerを渡すため、
// 共有dependencyはすべて並行利用可能でなければならない。
type ManagerConfig struct {
	PipelineFactory pipeline.ClientSetFactory
	InputObserver   inputmedia.Observer
	Clock           Clock
	Logger          *slog.Logger
	MaxSessions     int
	// APIは全Sessionで共有するprocess-wide Pion APIである。nilの場合だけfocused unit test用の
	// local API生成経路を使う。
	API *webrtc.API
	// SynthDecoderは全Sessionが同一pointerを非所有参照するimmutable dependencyである。
	SynthDecoder *synthdecode.Decoder
	// Recorderは有限種類の生存期間イベントを受け取る。nilの場合は何もしない実装を使い、
	// 下位試験がPrometheusレジストリを用意せずに済むようにする。
	Recorder observability.Recorder
}

// sessionBuildRequest はadmission後にSession resource境界へ渡す検証済みの作成入力をまとめる。
// Coordinatorはcallerが生成して渡し、builderはPeerConnectionとcodecを内部で生成する。
// synthDecoderはManagerのprocess-wide参照をコピーせずそのままSessionへ渡す。
type sessionBuildRequest struct {
	id            string
	talkMode      string
	gatherTimeout time.Duration
	coordinator   *pipeline.Coordinator
	synthDecoder  *synthdecode.Decoder
	onClosed      func(string)
	recorder      observability.Recorder
}

// sessionBuilder はadmission reservation後にだけ到達するPeerConnection/codec作成境界である。
//
// 成功return時だけCoordinator、PeerConnection、codecの全所有権をSessionへ移す。error時はbuilderが
// 内部生成済みPeerConnection/codecを片付け、callerのManager.CreateがCoordinatorをcloseする。
type sessionBuilder func(sessionBuildRequest) (*Session, error)

// Manager は active PeerConnection の registry と process-wide shutdown を所有する。
//
// registry lock は map の参照だけを保護し、PeerConnection I/O や Close 待機中は保持しない。
// SynthDecoderだけはimmutableなprocess-wide非所有参照として共有し、Manager/Session cleanup対象にしない。
// その他のdependenciesはsessionごとのCoordinator生成とdeadlineへ再利用し、resource自体は共有しない。
// unknown と closed session は candidate endpoint で区別できるprocess-lifetime tombstoneとして保持する。
// initial Offer の有限TTL tombstoneはsignaling registryが別に所有し、このmapはcandidate契約専用である。
type Manager struct {
	mu            sync.RWMutex
	sessions      map[string]*Session
	closed        map[string]struct{}
	configuration webrtc.Configuration
	config        ManagerConfig
	reservations  int
	maxSessions   int
	buildSession  sessionBuilder
}

// NewManager は optional STUN URL とprocess共有Pion APIをconfigurationへ反映し、必須dependencyを検証する。
//
// STUN URLの構文検証は起動時config loaderの責務であり、ここでは再検証しない。network I/O、
// PeerConnection、CoordinatorはCreateまで開始しない。Manager はprocess shutdown時に5秒上限の
// contextを渡してCloseAllを呼ぶ必要がある。APIがnilの場合だけlocal test用のPeerConnection生成を使う。
func NewManager(stunURL string, config ManagerConfig) (*Manager, error) {
	if config.PipelineFactory == nil || config.InputObserver == nil ||
		config.Clock == nil || config.Logger == nil || config.SynthDecoder == nil {
		return nil, errors.New("rtc manager dependencies must not be nil")
	}
	if config.MaxSessions <= 0 {
		return nil, errors.New("rtc manager max sessions must be positive")
	}
	if config.Recorder == nil {
		config.Recorder = observability.Discard()
	}
	configuration := webrtc.Configuration{}
	if stunURL != "" {
		configuration.ICEServers = []webrtc.ICEServer{{URLs: []string{stunURL}}}
	}
	manager := &Manager{
		sessions:      make(map[string]*Session),
		closed:        make(map[string]struct{}),
		configuration: configuration,
		config:        config,
		maxSessions:   config.MaxSessions,
	}
	manager.buildSession = func(request sessionBuildRequest) (*Session, error) {
		return newSession(
			request.id,
			request.talkMode,
			manager.configuration,
			request.gatherTimeout,
			request.coordinator,
			request.synthDecoder,
			manager.config.InputObserver,
			manager.config.Clock,
			manager.config.Logger,
			request.onClosed,
			config.API,
			request.recorder,
		)
	}
	return manager, nil
}
