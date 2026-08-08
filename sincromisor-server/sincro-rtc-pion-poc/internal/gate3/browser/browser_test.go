//go:build gate3

// Package browser は現行Frontend、4契約service、Consul、Pion、Playwrightを1つの試験生存期間で調停する。
package browser

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/gate3/consuldev"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/gate3/harnessenv"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/gate3/pipelinecontract"
	gateprocess "github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/gate3/process"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/gate3/resources"
	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/discovery"
)

const (
	readinessTimeout = 15 * time.Second
	// buildTimeout はcold module cacheでのPion compileを受理しつつ、toolchain停滞を有限にする。
	// 変更時はempty GOCACHE/GOMODCACHEとwarm cacheの両方でBuildPionを確認する。
	buildTimeout = 60 * time.Second
	// playwrightTimeout はspec全体の180秒にrunner終了用の10秒を加えたGo側所有期限である。
	// 短縮するとspec timeoutとWaitがraceしてreporterの失敗診断を失う。
	playwrightTimeout = 190 * time.Second
	cleanupTimeout    = 10 * time.Second
)

// TestFrontendBrowserHarness はproductionと同じsame-origin経路で2 turnとICE restartを確認する。
//
// この試験が最上位ownerとなり、起動と逆順cleanupの全失敗をtesting.Tへ集約する。
func TestFrontendBrowserHarness(t *testing.T) {
	loadCtx, cancelLoad := context.WithTimeout(context.Background(), readinessTimeout)
	defer cancelLoad()
	environment, err := harnessenv.Load(loadCtx)
	if err != nil {
		t.Fatalf("load Gate 3 environment: %v", err)
	}
	contracts := startContracts(t, environment)
	startConsul(t, environment, contracts.Addresses())
	baseURL, pion := startPion(t, environment)
	pionPID, err := pion.PID()
	if err != nil {
		t.Fatalf("read Pion PID: %v", err)
	}
	sampler, err := resources.NewSampler(resources.Config{
		PID:        pionPID,
		ProcRoot:   "/proc",
		MetricsURL: baseURL + "/metrics",
		StatusURL:  baseURL + "/api/v1/RTCSignalingServer/statuses",
	})
	if err != nil {
		t.Fatalf("create resource sampler: %v", err)
	}
	// readiness後かつbrowser session開始前の3 sampleだけをbaselineにし、
	// Playwright終了後もPionを生存させたまま同じ境界で収束を判定する。
	baselineCtx, cancelBaseline := context.WithTimeout(context.Background(), readinessTimeout)
	baseline, baselineSamples, err := sampler.CaptureBaseline(baselineCtx)
	cancelBaseline()
	if err != nil {
		t.Fatalf("capture resource baseline: %v", err)
	}
	t.Logf("resource baseline: %+v; samples=%+v", baseline, baselineSamples)
	runPlaywright(t, environment, baseURL, pion, contracts)
	convergenceSamples, err := sampler.WaitForConvergence(context.Background(), baseline)
	if err != nil {
		t.Fatalf("wait for resource convergence: %v; samples=%+v", err, convergenceSamples)
	}
	t.Logf("resource convergence samples: %+v", convergenceSamples)
	if err := contracts.Verify(); err != nil {
		t.Fatalf("pipeline contract: %v; transcript=%+v", err, contracts.Transcript())
	}
	verifyTranscript(t, contracts.Transcript())
}

// startContracts は最初に4契約serviceを起動し、最後のcleanupを登録する。
func startContracts(t *testing.T, environment harnessenv.Environment) *pipelinecontract.Set {
	t.Helper()
	fixtures := filepath.Join(environment.ModuleRoot, "internal", "pipeline", "protocol", "testdata")
	contracts, err := pipelinecontract.New(pipelinecontract.Config{
		FixturesDir: fixtures, ListenHost: "127.0.0.1", MaxSpeechResults: 2,
	})
	if err != nil {
		t.Fatalf("start contract services: %v", err)
	}
	t.Cleanup(func() { closeContracts(t, contracts) })
	return contracts
}

