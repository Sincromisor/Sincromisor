package synthdecode

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
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
