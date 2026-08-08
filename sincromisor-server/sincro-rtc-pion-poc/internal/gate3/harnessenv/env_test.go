package harnessenv

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestLoadValidatesAllInputsAndVersions(t *testing.T) {
	moduleRoot, environment := makeEnvironmentFixture(t)
	var probes []string
	runner := func(_ context.Context, path string, args ...string) ([]byte, error) {
		probes = append(probes, filepath.Base(path)+" "+strings.Join(args, " "))
		switch filepath.Base(path) {
		case "go":
			return []byte("go version go1.26.9 linux/amd64\n"), nil
		case "node":
			return []byte("v18.20.0\n"), nil
		case "chromium":
			return []byte("Chromium 140.0\n"), nil
		case "consul":
			return []byte("Consul v1.21.0\nextra\n"), nil
		case "ffmpeg":
			return []byte("ffmpeg version 7.0\n"), nil
		default:
			return nil, errors.New("unexpected executable")
		}
	}
	got, err := load(context.Background(), moduleRoot, mapLookup(environment), runner)
	if err != nil {
		t.Fatalf("load() error = %v", err)
	}
	if !filepath.IsAbs(got.RepositoryRoot) || !filepath.IsAbs(got.FrontendDist) ||
		!filepath.IsAbs(got.AudioFixture) || !filepath.IsAbs(got.PlaywrightCLI) || len(got.Inputs) != 9 {
		t.Fatalf("environment paths/inputs = %+v", got)
	}
	if got.Inputs[2].SHA256 == nil || len(*got.Inputs[2].SHA256) != 64 {
		t.Fatalf("audio SHA256 = %v", got.Inputs[2].SHA256)
	}
	wantProbes := []string{
		"go version", "node --version", "chromium --version", "consul version", "ffmpeg -version",
	}
	if !slices.Equal(probes, wantProbes) {
		t.Fatalf("probes = %v, want %v", probes, wantProbes)
	}
}

func TestLoadRejectsMissingPlaywrightCLIBeforeVersionProbes(t *testing.T) {
	moduleRoot, environment := makeEnvironmentFixture(t)
	playwrightCLI := filepath.Join(filepath.Dir(filepath.Dir(moduleRoot)), "node_modules", "@playwright", "test", "cli.js")
	if err := os.Remove(playwrightCLI); err != nil {
		t.Fatal(err)
	}
	_, err := load(context.Background(), moduleRoot, mapLookup(environment), func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		t.Fatal("version probe ran before Playwright CLI validation")
		return nil, nil
	})
	if err == nil || !strings.Contains(err.Error(), "resolve Playwright CLI") {
		t.Fatalf("load() error = %v, want missing Playwright CLI", err)
	}
}

func TestLoadRejectsInvalidBoundaryInputs(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*testing.T, string, map[string]string)
		want   string
	}{
		{
			name: "missing environment",
			mutate: func(_ *testing.T, _ string, env map[string]string) {
				delete(env, chromiumBinaryEnv)
			},
			want: chromiumBinaryEnv + " is not set",
		},
		{
			name: "relative executable",
			mutate: func(_ *testing.T, _ string, env map[string]string) {
				env[nodeBinaryEnv] = "node"
			},
			want: "must be an absolute path",
		},
		{
			name: "not executable",
			mutate: func(t *testing.T, _ string, env map[string]string) {
				t.Helper()
				if err := os.Chmod(env[consulBinaryEnv], 0o600); err != nil {
					t.Fatal(err)
				}
			},
			want: "is not executable",
		},
		{
			name: "owned symlink outside repository",
			mutate: func(t *testing.T, moduleRoot string, _ map[string]string) {
				t.Helper()
				audio := filepath.Join(moduleRoot, "internal", "gate3", "testdata", "gate3-input.wav")
				if err := os.Remove(audio); err != nil {
					t.Fatal(err)
				}
				outside := filepath.Join(t.TempDir(), "outside.wav")
				if err := os.WriteFile(outside, []byte("audio"), 0o600); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(outside, audio); err != nil {
					t.Fatal(err)
				}
			},
			want: "resolves outside repository",
		},
		{
			name:   "go mismatch",
			mutate: func(_ *testing.T, _ string, _ map[string]string) {},
			want:   "go major/minor mismatch",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			moduleRoot, environment := makeEnvironmentFixture(t)
			test.mutate(t, moduleRoot, environment)
			runner := validProbeRunner
			if test.name == "go mismatch" {
				runner = func(_ context.Context, path string, args ...string) ([]byte, error) {
					if filepath.Base(path) == "go" {
						return []byte("go version go1.25.1 linux/amd64"), nil
					}
					return validProbeRunner(context.Background(), path, args...)
				}
			}
			_, err := load(context.Background(), moduleRoot, mapLookup(environment), runner)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("load() error = %v, want containing %q", err, test.want)
			}
		})
	}
}