// startConsul は契約serviceを登録し、Pionより後で契約serviceより先に停止する。
func startConsul(t *testing.T, environment harnessenv.Environment, services map[discovery.Service]discovery.Endpoint) {
	t.Helper()
	agent, err := consuldev.Start(consuldev.Config{
		Binary: environment.Consul.Path, WorkDir: t.TempDir(), Services: services,
	})
	if err != nil {
		t.Fatalf("start Consul: %v", err)
	}
	t.Cleanup(func() { closeConsul(t, agent) })
}

// startPion は検査済みbinaryをbuildし、same-origin HTTPのreadiness後にbase URLを返す。
func startPion(t *testing.T, environment harnessenv.Environment) (string, *gateprocess.Owner) {
	t.Helper()
	pionBinary := filepath.Join(t.TempDir(), "pion-poc")
	buildCtx, cancelBuild := context.WithTimeout(context.Background(), buildTimeout)
	output, err := environment.BuildPion(buildCtx, pionBinary)
	cancelBuild()
	if err != nil {
		t.Fatalf("build Pion: %v: %s", err, output)
	}
	baseURL, address := unusedLoopbackURL(t)
	pion := gateprocess.New(gateprocess.Command{
		Path: pionBinary,
		Args: []string{"--http", address, "--frontend-dir", environment.FrontendDist, "--ffmpeg", environment.FFmpeg.Path},
		Env:  os.Environ(), Dir: environment.ModuleRoot,
	})
	if err := pion.Start(); err != nil {
		t.Fatalf("start Pion: %v", err)
	}
	t.Cleanup(func() { closePion(t, pion) })
	waitPionReady(t, baseURL, pion)
	return baseURL, pion
}

// runPlaywright はChromiumとpage/contextの所有をPlaywrightに委ね、終了codeをそのまま合否にする。
func runPlaywright(
	t *testing.T,
	environment harnessenv.Environment,
	baseURL string,
	pion *gateprocess.Owner,
	contracts *pipelinecontract.Set,
) {
	t.Helper()
	playwright := gateprocess.New(gateprocess.Command{
		Path: environment.Node.Path,
		Args: []string{environment.PlaywrightCLI, "test", "--config", filepath.Join(environment.RepositoryRoot, "playwright.gate3.config.ts")},
		Env: append(os.Environ(),
			"SINCRO_GATE3_BASE_URL="+baseURL,
			"SINCRO_GATE3_CHROMIUM_BINARY="+environment.Chromium.Path,
			"SINCRO_GATE3_AUDIO_FIXTURE="+environment.AudioFixture,
		),
		Dir: environment.RepositoryRoot,
	})
	if err := playwright.Start(); err != nil {
		t.Fatalf("start Playwright: %v", err)
	}
	t.Cleanup(func() { closeProcess(t, "Playwright", playwright) })
	waitCtx, cancelWait := context.WithTimeout(context.Background(), playwrightTimeout)
	result, waitErr := playwright.Wait(waitCtx)
	cancelWait()
	if waitErr != nil {
		result, closeErr := playwright.Close()
		pionResult, pionErr := stopPion(pion)
		t.Fatalf("Playwright wait failed: %v; close=%v; exit=%d\nstdout:\n%s\nstderr:\n%s\nPion: %v; exit=%d\nstdout:\n%s\nstderr:\n%s\nPCM: %+v\ncontract verify: %v\ntranscript: %+v", waitErr, closeErr, result.ExitCode, result.Stdout.Data, result.Stderr.Data, pionErr, pionResult.ExitCode, pionResult.Stdout.Data, pionResult.Stderr.Data, contracts.PCMStats(), contracts.Verify(), contracts.Transcript())
	}
	if result.ExitCode != 0 {
		pionResult, pionErr := stopPion(pion)
		t.Fatalf("Playwright failed: exit=%d\nstdout:\n%s\nstderr:\n%s\nPion: %v; exit=%d\nstdout:\n%s\nstderr:\n%s\nPCM: %+v\ncontract verify: %v\ntranscript: %+v", result.ExitCode, result.Stdout.Data, result.Stderr.Data, pionErr, pionResult.ExitCode, pionResult.Stdout.Data, pionResult.Stderr.Data, contracts.PCMStats(), contracts.Verify(), contracts.Transcript())
	}
}

