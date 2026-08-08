package harnessenv

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var goVersionPattern = regexp.MustCompile(`\bgo([0-9]+)\.([0-9]+)(?:\.[0-9]+)?\b`)

func validateExecutable(name, path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%s must be an absolute path", name)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", name, err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat %s: %w", name, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s must resolve to a regular file", name)
	}
	if info.Mode().Perm()&0o111 == 0 {
		return "", fmt.Errorf("%s is not executable", name)
	}
	return resolved, nil
}

func validateAbsoluteDirectory(name, path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%s must be an absolute path", name)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", name, err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat %s: %w", name, err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%s must be a directory", name)
	}
	return resolved, nil
}

// Playwright CLIは共有package cacheへのsymlink配置を許可するため、repository所有権ではなく
// 解決先が通常fileであることだけを外部process起動前に確定する。
func validateRegularFile(name, path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%s must be an absolute path", name)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", name, err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat %s: %w", name, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s must resolve to a regular file", name)
	}
	return resolved, nil
}

func validateOwnedPath(name, path, repositoryRoot string, directory bool) (string, error) {
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%s must be an absolute path", name)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", name, err)
	}
	relative, err := filepath.Rel(repositoryRoot, resolved)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("%s resolves outside repository", name)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat %s: %w", name, err)
	}
	if directory && !info.IsDir() {
		return "", fmt.Errorf("%s must be a directory", name)
	}
	if !directory && !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s must be a regular file", name)
	}
	return resolved, nil
}

func moduleGoVersion(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read go.mod: %w", err)
	}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == "go" {
			return fields[1], nil
		}
	}
	return "", errors.New("go.mod is missing go directive")
}

func matchGoVersion(line, required string) error {
	got := goVersionPattern.FindStringSubmatch(line)
	want := goVersionPattern.FindStringSubmatch("go" + required)
	if len(got) < 3 || len(want) < 3 || got[1] != want[1] || got[2] != want[2] {
		return fmt.Errorf("go major/minor mismatch: got %q, want %s", line, required)
	}
	return nil
}

func requireNode18(line string) error {
	version := strings.TrimPrefix(strings.TrimSpace(line), "v")
	majorText, _, _ := strings.Cut(version, ".")
	major, err := strconv.Atoi(majorText)
	if err != nil || major < 18 {
		return fmt.Errorf("Node.js 18 or newer is required: got %q", line)
	}
	return nil
}

func requireNonEmpty(line string) error {
	if strings.TrimSpace(line) == "" {
		return errors.New("version output first line is empty")
	}
	return nil
}

func firstLine(output []byte) string {
	line, _, _ := strings.Cut(strings.ReplaceAll(string(output), "\r\n", "\n"), "\n")
	return strings.TrimSpace(line)
}

func hashFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func discoverModuleRoot() (string, error) {
	current, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("resolve working directory: %w", err)
	}
	for {
		if info, statErr := os.Stat(filepath.Join(current, "go.mod")); statErr == nil && info.Mode().IsRegular() {
			return filepath.Abs(current)
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", errors.New("find module root from working directory")
		}
		current = parent
	}
}
