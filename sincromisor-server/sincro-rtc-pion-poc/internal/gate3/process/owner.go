package process

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

const (
	outputLimit = 1 << 20
	closeGrace  = time.Second
)

var (
	// ErrNotRunning は Start 前または終了後に running process が必要な操作を呼んだことを表す。
	ErrNotRunning = errors.New("process is not running")
	// ErrAlreadyStarted は Owner で Start を2回以上試みたことを表す。
	ErrAlreadyStarted = errors.New("process start already attempted")
	// ErrWaitTimeout は Wait の caller context が process 終了より先に完了したことを表す。
	//
	// process と background waiter は変更されないため、Wait の再試行または Close が必要である。
	ErrWaitTimeout = errors.New("wait context expired")
)

// State は Owner が管理する単調な process lifecycle である。
type State string

const (
	// StateNew は process をまだ起動していない状態である。
	StateNew State = "new"
	// StateRunning は process と background waiter を所有している状態である。
	StateRunning State = "running"
	// StateExited は background waiter が終了結果を保存した終端状態である。
	StateExited State = "exited"
)

// Command は継承のない子 process 起動契約である。
//
// Path と Dir は絶対 path、Env は子へ渡す完全な環境である。Args に argv[0] は含めない。
type Command struct {
	Path string
	Args []string
	Env  []string
	Dir  string
}

// Output は stdout または stderr の末尾最大1 MiBである。
//
// Truncated は先頭の byte が破棄されたことを示し、Data は常に時系列上の末尾を保持する。
type Output struct {
	Data      []byte `json:"data"`
	Truncated bool   `json:"truncated"`
}

// Result は一度だけ保存され、すべての Wait と Close caller へ同じ内容で返る終了結果である。
type Result struct {
	PID       int       `json:"pid"`
	ExitCode  int       `json:"exit_code"`
	StartedAt time.Time `json:"started_at"`
	ExitedAt  time.Time `json:"exited_at"`
	Stdout    Output    `json:"stdout"`
	Stderr    Output    `json:"stderr"`
}

// Owner は子 process、出力 pipe、background waiter、終了結果を単独所有する。
//
// zero value は使用できない。New で作り、正常・失敗を問わず最後に Close を呼ぶ。
type Owner struct {
	mu             sync.Mutex
	command        Command
	state          State
	startAttempted bool
	cmd            *exec.Cmd
	done           chan struct{}
	stdout         *tailBuffer
	stderr         *tailBuffer
	startedAt      time.Time
	result         Result
	waitErr        error
	grace          time.Duration

	closeOnce   sync.Once
	closeResult Result
	closeErr    error
}

// New は未起動の Owner を返す。Command の外部入力検査は Start で行う。
func New(command Command) *Owner {
	return newWithGrace(command, closeGrace)
}

func newWithGrace(command Command, grace time.Duration) *Owner {
	return &Owner{command: command, state: StateNew, grace: grace}
}

// State は現在の単調 lifecycle state を返す。
func (o *Owner) State() State {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.state
}

// Start は検査済み Command から process と background waiter を一度だけ起動する。
//
// 起動失敗も一回の試行として消費され、後続 Start は ErrAlreadyStarted になる。
// 成功後の終了回収は background waiter が所有し、caller は Wait 中に lock を保持しない。
func (o *Owner) Start() error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.startAttempted {
		return ErrAlreadyStarted
	}
	o.startAttempted = true
	if err := validateCommand(o.command); err != nil {
		return err
	}
	command := exec.Command(o.command.Path, o.command.Args...)
	command.Dir = o.command.Dir
	command.Env = append([]string(nil), o.command.Env...)
	o.stdout = newTailBuffer(outputLimit)
	o.stderr = newTailBuffer(outputLimit)
	command.Stdout = o.stdout
	command.Stderr = o.stderr
	if err := command.Start(); err != nil {
		return fmt.Errorf("start process: %w", err)
	}
	o.cmd = command
	o.done = make(chan struct{})
	o.startedAt = time.Now().UTC()
	o.state = StateRunning
	go o.collectExit(command)
	return nil
}