func unusedLoopbackURL(t *testing.T) (string, string) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	return "http://" + address, address
}

func waitPionReady(t *testing.T, baseURL string, owner *gateprocess.Owner) {
	t.Helper()
	client := &http.Client{Timeout: time.Second}
	deadline := time.Now().Add(readinessTimeout)
	for time.Now().Before(deadline) {
		if owner.State() == gateprocess.StateExited {
			result, err := owner.Wait(context.Background())
			t.Fatalf("Pion exited before readiness: %v; stderr=%s", err, result.Stderr.Data)
		}
		response, err := client.Get(baseURL + "/api/v1/RTCSignalingServer/statuses")
		if err == nil {
			body, readErr := io.ReadAll(io.LimitReader(response.Body, 4096))
			closeErr := response.Body.Close()
			if response.StatusCode == http.StatusOK && readErr == nil && closeErr == nil &&
				containsReady(body) {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("Pion readiness timed out")
}

func containsReady(body []byte) bool {
	var status struct {
		Ready bool `json:"ready"`
	}
	return json.Unmarshal(body, &status) == nil && status.Ready
}

func verifyTranscript(t *testing.T, transcript pipelinecontract.Transcript) {
	t.Helper()
	if len(transcript.Entries) != 8 {
		t.Fatalf("transcript entries = %d, want 8", len(transcript.Entries))
	}
	firstSession := transcript.Entries[0].SessionID
	firstSequence := transcript.Entries[0].SequenceID
	for index, entry := range transcript.Entries {
		wantService := []discovery.Service{
			discovery.ServiceExtractor, discovery.ServiceRecognizer,
			discovery.ServiceProcessor, discovery.ServiceSynthesizer,
		}[index%4]
		if entry.Ordinal != index+1 || entry.Service != wantService || entry.SessionID != firstSession ||
			entry.SequenceID != firstSequence+int64(index/4) {
			t.Fatalf("transcript[%d] = %+v", index, entry)
		}
		if entry.Service == discovery.ServiceSynthesizer && !entry.ByteIdentical {
			t.Fatalf("transcript[%d] lost processor bytes", index)
		}
	}
}

func closeProcess(t *testing.T, name string, owner *gateprocess.Owner) {
	t.Helper()
	result, err := owner.Close()
	if err != nil {
		t.Errorf("close %s: %v; stderr=%s", name, err, result.Stderr.Data)
	}
}

// closePion はproductionの1秒admission windowを短縮せずSIGTERM後最大10秒joinする。
// 期限切れ時だけOwner.CloseのSIGKILL fallbackへ進み、子processを残さない。
func closePion(t *testing.T, owner *gateprocess.Owner) {
	t.Helper()
	result, err := stopPion(owner)
	if err != nil || result.ExitCode != 0 {
		t.Errorf("close Pion: %v; exit=%d; stderr=%s", err, result.ExitCode, result.Stderr.Data)
	}
}

// stopPion は診断が必要な失敗経路でも同じgraceful joinと最終fallbackを使う。
func stopPion(owner *gateprocess.Owner) (gateprocess.Result, error) {
	var signalErr error
	if owner.State() == gateprocess.StateRunning {
		if err := owner.Signal(syscall.SIGTERM); err != nil {
			signalErr = fmt.Errorf("signal Pion: %w", err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), cleanupTimeout)
	defer cancel()
	result, err := owner.Wait(ctx)
	if err == nil && result.ExitCode == 0 {
		return result, signalErr
	}
	if !errors.Is(err, gateprocess.ErrWaitTimeout) {
		return result, errors.Join(signalErr, err)
	}
	result, closeErr := owner.Close()
	return result, errors.Join(signalErr, err, closeErr)
}

func closeConsul(t *testing.T, agent *consuldev.Agent) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), cleanupTimeout)
	defer cancel()
	if err := agent.Close(ctx); err != nil {
		t.Errorf("close Consul: %v", err)
	}
}

func closeContracts(t *testing.T, contracts *pipelinecontract.Set) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), cleanupTimeout)
	defer cancel()
	if err := contracts.Close(ctx); err != nil {
		t.Errorf("close contract services: %v", err)
	}
}