func TestValidatedGoPathBuildsAndRerunsEvidence(t *testing.T) {
	moduleRoot, environment := makeEnvironmentFixture(t)
	record := filepath.Join(t.TempDir(), "argv")
	goPath := environment[goBinaryEnv]
	script := "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$GATE3_ARGV_RECORD\"\n"
	if err := os.WriteFile(goPath, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	loaded, err := load(context.Background(), moduleRoot, mapLookup(environment), validProbeRunner)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("GATE3_ARGV_RECORD", record)
	output := filepath.Join(t.TempDir(), "pion-poc")
	if _, err := loaded.BuildPion(context.Background(), output); err != nil {
		t.Fatalf("BuildPion() error = %v", err)
	}
	command := loaded.GoCommand(context.Background(), "test", "-run", "HarnessContract", "./cmd/pion-poc")
	if command.Path != goPath {
		t.Fatalf("test command path = %q, want %q", command.Path, goPath)
	}
	if err := command.Run(); err != nil {
		t.Fatalf("evidence command error = %v", err)
	}
	data, err := os.ReadFile(record)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 ||
		lines[0] != "build -trimpath -o "+output+" ./cmd/pion-poc" ||
		lines[1] != "test -run HarnessContract ./cmd/pion-poc" {
		t.Fatalf("recorded argv = %q", lines)
	}
}

func TestDiscoverModuleRootWalksFromGoTestPackageDirectory(t *testing.T) {
	moduleRoot, _ := makeEnvironmentFixture(t)
	nested := filepath.Join(moduleRoot, "internal", "gate3", "harnessenv")
	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Chdir(nested)
	got, err := discoverModuleRoot()
	if err != nil {
		t.Fatal(err)
	}
	if got != moduleRoot {
		t.Fatalf("module root = %q, want %q", got, moduleRoot)
	}
}

func makeEnvironmentFixture(t *testing.T) (string, map[string]string) {
	t.Helper()
	repository := t.TempDir()
	moduleRoot := filepath.Join(repository, "sincromisor-server", "sincro-rtc-pion-poc")
	for _, directory := range []string{
		filepath.Join(repository, "sincromisor-frontend", "dist"),
		filepath.Join(moduleRoot, "internal", "gate3", "testdata"),
		filepath.Join(repository, "node_modules", "@playwright", "test"),
		filepath.Join(repository, "bin"),
	} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(moduleRoot, "go.mod"), []byte("module fixture\n\ngo 1.26.5\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(moduleRoot, "internal", "gate3", "testdata", "gate3-input.wav"),
		[]byte("audio"),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(repository, "node_modules", "@playwright", "test", "cli.js"),
		[]byte("playwright CLI"),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	environment := make(map[string]string)
	for envName, name := range map[string]string{
		goBinaryEnv: "go", nodeBinaryEnv: "node", chromiumBinaryEnv: "chromium",
		consulBinaryEnv: "consul", ffmpegBinaryEnv: "ffmpeg",
	} {
		path := filepath.Join(repository, "bin", name)
		if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o700); err != nil {
			t.Fatal(err)
		}
		environment[envName] = path
	}
	return moduleRoot, environment
}

func mapLookup(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func validProbeRunner(_ context.Context, path string, _ ...string) ([]byte, error) {
	switch filepath.Base(path) {
	case "go":
		return []byte("go version go1.26.5 linux/amd64"), nil
	case "node":
		return []byte("v24.0.0"), nil
	default:
		return []byte(filepath.Base(path) + " version 1"), nil
	}
}
