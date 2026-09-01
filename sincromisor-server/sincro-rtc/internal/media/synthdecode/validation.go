package synthdecode

import (
	"errors"
	"fmt"
	"math"
	"mime"
	"strings"

	"github.com/Sincromisor/Sincromisor/sincromisor-server/sincro-rtc/internal/pipeline/protocol"
)

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
