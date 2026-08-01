package signaling

import (
	"context"
	"crypto/sha256"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/rtc"
)

const offerSweepInterval = 30 * time.Second

var (
	// ErrOfferConflict は1つのrequest IDを異なるraw SDP bytesへ再利用したことを表す。
	ErrOfferConflict = errors.New("offer request id conflicts with cached sdp")
	// ErrOfferGone は対応Session終了後のtombstoneが有効であることを表す。
	ErrOfferGone = errors.New("offer session is closed")
	// ErrOfferCapacity は有限registryの全slotが有効entryで占有されていることを表す。
	ErrOfferCapacity = errors.New("offer registry capacity reached")
)

type offerState uint8

const (
	offerInFlight offerState = iota
	offerCompleted
	offerTombstone
)

// OfferRegistryClock はTTL回収で使うwall-clockと周期wake-upを提供する。
// 実装はowner、close callback、sweeperからの並行呼び出しに対応しなければならない。
type OfferRegistryClock interface {
	Now() time.Time
	After(time.Duration) <-chan time.Time
}

type systemOfferRegistryClock struct{}

func (systemOfferRegistryClock) Now() time.Time                         { return time.Now() }
func (systemOfferRegistryClock) After(d time.Duration) <-chan time.Time { return time.After(d) }

// SystemOfferRegistryClock はcache expiryと周期回収に使うproduction wall clockを返す。
func SystemOfferRegistryClock() OfferRegistryClock {
	return systemOfferRegistryClock{}
}

// OfferRegistryConfig はprocess owner、有限gather deadline、TTL、hard admission上限を固定する。
//
// ProcessContextのcancelはowner workとsweeperを止め、Waitは両者をjoinする。
// request cancelはそのwaiterだけを離脱させる。ClockとLoggerは必須である。
type OfferRegistryConfig struct {
	ProcessContext context.Context
	GatherTimeout  time.Duration
	Capacity       int
	TTL            time.Duration
	Clock          OfferRegistryClock
	Logger         *slog.Logger
}

// offerEntry は1 request IDのraw SDP hashと、in-flightからcompleted/tombstoneへの状態遷移を保持する。
//
// doneはownerが成功または失敗を確定したときだけ閉じる。waitersはrequest cancelで個別に減るが、
// owner lifecycleを変更しない。expiresAtはcompleted/tombstoneだけで意味を持つ。
type offerEntry struct {
	requestID string
	sdpHash   [sha256.Size]byte
	sessionID string
	revision  uint64
	answer    rtc.Answer
	err       error
	state     offerState
	expiresAt time.Time
	done      chan struct{}
	waiters   int
}

// OfferRegistry はinitial Offerをsingle-flight化し、成功したAnswerだけをcacheする。
//
// Frontend UUIDをkeyとしてdecoded SDP bytesそのもののSHA-256を結び付ける。in-flight、
// completed、tombstoneは1つのcapacityを共有し、有効entryを新規requestのためにevictしない。
type OfferRegistry struct {
	mu          sync.Mutex
	entries     map[string]*offerEntry
	sessions    SessionService
	config      OfferRegistryConfig
	owners      sync.WaitGroup
	sweeperDone chan struct{}
}

// NewOfferRegistry はdependencyと正数limitを検証し、process所有のTTL collectorを開始する。
func NewOfferRegistry(sessions SessionService, config OfferRegistryConfig) (*OfferRegistry, error) {
	if sessions == nil || config.ProcessContext == nil || config.Clock == nil || config.Logger == nil {
		return nil, errors.New("offer registry dependencies must not be nil")
	}
	if config.GatherTimeout <= 0 || config.Capacity <= 0 || config.TTL <= 0 {
		return nil, errors.New("offer registry limits must be positive")
	}
	registry := &OfferRegistry{
		entries:     make(map[string]*offerEntry),
		sessions:    sessions,
		config:      config,
		sweeperDone: make(chan struct{}),
	}
	go registry.sweep()
	return registry, nil
}

