package report

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// PublishError は hard link 公開後の cleanup または directory fsync 失敗を表す。
//
// Target は上書きせず残り、TempPath は公開元の一時 path を診断・手動 cleanup 用に示す。
type PublishError struct {
	Target   string
	TempPath string
	Err      error
}

// Error は公開後失敗と残存候補 path を返す。
func (e *PublishError) Error() string {
	return fmt.Sprintf("publish report %s from temporary path %s: %v", e.Target, e.TempPath, e.Err)
}

// Unwrap は cleanup 原因を errors.Is/errors.As で判定可能にする。
func (e *PublishError) Unwrap() error {
	return e.Err
}

type file interface {
	Write([]byte) (int, error)
	Sync() error
	Close() error
	Name() string
}

type fileOps interface {
	CreateTemp(string, string) (file, error)
	Chmod(string, os.FileMode) error
	Link(string, string) error
	Remove(string) error
	Open(string) (file, error)
}

type osFileOps struct{}

func (osFileOps) CreateTemp(dir, pattern string) (file, error) { return os.CreateTemp(dir, pattern) }
func (osFileOps) Chmod(path string, mode os.FileMode) error    { return os.Chmod(path, mode) }
func (osFileOps) Link(oldPath, newPath string) error           { return os.Link(oldPath, newPath) }
func (osFileOps) Remove(path string) error                     { return os.Remove(path) }
func (osFileOps) Open(path string) (file, error)               { return os.Open(path) }

// Writer は schema 検証から durable な非上書き公開までを一つの境界として所有する。
//
// zero value は使用できない。NewWriter で作る。
type Writer struct {
	ops fileOps
}

// NewWriter は OS の hard link と fsync を使う Writer を返す。
func NewWriter() *Writer {
	return &Writer{ops: osFileOps{}}
}

// Write は Document を検証し、同一 directory の0600一時 fileから targetを原子的に公開する。
//
// 順序は write、file fsync、hard link、temporary unlink、directory fsync である。
// 既存 target と link 前失敗は target を作らない。link 後失敗は target を残して PublishError を返す。
func (w *Writer) Write(target string, document Document) error {
	if w == nil || w.ops == nil {
		return errors.New("report Writer must be created with NewWriter")
	}
	if !filepath.IsAbs(target) {
		return errors.New("report target must be an absolute path")
	}
	if err := Validate(document); err != nil {
		return fmt.Errorf("validate report: %w", err)
	}
	if _, err := os.Lstat(target); err == nil {
		return errors.New("report target already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect report target: %w", err)
	}
	data, err := marshalDocument(document)
	if err != nil {
		return fmt.Errorf("encode report: %w", err)
	}
	directory := filepath.Dir(target)
	temporary, err := w.ops.CreateTemp(directory, ".gate3-report-*")
	if err != nil {
		return fmt.Errorf("create report temporary file: %w", err)
	}
	tempPath := temporary.Name()
	cleanupBeforePublish := func(primary error) error {
		closeErr := temporary.Close()
		removeErr := w.ops.Remove(tempPath)
		return errors.Join(primary, closeErr, removeErr)
	}
	if err := w.ops.Chmod(tempPath, 0o600); err != nil {
		return cleanupBeforePublish(fmt.Errorf("chmod report temporary file: %w", err))
	}
	if _, err := temporary.Write(data); err != nil {
		return cleanupBeforePublish(fmt.Errorf("write report temporary file: %w", err))
	}
	if err := temporary.Sync(); err != nil {
		return cleanupBeforePublish(fmt.Errorf("sync report temporary file: %w", err))
	}
	if err := temporary.Close(); err != nil {
		_ = w.ops.Remove(tempPath)
		return fmt.Errorf("close report temporary file: %w", err)
	}
	if err := w.ops.Link(tempPath, target); err != nil {
		removeErr := w.ops.Remove(tempPath)
		return errors.Join(fmt.Errorf("link report target: %w", err), removeErr)
	}
	if err := w.ops.Remove(tempPath); err != nil {
		return &PublishError{Target: target, TempPath: tempPath, Err: fmt.Errorf("unlink temporary file: %w", err)}
	}
	directoryFile, err := w.ops.Open(directory)
	if err != nil {
		return &PublishError{Target: target, TempPath: tempPath, Err: fmt.Errorf("open report directory: %w", err)}
	}
	syncErr := directoryFile.Sync()
	closeErr := directoryFile.Close()
	if err := errors.Join(syncErr, closeErr); err != nil {
		return &PublishError{Target: target, TempPath: tempPath, Err: fmt.Errorf("sync report directory: %w", err)}
	}
	return nil
}
