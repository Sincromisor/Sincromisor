package protocol

import (
	"bytes"
	"fmt"

	"github.com/vmihailenco/msgpack/v5"
)

// EncodeExtractorInitialize は Go producer の初期化 DTO を SpeechExtractor wire payload へ変換する。
//
// 全 required key を MessagePack map へ出力し、返却 slice は caller が所有する。domain 値は検証せず、
// serialization failure だけを返す。この方向専用 API であり、初期化 response decoder は提供しない。
func EncodeExtractorInitialize(value ExtractorInitialize) ([]byte, error) {
	return encode("ExtractorInitialize", value)
}

// EncodeExtractorResult は Go producer の発話区間 DTO を SpeechExtractorResult wire payload へ変換する。
//
// Voice は MessagePack binary として出力し、nil は許可しない。返却 slice は caller が所有し、
// 入力 Voice と storage を共有しない。Python producer の同 payload は DecodeExtractorResult で受ける。
func EncodeExtractorResult(value ExtractorResult) ([]byte, error) {
	if value.Voice == nil {
		return nil, fieldError("ExtractorResult", "voice", "must be binary, not nil")
	}
	return encode("ExtractorResult", value)
}

// DecodeExtractorResult は Python SpeechExtractor producer の単一 payload を限定 DTO へ変換する。
//
// required key、型、binary 表現、trailing object を検証し、未知 key は将来の Python field 追加に備えて
// 無視する。返却 DTO の全 slice/string/list は decoder が確保した storage に属し、入力 payload を参照しない。
func DecodeExtractorResult(payload []byte) (ExtractorResult, error) {
	root, err := decodeRoot("ExtractorResult", payload)
	if err != nil {
		return ExtractorResult{}, err
	}
	return decodeExtractorResult(root)
}

// DecodeRecognizerResult は Python SpeechRecognizer producer の単一 payload を限定 DTO へ変換する。
//
// result の各要素を [string, float] の厳密な 2 要素配列として検証する。未知 key は無視するが、
// required key、nil list、trailing object は拒否する。RecognizerResult の逆方向 encode API は提供しない。
func DecodeRecognizerResult(payload []byte) (RecognizerResult, error) {
	root, err := decodeRoot("RecognizerResult", payload)
	if err != nil {
		return RecognizerResult{}, err
	}
	return decodeRecognizerResult(root)
}

// EncodeProcessorRequest は Go producer の chat request を TextProcessor wire payload へ変換する。
//
// nested message の optional pointer は nil を明示的な MessagePack nil として出力する。全 list は non-nil を
// 要求し、返却 slice は caller が所有する。ProcessorResult の再 encode API は Raw 転送を守るため提供しない。
func EncodeProcessorRequest(value ProcessorRequest) ([]byte, error) {
	if value.History.Messages == nil {
		return nil, fieldError("ProcessorRequest", "history.messages", "must be a list, not nil")
	}
	return encode("ProcessorRequest", value)
}

// DecodeProcessorResult は Python TextProcessor producer の単一 payload を routing DTO へ変換する。
//
// nested chat field を検証したうえで、VoiceSynthesizer へ変更せず渡す payload を Raw に防御的 copy する。
// 未知 key は無視し、required key、型、trailing object を拒否する。入力や外部 state への副作用はない。
func DecodeProcessorResult(payload []byte) (ProcessorResult, error) {
	root, err := decodeRoot("ProcessorResult", payload)
	if err != nil {
		return ProcessorResult{}, err
	}
	result, err := decodeProcessorResult(root)
	if err != nil {
		return ProcessorResult{}, err
	}
	result.Raw = bytes.Clone(payload)
	return result, nil
}

// DecodeSynthesizerResult は Python VoiceSynthesizer producer の単一 payload を音声同期 DTO へ変換する。
//
// query は required non-nil map であることだけを確認して破棄し、未知 nested key は無視する。
// Voice は binary だけを受理して新規 storage へ copy し、text は拒否する。逆方向 encode API は提供しない。
func DecodeSynthesizerResult(payload []byte) (SynthesizerResult, error) {
	root, err := decodeRoot("SynthesizerResult", payload)
	if err != nil {
		return SynthesizerResult{}, err
	}
	return decodeSynthesizerResult(root)
}

func encode(model string, value any) ([]byte, error) {
	payload, err := msgpack.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("%s at $: encode MessagePack: %w", model, err)
	}
	return payload, nil
}

// decodeRoot は wire validation の最初の段階として object 境界を固定する。
// DecodeInterface は nested map でも string key を要求するため、unknown field を保持せずに安全に読み飛ばせる。
func decodeRoot(model string, payload []byte) (map[string]any, error) {
	if len(payload) == 0 {
		return nil, fmt.Errorf("%s at $: empty payload", model)
	}

	reader := bytes.NewReader(payload)
	decoder := msgpack.NewDecoder(reader)
	decoded, err := decoder.DecodeInterface()
	if err != nil {
		return nil, fmt.Errorf("%s at $: decode MessagePack: %w", model, err)
	}
	if reader.Len() != 0 {
		return nil, fmt.Errorf("%s at $: trailing object or bytes", model)
	}
	root, ok := decoded.(map[string]any)
	if !ok || root == nil {
		return nil, fmt.Errorf("%s at $: expected map", model)
	}
	return root, nil
}

func fieldError(model, path, detail string) error {
	return fmt.Errorf("%s at %s.%s: %s", model, model, path, detail)
}