// Resolve はrequestIDと同一SDP bytesへ対応するcandidate収集済みAnswerを返す。
//
// 最初のcallerがresource作成前にin-flight entryを登録し、process所有のworkを開始する。
// 一致するcallerは同じ結果を待ち、各contextは自身の待機だけを制限する。conflict、tombstone、
// capacity、owner timeout、Session admission失敗は境界で判定可能なerrorとして返す。
func (r *OfferRegistry) Resolve(
	ctx context.Context,
	requestID string,
	sdp []byte,
	offer rtc.Offer,
) (rtc.Answer, error) {
	hash := sha256.Sum256(sdp)
	r.mu.Lock()
	r.removeExpiredLocked(r.config.Clock.Now())
	entry := r.entries[requestID]
	if entry != nil {
		if entry.sdpHash != hash {
			r.mu.Unlock()
			return rtc.Answer{}, ErrOfferConflict
		}
		entry.waiters++
		r.mu.Unlock()
		return r.wait(ctx, entry)
	}
	if len(r.entries) >= r.config.Capacity {
		r.mu.Unlock()
		return rtc.Answer{}, ErrOfferCapacity
	}
	entry = &offerEntry{
		requestID: requestID,
		sdpHash:   hash,
		revision:  1,
		state:     offerInFlight,
		done:      make(chan struct{}),
		waiters:   1,
	}
	r.entries[requestID] = entry
	r.owners.Add(1)
	r.mu.Unlock()

	go r.create(entry, offer)
	return r.wait(ctx, entry)
}

// Wait は全initial Offer ownerとTTL sweeperをjoinし、shutdown deadline超過時はctx.Errを返す。
func (r *OfferRegistry) Wait(ctx context.Context) error {
	done := make(chan struct{})
	go func() {
		r.owners.Wait()
		<-r.sweeperDone
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r *OfferRegistry) wait(ctx context.Context, entry *offerEntry) (rtc.Answer, error) {
	select {
	case <-ctx.Done():
		r.mu.Lock()
		entry.waiters--
		r.mu.Unlock()
		return rtc.Answer{}, ctx.Err()
	case <-entry.done:
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	entry.waiters--
	switch entry.state {
	case offerCompleted:
		return entry.answer, nil
	case offerTombstone:
		return rtc.Answer{}, ErrOfferGone
	default:
		return rtc.Answer{}, entry.err
	}
}

// create はHTTP waiterから独立してcandidate収集を所有し、process cancelとgather timeoutには従う。
// 成功だけをcompleted cacheへ遷移させ、失敗entryは削除して同じrequest IDの再試行を許可する。
func (r *OfferRegistry) create(entry *offerEntry, offer rtc.Offer) {
	defer r.owners.Done()
	ownerCtx, cancel := context.WithTimeout(r.config.ProcessContext, r.config.GatherTimeout)
	defer cancel()
	offer.OnClosed = func(sessionID string) {
		r.sessionClosed(entry, sessionID)
	}
	answer, err := r.sessions.Create(ownerCtx, offer)

	r.mu.Lock()
	defer r.mu.Unlock()
	if err != nil {
		entry.err = err
		delete(r.entries, entry.requestID)
		close(entry.done)
		return
	}
	entry.sessionID = answer.SessionID
	if entry.state == offerTombstone {
		entry.answer = rtc.Answer{}
	} else {
		answer.Revision = entry.revision
		entry.answer = answer
		entry.state = offerCompleted
		entry.expiresAt = r.config.Clock.Now().Add(r.config.TTL)
	}
	close(entry.done)
}

// sessionClosed はSession cleanup eventで有効なin-flight/completed entryをtombstoneへ変換する。
// resource消失後から完全なretry抑止期間を確保するため、このevent時点からTTLを取り直す。
func (r *OfferRegistry) sessionClosed(entry *offerEntry, sessionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.entries[entry.requestID] != entry {
		return
	}
	entry.sessionID = sessionID
	entry.answer = rtc.Answer{}
	entry.state = offerTombstone
	entry.expiresAt = r.config.Clock.Now().Add(r.config.TTL)
	r.config.Logger.Info("initial offer tombstoned",
		"offer_request_id", entry.requestID,
		"session_id", sessionID,
	)
}

// sweep はprocess contextをownerとし、30秒ごとにrequest非依存の期限回収を行う。
// process cancelで終了してsweeperDoneを閉じ、shutdownのWaitへjoin完了を通知する。
func (r *OfferRegistry) sweep() {
	defer close(r.sweeperDone)
	for {
		select {
		case <-r.config.ProcessContext.Done():
			return
		case <-r.config.Clock.After(offerSweepInterval):
			r.mu.Lock()
			r.removeExpiredLocked(r.config.Clock.Now())
			r.mu.Unlock()
		}
	}
}

// removeExpiredLocked はrequest受付時と周期sweepでcompleted/tombstoneだけを期限回収する。
// in-flightはownerが成功または失敗を確定するまで保持し、capacity都合の回収は行わない。
func (r *OfferRegistry) removeExpiredLocked(now time.Time) {
	for requestID, entry := range r.entries {
		if entry.state != offerInFlight && !entry.expiresAt.After(now) {
			delete(r.entries, requestID)
		}
	}
}
