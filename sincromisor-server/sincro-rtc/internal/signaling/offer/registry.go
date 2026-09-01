// Package offer は初回Offerの同時処理、成功応答、終了済み記録、期限回収を所有する。
package offer

import (
	"context"
	"crypto/sha256"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/observability"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/rtc"
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

// Clock はTTL回収で使うwall-clockと周期wake-upを提供する。
// 実装はowner、close callback、sweeperからの並行呼び出しに対応しなければならない。
type Clock interface {
	// Now は現在の期限判定時刻を返す。
	Now() time.Time
	// After は指定時間後に一度通知するチャネルを返す。
	After(time.Duration) <-chan time.Time
}

type systemClock struct{}

func (systemClock) Now() time.Time                         { return time.Now() }
func (systemClock) After(d time.Duration) <-chan time.Time { return time.After(d) }

// SystemClock はキャッシュ期限と周期回収に使う本番のwall clockを返す。
func SystemClock() Clock {
	return systemClock{}
}

// Config はプロセス所有者、候補収集期限、TTL、受付上限を固定する。
//
// ProcessContextのcancelはowner workとsweeperを止め、Waitは両者をjoinする。
// request cancelはそのwaiterだけを離脱させる。ClockとLoggerは必須である。
type Config struct {
	// ProcessContext は作成処理と期限回収処理の生存期間を所有する。
	ProcessContext context.Context
	// GatherTimeout は候補収集を含むセッション作成の上限時間である。
	GatherTimeout time.Duration
	// Capacity は処理中、完了、終了済み項目が共有する最大件数である。
	Capacity int
	// TTL は完了応答と終了済み記録を保持する時間である。
	TTL time.Duration
	// Clock は期限判定と周期回収の時刻供給元である。
	Clock Clock
	// Logger はペイロードを含めず生存期間異常を記録する。
	Logger *slog.Logger
	// Recorder はOfferやセッションのペイロードを含めず候補収集期限を記録する。
	Recorder observability.Recorder
}

// Creator は初回Offerレジストリが必要とするセッション作成境界である。
//
// 実装はOnClosedをセッション終了時に一度呼び、候補収集が完了したAnswerを返す。
type Creator interface {
	// Create は初回Offerから候補収集済みのAnswerと終了通知を持つセッションを作る。
	Create(context.Context, rtc.Offer) (rtc.Answer, error)
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

// Registry は初回Offerを同時処理し、成功したAnswerだけをキャッシュする。
//
// Frontend UUIDをkeyとしてdecoded SDP bytesそのもののSHA-256を結び付ける。in-flight、
// completed、tombstoneは1つのcapacityを共有し、有効entryを新規requestのためにevictしない。
// ゼロ値は使用できず、Newで生成した値だけが期限回収処理と終了待機を所有する。
type Registry struct {
	mu          sync.Mutex
	entries     map[string]*offerEntry
	sessions    Creator
	config      Config
	owners      sync.WaitGroup
	sweeperDone chan struct{}
}

// New は依存と正数の上限を検証し、プロセス所有のTTL回収処理を開始する。
func New(sessions Creator, config Config) (*Registry, error) {
	if sessions == nil || config.ProcessContext == nil || config.Clock == nil || config.Logger == nil {
		return nil, errors.New("offer registry dependencies must not be nil")
	}
	if config.GatherTimeout <= 0 || config.Capacity <= 0 || config.TTL <= 0 {
		return nil, errors.New("offer registry limits must be positive")
	}
	if config.Recorder == nil {
		config.Recorder = observability.Discard()
	}
	registry := &Registry{
		entries:     make(map[string]*offerEntry),
		sessions:    sessions,
		config:      config,
		sweeperDone: make(chan struct{}),
	}
	registry.startSweeper()
	return registry, nil
}

// Resolve はrequestIDと同一SDP bytesへ対応するcandidate収集済みAnswerを返す。
//
// 最初のcallerがresource作成前にin-flight entryを登録し、process所有のworkを開始する。
// 一致するcallerは同じ結果を待ち、各contextは自身の待機だけを制限する。conflict、tombstone、
// capacity、owner timeout、Session admission失敗は境界で判定可能なerrorとして返す。
func (r *Registry) Resolve(
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
//
// Wait自身は期限を延長しない。process coordinatorがsession ownerと共有するcontextを渡すことで、
// 先に受理済みのinitial Offerとsession cleanupを同じshutdown budget内で並行して収束できる。
func (r *Registry) Wait(ctx context.Context) error {
	result := r.startJoin(func() {
		r.owners.Wait()
		<-r.sweeperDone
	})
	select {
	case err := <-result:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// GatherTimeout は更新Offerにも適用する候補収集上限を返す。
func (r *Registry) GatherTimeout() time.Duration {
	if r == nil {
		return 0
	}
	return r.config.GatherTimeout
}

// startJoin は作成所有者と期限回収処理の待ち合わせを1つの結果へまとめる。
// 補助処理のpanicは有限のエラーへ変換し、Waitを取り残さず結果を一度だけ送る。
func (r *Registry) startJoin(join func()) <-chan error {
	result := make(chan error, 1)
	go func() {
		defer func() {
			if recover() != nil {
				r.config.Logger.Error("offer registry worker panic", "stage", "offer_wait", "reason", "panic")
				result <- errors.New("offer registry wait helper panic")
			}
		}()
		join()
		result <- nil
	}()
	return result
}

func (r *Registry) wait(ctx context.Context, entry *offerEntry) (rtc.Answer, error) {
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
// 成功だけをcompleted cacheへ遷移させ、失敗/panic entryは削除してdoneを閉じ、同じrequest IDの
// 再試行と全waiterの解放を可能にする。OnClosedはSessionのcallback panic境界から呼ばれるため、
// tombstone処理がpanicしてもSession側のdone/active metric解放は継続する。
func (r *Registry) create(entry *offerEntry, rtcOffer rtc.Offer) {
	defer r.owners.Done()
	defer func() {
		if recover() != nil {
			r.config.Logger.Error("offer registry worker panic", "stage", "offer_owner", "reason", "panic")
			r.mu.Lock()
			if current := r.entries[entry.requestID]; current == entry {
				entry.err = errors.New("initial offer owner panic")
				delete(r.entries, entry.requestID)
				close(entry.done)
			}
			r.mu.Unlock()
		}
	}()
	ownerCtx, cancel := context.WithTimeout(r.config.ProcessContext, r.config.GatherTimeout)
	defer cancel()
	rtcOffer.OnClosed = func(sessionID string) {
		r.sessionClosed(entry, sessionID)
	}
	answer, err := r.sessions.Create(ownerCtx, rtcOffer)
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(ownerCtx.Err(), context.DeadlineExceeded) {
		r.config.Recorder.Deadline("gather")
	}

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
func (r *Registry) sessionClosed(entry *offerEntry, sessionID string) {
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
		"session_id", sessionID,
		"reason", "session_closed",
	)
}

// startSweeper はプロセス生存期間のTTL回収処理を所有し、panicを含む全終了経路でsweeperDoneを閉じる。
// Clockまたは回収処理が失敗しても、復旧値を公開せずWaitが待ち合わせできる状態を保つ。
func (r *Registry) startSweeper() {
	go func() {
		defer close(r.sweeperDone)
		defer func() {
			if recover() != nil {
				r.config.Logger.Error("offer registry worker panic", "stage", "offer_sweeper", "reason", "panic")
			}
		}()
		r.sweep()
	}()
}

// sweep はprocess contextをownerとし、30秒ごとにrequest非依存の期限回収を行う。
// process cancelまたはstartSweeperのpanic境界で終了し、shutdownのWaitへjoin可能になる。
func (r *Registry) sweep() {
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
func (r *Registry) removeExpiredLocked(now time.Time) {
	for requestID, entry := range r.entries {
		if entry.state != offerInFlight && !entry.expiresAt.After(now) {
			delete(r.entries, requestID)
		}
	}
}
