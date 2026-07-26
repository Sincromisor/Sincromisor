// Package config は Pion PoC の起動時設定を flag から検証済みの値へ変換する。
package config

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

const defaultGatherTimeout = 5 * time.Second

// Config は HTTP、static 配信、ICE に必要な起動時設定を保持する。
//
// Load が path と URL を検証するため、下流 package は filesystem や URL の再検証を行わない。
// production compose、Consul、TURN の設定はこの PoC の対象外である。
type Config struct {
	HTTPAddress   string
	FrontendDir   string
	STUNURL       string
	GatherTimeout time.Duration
}

// Load は command line flag を解析し、起動前に有限 timeout とローカル実行境界を検証する。
//
// args に未知 flag、不正な listen address、存在しない static directory、STUN 以外の URL がある場合は
// error を返す。process の終了判断と user-facing error の出力は main に委ねる。
func Load(args []string) (Config, error) {
	flags := flag.NewFlagSet("pion-poc", flag.ContinueOnError)
	var cfg Config
	flags.StringVar(&cfg.HTTPAddress, "http", "127.0.0.1:8080", "HTTP listen address")
	flags.StringVar(&cfg.FrontendDir, "frontend-dir", "", "built frontend directory")
	flags.StringVar(&cfg.STUNURL, "stun", "", "optional STUN URL")
	flags.DurationVar(&cfg.GatherTimeout, "gather-timeout", defaultGatherTimeout, "ICE gathering timeout")
	if err := flags.Parse(args); err != nil {
		return Config{}, fmt.Errorf("parse flags: %w", err)
	}
	if flags.NArg() != 0 {
		return Config{}, fmt.Errorf("unexpected positional arguments: %v", flags.Args())
	}
	if _, err := net.ResolveTCPAddr("tcp", cfg.HTTPAddress); err != nil {
		return Config{}, fmt.Errorf("invalid http address: %w", err)
	}
	if cfg.GatherTimeout <= 0 {
		return Config{}, errors.New("gather-timeout must be positive")
	}
	if cfg.FrontendDir == "" {
		return Config{}, errors.New("frontend-dir is required")
	}
	absoluteDir, err := filepath.Abs(cfg.FrontendDir)
	if err != nil {
		return Config{}, fmt.Errorf("resolve frontend-dir: %w", err)
	}
	info, err := os.Stat(absoluteDir)
	if err != nil {
		return Config{}, fmt.Errorf("inspect frontend-dir: %w", err)
	}
	if !info.IsDir() {
		return Config{}, errors.New("frontend-dir must be a directory")
	}
	cfg.FrontendDir = absoluteDir
	if cfg.STUNURL != "" {
		parsed, parseErr := url.Parse(cfg.STUNURL)
		if parseErr != nil || parsed.Scheme != "stun" || (parsed.Host == "" && parsed.Opaque == "") {
			return Config{}, errors.New("stun must be a valid stun: URL")
		}
	}
	return cfg, nil
}
