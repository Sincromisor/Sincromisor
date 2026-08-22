package harnessenv

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
)

// GoCommand は検査済み Go binary を Path に固定した command を作る。
//
// Args は go subcommand から始める。返した command は環境を継承するが、実行 file の
// PATH 探索は行わない。Dir は検査済み module root に固定される。
func (e Environment) GoCommand(ctx context.Context, args ...string) *exec.Cmd {
	command := exec.CommandContext(ctx, e.Go.Path, args...)
	command.Dir = e.ModuleRoot
	return command
}

// BuildPion は検査済み Go binary だけを使って cmd/sincro-rtc を build する。
//
// outputPath は絶対 path でなければならず、親 directory は caller が用意する。
// build の stdout と stderr は診断用に結合して返す。
func (e Environment) BuildPion(ctx context.Context, outputPath string) ([]byte, error) {
	if !filepath.IsAbs(outputPath) {
		return nil, fmt.Errorf("Pion build output must be an absolute path")
	}
	command := e.GoCommand(ctx, "build", "-trimpath", "-o", outputPath, "./cmd/sincro-rtc")
	output, err := command.CombinedOutput()
	if err != nil {
		return output, fmt.Errorf("build sincro-rtc: %w", err)
	}
	return output, nil
}

func runCommand(ctx context.Context, path string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, path, args...).CombinedOutput()
}
