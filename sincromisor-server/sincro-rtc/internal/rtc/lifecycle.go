package rtc

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/pion/webrtc/v4"
)

const (
	// preConnectTimeout はcandidate収集済みAnswerを保持できる上限であり、half-open transportを15秒で破棄する。
	preConnectTimeout = 15 * time.Second
	// mediaReadinessTimeout はconnected transportが3 media条件を保持できる上限であり、下流接続前に10秒で破棄する。
	mediaReadinessTimeout = 10 * time.Second
	// disconnectGraceTimeout は一時的なnetwork断で不要なICE restartを要求しない猶予である。
	disconnectGraceTimeout = 10 * time.Second
	// restartDeadlineTimeout はfailedまたはgrace超過後に同じPeerConnectionを復旧できる上限である。
	restartDeadlineTimeout = 15 * time.Second
)

// Timer は session deadline を停止する最小契約である。
//
// Stop は callback の完了を待たない。Session の lifecycle mutex が、停止と同時に発火した
// callback を closing 以後の no-op に直列化する。
type Timer interface {
	Stop() bool
}

// Clock は session ごとの有限 deadline を生成する。
//
// duration は正数でなければならず、AfterFunc は nil Timer を返してはならない。
// callback の drain は Timer の責務に含めない。
type Clock interface {
	AfterFunc(time.Duration, func()) Timer
}

// SystemClock は time.AfterFunc を使う production clock である。
type SystemClock struct{}

// AfterFunc は duration 後に callback を独立 goroutine で実行する。
func (SystemClock) AfterFunc(duration time.Duration, callback func()) Timer {
	return time.AfterFunc(duration, callback)
}

type sessionState string

const (
	stateCreated        sessionState = "created"
	stateAnswerReady    sessionState = "answer_ready"
	stateTransportReady sessionState = "transport_ready"
	stateMediaReady     sessionState = "media_ready"
	stateRunning        sessionState = "running"
	stateClosing        sessionState = "closing"
	stateClosed         sessionState = "closed"
)

type recoveryPhase string

const (
	recoveryNone         recoveryPhase = ""
	recoveryGrace        recoveryPhase = "disconnect_grace"
	recoveryNeedsRestart recoveryPhase = "restart_required"
)

// TransitionError は event source が許可されていない session state 遷移を要求したことを表す。
//
// callback の重複と closing 後の通知は caller が no-op として除外するため、この error は
// lifecycle の実装不備または順序違反を運用境界で一度だけ記録するために使う。
type TransitionError struct {
	From  sessionState
	To    sessionState
	Event string
}

// Error は拒否された遷移と event source を診断可能な形で返す。
func (e *TransitionError) Error() string {
	return fmt.Sprintf("rtc session transition %s -> %s rejected for %s", e.From, e.To, e.Event)
}

// validSessionTransition はreadinessの直列chainと、全非terminal stateからのclosingだけを許可する。
//
// callback到着順はlatchが吸収するため、track/channel eventがtransport stateを飛び越す遷移は持たない。
// closedからの復帰も禁止する。ICE restartはstateを巻き戻さずrunning resourceを維持したまま
// recoveryPhaseだけを遷移させる。
func validSessionTransition(from, to sessionState) bool {
	switch from {
	case stateCreated:
		return to == stateAnswerReady || to == stateClosing
	case stateAnswerReady:
		return to == stateTransportReady || to == stateClosing
	case stateTransportReady:
		return to == stateMediaReady || to == stateClosing
	case stateMediaReady:
		return to == stateRunning || to == stateClosing
	case stateRunning:
		return to == stateClosing
	case stateClosing:
		return to == stateClosed
	default:
		return false
	}
}

// deadlineController は Answer 後と transport 後の timer を同じ lifecycle lock 配下で交換する。
//
// pre-connect と media-readiness は同時に生存しない。Session が closing を確定する際に
// cancel を呼べば、発火済み callback も state 再確認によって resource を再開しない。
type deadlineController struct {
	clock Clock
	timer Timer
}

func newDeadlineController(clock Clock) (*deadlineController, error) {
	if clock == nil {
		return nil, errors.New("rtc session clock must not be nil")
	}
	return &deadlineController{clock: clock}, nil
}

func (d *deadlineController) replace(duration time.Duration, callback func()) error {
	if duration <= 0 || callback == nil {
		return errors.New("rtc session deadline arguments are invalid")
	}
	d.stop()
	d.timer = d.clock.AfterFunc(duration, callback)
	if d.timer == nil {
		return errors.New("rtc session clock returned nil timer")
	}
	return nil
}

func (d *deadlineController) stop() {
	if d.timer != nil {
		d.timer.Stop()
		d.timer = nil
	}
}

// sessionLifecycle はcallback latch、state machine、recovery phase、deadlineを単一mutexで直列化する。
//
// track と channel は connected 前でも記録するが、media_ready は transport_ready 後かつ
// audio、text_ch、telop_ch の全条件成立時だけ公開する。別 object の同種 media は
// duplicate_mediaとしてsession全体を閉じるため、ここではobject identityも保持する。recoveryは
// running stateを巻き戻さず、disconnect graceからrestart-requiredへのtransport補助状態だけを表す。
type sessionLifecycle struct {
	mu          sync.Mutex
	state       sessionState
	closeReason string
	deadlines   *deadlineController
	// recoveryDeadlinesはinitial/media readinessの安全期限を置換せず、接続復旧期限を並行所有する。
	recoveryDeadlines *deadlineController

	audio        *webrtc.TrackRemote
	textChannel  *webrtc.DataChannel
	telopChannel *webrtc.DataChannel
	textOpen     bool
	telopOpen    bool
	recovery     recoveryPhase
	iceState     string
}

func newSessionLifecycle(clock Clock) (*sessionLifecycle, error) {
	deadlines, err := newDeadlineController(clock)
	if err != nil {
		return nil, err
	}
	recoveryDeadlines, err := newDeadlineController(clock)
	if err != nil {
		return nil, err
	}
	return &sessionLifecycle{
		state: stateCreated, deadlines: deadlines, recoveryDeadlines: recoveryDeadlines,
	}, nil
}

// transitionLocked はcallerが保持するlifecycle mutex内でevent source付きのstate変更を確定する。
func (l *sessionLifecycle) transitionLocked(to sessionState, event string) error {
	if !validSessionTransition(l.state, to) {
		return &TransitionError{From: l.state, To: to, Event: event}
	}
	l.state = to
	return nil
}

func (l *sessionLifecycle) terminalLocked() bool {
	return l.state == stateClosing || l.state == stateClosed
}

func (l *sessionLifecycle) allMediaReadyLocked() bool {
	return l.audio != nil && l.textChannel != nil && l.telopChannel != nil &&
		l.textOpen && l.telopOpen
}
