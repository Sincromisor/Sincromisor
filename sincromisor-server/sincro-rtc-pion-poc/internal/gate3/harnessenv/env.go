package harnessenv

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

const (
	goBinaryEnv       = "SINCRO_GATE3_GO_BINARY"
	nodeBinaryEnv     = "SINCRO_GATE3_NODE_BINARY"
	chromiumBinaryEnv = "SINCRO_GATE3_CHROMIUM_BINARY"
	consulBinaryEnv   = "SINCRO_GATE3_CONSUL_BINARY"
	ffmpegBinaryEnv   = "SINCRO_GATE3_FFMPEG_BINARY"
)

// Input は検査済みの Gate 3 入力を成果物へ転記するための値である。
//
// Path は symlink 解決後の絶対 path、Version は probe の完全な先頭行である。
// repository 所有 file だけ SHA256 が設定され、実行 file と directory では nil になる。
type Input struct {
	Name    string
	Path    string
	Version string
	SHA256  *string
}

// Tool は検査済みの外部実行 file と version probe の結果である。
//
// Path は絶対 path かつ通常 fileで、Load 完了時点で実行可能である。
type Tool struct {
	Path    string
	Version string
}

// Environment は Gate 3 全体で共有する検査済み入力である。
//
// 値は immutable として扱う。後続処理は各 Tool.Path を exec の Path に直接指定し、
// PATH による再解決を行わない。
type Environment struct {
	RepositoryRoot string
	ModuleRoot     string
	FrontendDist   string
	AudioFixture   string
	Go             Tool
	Node           Tool
	Chromium       Tool
	Consul         Tool
	FFmpeg         Tool
	Inputs         []Input
}

type commandRunner func(context.Context, string, ...string) ([]byte, error)

// Load は module の配置と5つの環境変数から Gate 3 の全入力を一括検査する。
//
// 一件でも未設定、相対 path、欠落、権限不備、version 不整合があれば部分的な
// Environment を返さない。外部 process は version probe の間だけ起動する。
func Load(ctx context.Context) (Environment, error) {
	moduleRoot, err := discoverModuleRoot()
	if err != nil {
		return Environment{}, err
	}
	return load(ctx, moduleRoot, os.Getenv, runCommand)
}

func load(
	ctx context.Context,
	moduleRoot string,
	getenv func(string) string,
	run commandRunner,
) (Environment, error) {
	moduleRoot, err := validateAbsoluteDirectory("module root", moduleRoot)
	if err != nil {
		return Environment{}, err
	}
	repositoryRoot, err := validateOwnedPath(
		"repository root",
		filepath.Clean(filepath.Join(moduleRoot, "..", "..")),
		filepath.Clean(filepath.Join(moduleRoot, "..", "..")),
		true,
	)
	if err != nil {
		return Environment{}, err
	}
	frontendDist, err := validateOwnedPath(
		"frontend dist",
		filepath.Join(repositoryRoot, "sincromisor-frontend", "dist"),
		repositoryRoot,
		true,
	)
	if err != nil {
		return Environment{}, err
	}
	audioFixture, err := validateOwnedPath(
		"audio fixture",
		filepath.Join(moduleRoot, "internal", "gate3", "testdata", "gate3-input.wav"),
		repositoryRoot,
		false,
	)
	if err != nil {
		return Environment{}, err
	}
	audioSHA, err := hashFile(audioFixture)
	if err != nil {
		return Environment{}, fmt.Errorf("hash audio fixture: %w", err)
	}
	requiredGoVersion, err := moduleGoVersion(filepath.Join(moduleRoot, "go.mod"))
	if err != nil {
		return Environment{}, err
	}

	goTool, err := inspectTool(ctx, getenv, run, goBinaryEnv, []string{"version"}, func(line string) error {
		return matchGoVersion(line, requiredGoVersion)
	})
	if err != nil {
		return Environment{}, err
	}
	nodeTool, err := inspectTool(ctx, getenv, run, nodeBinaryEnv, []string{"--version"}, requireNode18)
	if err != nil {
		return Environment{}, err
	}
	chromiumTool, err := inspectTool(ctx, getenv, run, chromiumBinaryEnv, []string{"--version"}, requireNonEmpty)
	if err != nil {
		return Environment{}, err
	}
	consulTool, err := inspectTool(ctx, getenv, run, consulBinaryEnv, []string{"version"}, requireNonEmpty)
	if err != nil {
		return Environment{}, err
	}
	ffmpegTool, err := inspectTool(ctx, getenv, run, ffmpegBinaryEnv, []string{"-version"}, requireNonEmpty)
	if err != nil {
		return Environment{}, err
	}

	inputs := []Input{
		{Name: "repository_root", Path: repositoryRoot, Version: "repository"},
		{Name: "frontend_dist", Path: frontendDist, Version: "vite-dist"},
		{Name: "audio_fixture", Path: audioFixture, Version: "wav", SHA256: &audioSHA},
		{Name: "go", Path: goTool.Path, Version: goTool.Version},
		{Name: "node", Path: nodeTool.Path, Version: nodeTool.Version},
		{Name: "chromium", Path: chromiumTool.Path, Version: chromiumTool.Version},
		{Name: "consul", Path: consulTool.Path, Version: consulTool.Version},
		{Name: "ffmpeg", Path: ffmpegTool.Path, Version: ffmpegTool.Version},
	}
	return Environment{
		RepositoryRoot: repositoryRoot,
		ModuleRoot:     moduleRoot,
		FrontendDist:   frontendDist,
		AudioFixture:   audioFixture,
		Go:             goTool,
		Node:           nodeTool,
		Chromium:       chromiumTool,
		Consul:         consulTool,
		FFmpeg:         ffmpegTool,
		Inputs:         inputs,
	}, nil
}

// 検査工程は path の静的条件を先に確定し、その後だけ version process を起動する。
// これにより相対 path や実行権限不備を「probe 失敗」という曖昧な分類へ落とさない。
func inspectTool(
	ctx context.Context,
	getenv func(string) string,
	run commandRunner,
	envName string,
	args []string,
	validateVersion func(string) error,
) (Tool, error) {
	raw := getenv(envName)
	if raw == "" {
		return Tool{}, fmt.Errorf("%s is not set", envName)
	}
	path, err := validateExecutable(envName, raw)
	if err != nil {
		return Tool{}, err
	}
	output, err := run(ctx, path, args...)
	if err != nil {
		return Tool{}, fmt.Errorf("probe %s: %w", envName, err)
	}
	line := firstLine(output)
	if err := validateVersion(line); err != nil {
		return Tool{}, fmt.Errorf("validate %s version: %w", envName, err)
	}
	return Tool{Path: path, Version: line}, nil
}
