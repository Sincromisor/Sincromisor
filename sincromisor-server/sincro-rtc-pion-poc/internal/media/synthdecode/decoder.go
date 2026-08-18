package synthdecode

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"mime"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc-pion-poc/internal/pipeline/protocol"
)

const (
	outputSampleRate  = 48_000
	maxEncodedBytes   = 8 * 1024 * 1024
	maxDecodedSeconds = 120
	maxDecodedSamples = outputSampleRate * maxDecodedSeconds
	maxPCMBytes       = maxDecodedSamples * 2
	decodeTimeout     = 5 * time.Second
	maxStderrBytes    = 64 * 1024
	speakingTolerance = 960
	versionProbeLimit = 64 * 1024
)

var ffmpegVersionPattern = regexp.MustCompile(`(?m)^ffmpeg version ([0-9]+)\.([0-9]+)(?:\.[0-9]+)?`)

// ErrorKind は DecodeError の安定した失敗分類である。
type ErrorKind string

const (
	// ErrorUnsupported は許可matrix外のMIME typeを表す。
	ErrorUnsupported ErrorKind = "unsupported"
	// ErrorInvalid は空、非finite timing、壊れたPCM表現などの入力不正を表す。
	ErrorInvalid ErrorKind = "invalid"
	// ErrorLimit はencoded byte数、decoded sample数、発話時間の上限超過を表す。
	ErrorLimit ErrorKind = "limit"
	// ErrorTimeout はDecoder自身の5秒deadline超過を表す。
	ErrorTimeout ErrorKind = "timeout"
	// ErrorProcess はFFmpegの起動またはcontainer/codec decode失敗を表す。
	ErrorProcess ErrorKind = "process"
)

// DecodeError は合成音声decodeの失敗分類と診断可能な原因を保持する。
//
// ErrorKindはcallerの破棄・観測判断に使い、Causeには音声payloadを含めない。
type DecodeError struct {
	// Kind はcallerがpayload破棄と観測を決める安定分類である。
	Kind ErrorKind
	// Reason はinvalid入力の有限な診断分類であり、未分類の失敗は空文字列である。
	Reason string
	// Cause はcontext cancellationやprocess/validation診断を保持し、payload byteは含めない。
	Cause error
}

// Error はpayloadを含めず、分類と原因だけを診断文字列へ変換する。
func (e *DecodeError) Error() string {
	if e == nil {
		return "<nil>"
	}
	if e.Cause == nil {
		return "synthesized audio decode failed: " + string(e.Kind)
	}
	return fmt.Sprintf("synthesized audio decode failed (%s): %v", e.Kind, e.Cause)
}

