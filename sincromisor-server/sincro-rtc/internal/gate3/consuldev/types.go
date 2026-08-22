package consuldev

import (
	"errors"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/discovery"
)

var (
	// ErrProtocol は不正な service set、host、port、path を分類する。
	ErrProtocol = errors.New("consul development protocol violation")
	// ErrPortInUse は Start 前から 127.0.0.1:8500 が所有されていたことを表す。
	ErrPortInUse = errors.New("consul development port is in use")
	// ErrProcess は child 起動失敗または readiness 前終了を分類する。
	ErrProcess = errors.New("consul development process failure")
	// ErrReadiness は leader probe の status、decode、timeout failure を分類する。
	ErrReadiness = errors.New("consul development readiness failure")
	// ErrRegistration は service 登録 HTTP failure を分類する。
	ErrRegistration = errors.New("consul development registration failure")
	// ErrCleanup は登録解除または child owner cleanup failure を分類する。
	ErrCleanup = errors.New("consul development cleanup failure")
)

const (
	// ExtractorServiceID は harness が所有する固定登録 ID である。
	ExtractorServiceID = "gate3-speech-extractor"
	// RecognizerServiceID は harness が所有する固定登録 ID である。
	RecognizerServiceID = "gate3-speech-recognizer"
	// ProcessorServiceID は harness が所有する固定登録 ID である。
	ProcessorServiceID = "gate3-text-processor"
	// SynthesizerServiceID は harness が所有する固定登録 ID である。
	SynthesizerServiceID = "gate3-voice-synthesizer"
)

// Config は1つの Consul executable、working directory、登録する4 service endpoint を指定する。
type Config struct {
	// Binary は検査済み Consul executable の絶対 path である。
	Binary string
	// WorkDir は child の絶対 working directory である。
	WorkDir string
	// Services は固定名4件に対応する 127.0.0.1 service endpoint である。
	Services map[discovery.Service]discovery.Endpoint

	// testOptions は package内試験だけが既存8500番Consulを避けるために使う。
	// 外部 package から設定不能なので公開 Start の固定 address / timeout 契約へ影響しない。
	testOptions *startOptions
}