// Signal は running process だけへ signal を送る。
//
// Start 前と終了後は ErrNotRunning を返し、保存済み終了結果を変更しない。
func (o *Owner) Signal(signal os.Signal) error {
	o.mu.Lock()
	if o.state != StateRunning {
		o.mu.Unlock()
		return ErrNotRunning
	}
	process := o.cmd.Process
	o.mu.Unlock()
	if err := process.Signal(signal); err != nil {
		return fmt.Errorf("signal process: %w", err)
	}
	return nil
}

// Wait は process 終了結果を待つが、context 完了時に process を変更しない。
//
// context が先に完了すると ErrWaitTimeout を返す。後続 Wait は再試行でき、
// 終了後は全 caller が保存済みの同じ Result と process wait error を受け取る。
func (o *Owner) Wait(ctx context.Context) (Result, error) {
	o.mu.Lock()
	if o.state == StateNew {
		o.mu.Unlock()
		return Result{}, ErrNotRunning
	}
	if o.state == StateExited {
		result, err := o.result, o.waitErr
		o.mu.Unlock()
		return result, err
	}
	done := o.done
	o.mu.Unlock()

	select {
	case <-done:
		o.mu.Lock()
		result, err := o.result, o.waitErr
		o.mu.Unlock()
		return result, err
	case <-ctx.Done():
		return Result{}, errors.Join(ErrWaitTimeout, ctx.Err())
	}
}

// Close は process を残さない終端 cleanup を一度だけ実行する。
//
// running process へ SIGTERM を送り、1秒の猶予後も終了しなければ SIGKILL を送り、
// 期限なしで background waiter を join する。signal/kill error は process wait error と結合する。
func (o *Owner) Close() (Result, error) {
	o.closeOnce.Do(func() {
		o.closeResult, o.closeErr = o.close()
	})
	return o.closeResult, o.closeErr
}

func (o *Owner) close() (Result, error) {
	o.mu.Lock()
	if o.state == StateNew {
		o.startAttempted = true
		o.mu.Unlock()
		return Result{}, ErrNotRunning
	}
	if o.state == StateExited {
		result, waitErr := o.result, o.waitErr
		o.mu.Unlock()
		return result, waitErr
	}
	process := o.cmd.Process
	done := o.done
	grace := o.grace
	o.mu.Unlock()

	var cleanupErr error
	if err := process.Signal(syscall.SIGTERM); err != nil && !errors.Is(err, os.ErrProcessDone) {
		cleanupErr = errors.Join(cleanupErr, fmt.Errorf("send SIGTERM: %w", err))
	}
	timer := time.NewTimer(grace)
	select {
	case <-done:
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
	case <-timer.C:
		if err := process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			cleanupErr = errors.Join(cleanupErr, fmt.Errorf("send SIGKILL: %w", err))
		}
		<-done
	}
	o.mu.Lock()
	result, waitErr := o.result, o.waitErr
	o.mu.Unlock()
	return result, errors.Join(waitErr, cleanupErr)
}

// background waiter だけが running から exited へ遷移させる。
// 出力 snapshot も同じ lock acquisition で確定し、Wait/Close 間で内容が揺れない。
func (o *Owner) collectExit(command *exec.Cmd) {
	waitErr := command.Wait()
	result := Result{
		PID:       command.Process.Pid,
		ExitCode:  command.ProcessState.ExitCode(),
		StartedAt: o.startedAt,
		ExitedAt:  time.Now().UTC(),
		Stdout:    o.stdout.output(),
		Stderr:    o.stderr.output(),
	}
	o.mu.Lock()
	o.result = result
	o.waitErr = waitErr
	o.state = StateExited
	close(o.done)
	o.mu.Unlock()
}

func validateCommand(command Command) error {
	if !filepath.IsAbs(command.Path) {
		return errors.New("command path must be absolute")
	}
	if !filepath.IsAbs(command.Dir) {
		return errors.New("command dir must be absolute")
	}
	info, err := os.Stat(command.Path)
	if err != nil {
		return fmt.Errorf("stat command path: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		return errors.New("command path must be an executable regular file")
	}
	dirInfo, err := os.Stat(command.Dir)
	if err != nil {
		return fmt.Errorf("stat command dir: %w", err)
	}
	if !dirInfo.IsDir() {
		return errors.New("command dir must be a directory")
	}
	return nil
}