// Unwrap は原因errorをerrors.Is/errors.Asへ公開する。
func (e *DecodeError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

// TimedMora は発話開始を0とする48 kHz sample区間とproducerの表示値を保持する。
//
// StartSampleはinclusive、EndSampleはexclusiveであり、Vowel/Textはnilとempty stringを区別する。
type TimedMora struct {
	// Vowelはproducer値を保持し、nilとempty stringを区別する。
	Vowel *string
	// Textはproducer値を保持し、nilとempty stringを区別する。
	Text *string
	// StartSampleは発話開始基準のinclusiveな48 kHz sample位置である。
	StartSample uint64
	// EndSampleは発話開始基準のexclusiveな48 kHz sample位置である。
	EndSample uint64
}

// DecodedSpeech は完全に検証された48 kHz mono PCMとmora timingを表す。
//
// PCMの1要素は1 sampleであり、Moraがemptyでも有効である。Decoderは部分出力を返さない。
type DecodedSpeech struct {
	// SpeechIDは入力SynthesizerResultの発話識別子を保持する。
	SpeechID int64
	// PCMは48 kHz monoの符号付き16-bit sample列である。
	PCM []int16
	// MoraはPCM範囲内の再生順sample区間であり、emptyも有効である。
	Mora []TimedMora
}

// Decoder はFFmpeg process境界を使う、immutableで並行利用可能な合成音声decoderである。
//
// Decoder自身はprocessやgoroutineを保持せずCloseを持たない。各Decodeが起動したprocessは
// success、error、cancelの全経路でCommandRunner.Runのreturn前にjoinされる。
type Decoder struct {
	ffmpegPath string
	runner     CommandRunner
}

// NewDecoder は解決済みFFmpeg pathとrunnerから共有Decoderを作る。
//
// 空pathとnil runnerを拒否し、filesystem探索やversion確認は行わない。
func NewDecoder(ffmpegPath string, runner CommandRunner) (*Decoder, error) {
	if strings.TrimSpace(ffmpegPath) == "" {
		return nil, errors.New("ffmpeg path must not be empty")
	}
	if runner == nil {
		return nil, errors.New("ffmpeg command runner must not be nil")
	}
	return &Decoder{ffmpegPath: ffmpegPath, runner: runner}, nil
}

// ProbeVersion は設定済みFFmpegを実行し、6.1以上かつmajor version 8以下であることを確認する。
//
// serverはlistenerを開く前に呼ぶ。起動不能、出力超過、version解析不能、対応範囲外をstartup errorにし、
// fallback executableは探索しない。
func (d *Decoder) ProbeVersion(ctx context.Context) error {
	if ctx == nil {
		return errors.New("ffmpeg version probe context must not be nil")
	}
	stdout, stderr, exitCode, err := d.runner.Run(
		ctx, d.ffmpegPath, nil, versionProbeLimit, versionProbeLimit, "-version",
	)
	if err != nil || exitCode != 0 {
		if err == nil {
			err = errors.New("ffmpeg exited unsuccessfully")
		}
		return fmt.Errorf("run ffmpeg version probe: exit code %d: %w", exitCode, err)
	}
	if len(stdout) > versionProbeLimit || len(stderr) > versionProbeLimit {
		return errors.New("ffmpeg version output exceeds limit")
	}
	match := ffmpegVersionPattern.FindSubmatch(stdout)
	if match == nil {
		match = ffmpegVersionPattern.FindSubmatch(stderr)
	}
	if match == nil {
		return errors.New("parse ffmpeg version")
	}
	major, _ := strconv.Atoi(string(match[1]))
	minor, _ := strconv.Atoi(string(match[2]))
	if major < 6 || major > 8 || (major == 6 && minor < 1) {
		return fmt.Errorf("unsupported ffmpeg version %d.%d; require 6.1 through 8.x", major, minor)
	}
	return nil
}

// Decode はencoded Voiceを48 kHz mono s16leへ正規化し、moraをsample区間へ確定する。
//
// 許可MIME、8 MiB入力、finite timingをprocess起動前に検証し、FFmpegには5秒と120秒相当の
// 出力上限を課す。caller cancelはtimeoutより優先してそのerrorをCauseに保持する。FFmpeg失敗、
// timing不整合、上限超過を含む全失敗でstdout部分結果を破棄する。
func (d *Decoder) Decode(ctx context.Context, input protocol.SynthesizerResult) (DecodedSpeech, error) {
	if ctx == nil {
		return DecodedSpeech{}, decodeError(ErrorInvalid, errors.New("decode context must not be nil"))
	}
	if len(input.Voice) == 0 {
		return DecodedSpeech{}, decodeInvalid("empty_voice", errors.New("encoded voice must not be empty"))
	}
	if len(input.Voice) > maxEncodedBytes {
		return DecodedSpeech{}, decodeError(ErrorLimit, errors.New("encoded voice exceeds 8 MiB"))
	}
	inputFormat, err := parseAudioFormat(input.AudioFormat)
	if err != nil {
		return DecodedSpeech{}, err
	}
	if err := validateInputTiming(input); err != nil {
		return DecodedSpeech{}, err
	}

	// 外部containerを有限なraw PCMへ変換する段階でchannel平均downmixと48 kHz resampleを完了する。
	// stdoutは最大発話の1 byte先まで保持し、正常終了でも上限を越えた出力を拒否する。
	decodeCtx, cancel := context.WithTimeout(ctx, decodeTimeout)
	defer cancel()
	args := []string{
		"-hide_banner", "-loglevel", "error",
		"-f", inputFormat, "-i", "pipe:0",
		"-map", "0:a:0", "-vn", "-ac", "1", "-ar", strconv.Itoa(outputSampleRate),
		"-f", "s16le", "pipe:1",
	}
	stdout, stderr, exitCode, runErr := d.runner.Run(
		decodeCtx, d.ffmpegPath, input.Voice, maxPCMBytes, maxStderrBytes, args...,
	)
	if ctxErr := ctx.Err(); ctxErr != nil {
		return DecodedSpeech{}, decodeError(ErrorProcess, ctxErr)
	}
	if errors.Is(decodeCtx.Err(), context.DeadlineExceeded) {
		return DecodedSpeech{}, decodeError(ErrorTimeout, context.DeadlineExceeded)
	}
	if len(stdout) > maxPCMBytes {
		return DecodedSpeech{}, decodeError(ErrorLimit, errors.New("decoded audio exceeds 120 seconds"))
	}
	if len(stderr) > maxStderrBytes {
		return DecodedSpeech{}, decodeError(ErrorProcess, errors.New("ffmpeg stderr exceeds 64 KiB"))
	}
	if runErr != nil || exitCode != 0 {
		if runErr == nil {
			runErr = errors.New("ffmpeg exited unsuccessfully")
		}
		return DecodedSpeech{}, decodeError(
			ErrorProcess,
			fmt.Errorf("ffmpeg decode exit code %d: %w", exitCode, runErr),
		)
	}
	if len(stdout) == 0 || len(stdout)%2 != 0 {
		return DecodedSpeech{}, decodeInvalid("decoded_pcm_invalid", errors.New("decoded PCM must contain complete samples"))
	}
	pcm := decodePCM(stdout)
	if err := validateSpeakingTime(input.SpeakingTime, len(pcm)); err != nil {
		return DecodedSpeech{}, err
	}
	mora, err := mapMora(input.MoraQueue, len(pcm))
	if err != nil {
		return DecodedSpeech{}, err
	}
	return DecodedSpeech{SpeechID: input.SpeechID, PCM: pcm, Mora: mora}, nil
}

// decodeError は有限な粗分類とpayloadを含まない原因をDecodeErrorへまとめる。
func decodeError(kind ErrorKind, cause error) error {
	return &DecodeError{Kind: kind, Cause: cause}
}

// decodeInvalid は入力契約違反だけに有限な診断理由を付け、他分類の Reason を空に保つ。
func decodeInvalid(reason string, cause error) error {
	return &DecodeError{Kind: ErrorInvalid, Reason: reason, Cause: cause}
}

// parseAudioFormat はMIME表記揺れを正規化し、FFmpeg demuxer名へ閉じたmatrixで写像する。
//
// audio/oggはparameterなし、または唯一のcase-insensitive codecs=opusだけを受理する。
// unknown/additional parameterはdecoder自動推測へ流さずunsupportedとして拒否する。
func parseAudioFormat(raw string) (string, error) {
	mediaType, params, err := mime.ParseMediaType(raw)
	if err != nil {
		return "", decodeError(ErrorUnsupported, fmt.Errorf("parse audio MIME type: %w", err))
	}
	if hasDuplicateParameter(raw) {
		return "", decodeError(ErrorUnsupported, errors.New("duplicate audio MIME parameter"))
	}
	mediaType = strings.ToLower(mediaType)
	normalized := make(map[string]string, len(params))
	for key, value := range params {
		normalized[strings.ToLower(key)] = strings.ToLower(strings.TrimSpace(value))
	}
	switch mediaType {
	case "audio/wav":
		if len(normalized) == 0 {
			return "wav", nil
		}
	case "audio/aac":
		if len(normalized) == 0 {
			return "aac", nil
		}
	case "audio/ogg":
		if len(normalized) == 0 {
			return "ogg", nil
		}
		if len(normalized) == 1 && normalized["codecs"] == "opus" {
			return "ogg", nil
		}
	}
	return "", decodeError(ErrorUnsupported, fmt.Errorf("unsupported audio MIME type %q", raw))
}

// hasDuplicateParameterはmime.ParseMediaTypeが大小違いの重複keyをmapへ畳む前にreject条件を保持する。
// quoted value内のsemicolonはparameter区切りにしない。
func hasDuplicateParameter(raw string) bool {
	parts := make([]string, 0, 3)
	start := 0
	quoted := false
	escaped := false
	for index, character := range raw {
		switch {
		case escaped:
			escaped = false
		case quoted && character == '\\':
			escaped = true
		case character == '"':
			quoted = !quoted
		case character == ';' && !quoted:
			parts = append(parts, raw[start:index])
			start = index + 1
		}
	}
	parts = append(parts, raw[start:])
	seen := make(map[string]struct{}, len(parts)-1)
	for _, part := range parts[1:] {
		key, _, found := strings.Cut(part, "=")
		if !found {
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		if _, exists := seen[key]; exists {
			return true
		}
		seen[key] = struct{}{}
	}
	return false
}

// validateInputTimingはprocessより先に全float timingを検証し、不正入力による不要なprocess起動を防ぐ。
func validateInputTiming(input protocol.SynthesizerResult) error {
	if !isFiniteNonNegative(input.SpeakingTime) {
		return decodeInvalid("input_timing_invalid", errors.New("speaking time must be finite and non-negative"))
	}
	if input.SpeakingTime > maxDecodedSeconds {
		return decodeError(ErrorLimit, errors.New("speaking time exceeds 120 seconds"))
	}
	for index, mora := range input.MoraQueue {
		if !isFiniteNonNegative(mora.Length) {
			return decodeInvalid("input_timing_invalid", fmt.Errorf("mora %d length must be finite and non-negative", index))
		}
	}
	return nil
}

func isFiniteNonNegative(value float64) bool {
	return value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

// validateSpeakingTimeはproducerの秒表現と実decode sample数の軽微なcodec差だけを許容する。
//
// 960 sample（48 kHzで20 ms）を越える差はcontainer取り違えやtruncationを示すため、後段へ渡さない。
func validateSpeakingTime(seconds float64, samples int) error {
	declared := math.Round(seconds * outputSampleRate)
	if math.Abs(declared-float64(samples)) > speakingTolerance {
		return decodeInvalid(
			"speaking_time_mismatch",
			fmt.Errorf("speaking time differs from decoded audio by more than %d samples", speakingTolerance),
		)
	}
	return nil
}

// mapMoraは各lengthを先に足したfloat64秒を境界ごとに丸め、丸め誤差の累積を防ぐ。
//
// 前境界をStart、現在境界をEndとするため0開始かつ非減少になる。mora総長は音声より短くても
// 有効だが、1 sampleでも末尾を越えれば同期契約違反として全発話を拒否する。
func mapMora(input []protocol.SynthesizerMora, samples int) ([]TimedMora, error) {
	output := make([]TimedMora, 0, len(input))
	var cumulativeSeconds float64
	var previous uint64
	for index, mora := range input {
		cumulativeSeconds += mora.Length
		if math.IsInf(cumulativeSeconds, 0) || math.IsNaN(cumulativeSeconds) {
			return nil, decodeInvalid("mora_timing_invalid", fmt.Errorf("mora %d cumulative length is not finite", index))
		}
		endFloat := math.Round(cumulativeSeconds * outputSampleRate)
		if endFloat > float64(samples) {
			return nil, decodeInvalid("mora_timing_invalid", fmt.Errorf("mora %d ends after decoded audio", index))
		}
		end := uint64(endFloat)
		output = append(output, TimedMora{
			Vowel: mora.Vowel, Text: mora.Text, StartSample: previous, EndSample: end,
		})
		previous = end
	}
	return output, nil
}

// decodePCMはFFmpegのlittle-endian s16le byte列をGoの符号付きsample列へ変換する。
// channel数とsample rateは前段のFFmpeg引数で確定済みなので、ここでは表現変換だけを行う。
func decodePCM(raw []byte) []int16 {
	pcm := make([]int16, len(raw)/2)
	for index := range pcm {
		pcm[index] = int16(binary.LittleEndian.Uint16(raw[index*2:]))
	}
	return pcm
}
