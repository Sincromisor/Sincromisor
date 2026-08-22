package pipeline

import (
	"errors"
	"fmt"
	"math"
)

// State はCoordinatorのsession lifecycleを表す診断可能な状態である。
type State string

const (
	// StateIdle はStart前でnetworkやgoroutineを所有しない。
	StateIdle State = "idle"
	// StateConnecting は4 client setを非公開のまま構築またはretryしている。
	StateConnecting State = "connecting"
	// StateRunning は4 clientとgeneration queueが入力を受理できる。
	StateRunning State = "running"
	// StateResetting は入力を拒否し、旧generationをjoinしている。
	StateResetting State = "resetting"
	// StateClosed は再接続を禁止して資源を回収する終端状態である。
	StateClosed State = "closed"
)

// TransitionError reports a rejected lifecycle edge without crashing the session.
type TransitionError struct {
	From State
	To   State
}

func (e *TransitionError) Error() string {
	return fmt.Sprintf("pipeline state transition %s -> %s is not allowed", e.From, e.To)
}

func validTransition(from, to State) bool {
	if to == StateClosed {
		return from != StateClosed
	}
	return (from == StateIdle && to == StateConnecting) ||
		(from == StateConnecting && to == StateRunning) ||
		(from == StateRunning && to == StateResetting) ||
		(from == StateResetting && to == StateConnecting)
}

func nextGeneration(current uint64) (uint64, error) {
	if current == 0 || current == math.MaxUint64 {
		return 0, errors.New("pipeline generation invariant violated")
	}
	return current + 1, nil
}
