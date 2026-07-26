package protocol

import (
	"fmt"
)

func decodeExtractorResult(root map[string]any) (ExtractorResult, error) {
	const model = "ExtractorResult"
	var result ExtractorResult
	var err error
	if result.SessionID, err = requiredString(root, model, "session_id"); err != nil {
		return result, err
	}
	if result.SpeechID, err = requiredInt64(root, model, "speech_id"); err != nil {
		return result, err
	}
	if result.SequenceID, err = requiredInt64(root, model, "sequence_id"); err != nil {
		return result, err
	}
	if result.StartAt, err = requiredFloat(root, model, "start_at"); err != nil {
		return result, err
	}
	if result.Confirmed, err = requiredBool(root, model, "confirmed"); err != nil {
		return result, err
	}
	if result.Voice, err = requiredBinary(root, model, "voice"); err != nil {
		return result, err
	}
	if result.VoiceDType, err = requiredString(root, model, "voice_dtype"); err != nil {
		return result, err
	}
	if result.VoiceSamplingRate, err = requiredInt64(root, model, "voice_sampling_rate"); err != nil {
		return result, err
	}
	if result.VoiceSampleBytes, err = requiredInt64(root, model, "voice_sample_bytes"); err != nil {
		return result, err
	}
	result.VoiceChannels, err = requiredInt64(root, model, "voice_channels")
	return result, err
}

func decodeRecognizerResult(root map[string]any) (RecognizerResult, error) {
	const model = "RecognizerResult"
	var result RecognizerResult
	var err error
	if result.SessionID, err = requiredString(root, model, "session_id"); err != nil {
		return result, err
	}
	if result.SpeechID, err = requiredInt64(root, model, "speech_id"); err != nil {
		return result, err
	}
	if result.SequenceID, err = requiredInt64(root, model, "sequence_id"); err != nil {
		return result, err
	}
	if result.StartAt, err = requiredFloat(root, model, "start_at"); err != nil {
		return result, err
	}
	if result.Confirmed, err = requiredBool(root, model, "confirmed"); err != nil {
		return result, err
	}

	items, err := requiredList(root, model, "result")
	if err != nil {
		return result, err
	}
	result.Result = make([]RecognitionToken, len(items))
	for index, item := range items {
		path := fmt.Sprintf("result[%d]", index)
		tuple, ok := item.([]any)
		if !ok || len(tuple) != 2 {
			return result, fieldError(model, path, "expected [text, score] array")
		}
		text, ok := tuple[0].(string)
		if !ok {
			return result, fieldError(model, path+"[0]", "expected string")
		}
		score, ok := asFloat(tuple[1])
		if !ok {
			return result, fieldError(model, path+"[1]", "expected float")
		}
		result.Result[index] = RecognitionToken{Text: text, Score: score}
	}
	return result, nil
}

func decodeProcessorResult(root map[string]any) (ProcessorResult, error) {
	const model = "ProcessorResult"
	var result ProcessorResult
	var err error
	if result.SessionID, err = requiredString(root, model, "session_id"); err != nil {
		return result, err
	}
	if result.SequenceID, err = requiredInt64(root, model, "sequence_id"); err != nil {
		return result, err
	}
	if result.Confirmed, err = requiredBool(root, model, "confirmed"); err != nil {
		return result, err
	}
	if result.History, err = requiredHistory(root, model, "history"); err != nil {
		return result, err
	}
	if result.RequestMessage, err = requiredMessage(root, model, "request_message"); err != nil {
		return result, err
	}
	if result.ResponseMessage, err = requiredMessage(root, model, "response_message"); err != nil {
		return result, err
	}
	if result.EndOfResponse, err = requiredBool(root, model, "end_of_response"); err != nil {
		return result, err
	}
	result.VoiceText, err = requiredOptionalString(root, model, "voice_text")
	return result, err
}

func decodeSynthesizerResult(root map[string]any) (SynthesizerResult, error) {
	const model = "SynthesizerResult"
	var result SynthesizerResult
	var err error
	if result.SpeechID, err = requiredInt64(root, model, "speech_id"); err != nil {
		return result, err
	}
	if result.Message, err = requiredString(root, model, "message"); err != nil {
		return result, err
	}
	if _, err = requiredMap(root, model, "query"); err != nil {
		return result, err
	}

	items, err := requiredList(root, model, "mora_queue")
	if err != nil {
		return result, err
	}
	result.MoraQueue = make([]SynthesizerMora, len(items))
	for index, item := range items {
		path := fmt.Sprintf("mora_queue[%d]", index)
		moraMap, ok := item.(map[string]any)
		if !ok || moraMap == nil {
			return result, fieldError(model, path, "expected map")
		}
		if result.MoraQueue[index].Vowel, err = requiredOptionalString(moraMap, model, path+".vowel"); err != nil {
			return result, err
		}
		if result.MoraQueue[index].Length, err = requiredFloat(moraMap, model, path+".length"); err != nil {
			return result, err
		}
		if result.MoraQueue[index].Text, err = requiredOptionalString(moraMap, model, path+".text"); err != nil {
			return result, err
		}
	}
	if result.SpeakingTime, err = requiredFloat(root, model, "speaking_time"); err != nil {
		return result, err
	}
	if result.Voice, err = requiredBinary(root, model, "voice"); err != nil {
		return result, err
	}
	result.AudioFormat, err = requiredString(root, model, "audio_format")
	return result, err
}

// requiredMessage は nested chat map を wire DTO へ変換し、unknown field を境界で破棄する。
// path を caller から受け取ることで、どの message が壊れたかを payload 値なしで診断できる。
func requiredMessage(parent map[string]any, model, path string) (ChatMessage, error) {
	root, err := requiredMap(parent, model, path)
	if err != nil {
		return ChatMessage{}, err
	}
	var message ChatMessage
	if message.SpeechID, err = requiredInt64(root, model, path+".speech_id"); err != nil {
		return message, err
	}
	if message.MessageID, err = requiredString(root, model, path+".message_id"); err != nil {
		return message, err
	}
	if message.MessageType, err = requiredString(root, model, path+".message_type"); err != nil {
		return message, err
	}
	if message.SpeakerID, err = requiredString(root, model, path+".speaker_id"); err != nil {
		return message, err
	}
	if message.SpeakerName, err = requiredString(root, model, path+".speaker_name"); err != nil {
		return message, err
	}
	if message.ExpressionCode, err = requiredOptionalInt64(root, model, path+".expression_code"); err != nil {
		return message, err
	}
	if message.Message, err = requiredString(root, model, path+".message"); err != nil {
		return message, err
	}
	message.CreatedAt, err = requiredFloat(root, model, path+".created_at")
	return message, err
}

func requiredHistory(parent map[string]any, model, path string) (ChatHistory, error) {
	root, err := requiredMap(parent, model, path)
	if err != nil {
		return ChatHistory{}, err
	}
	items, err := requiredList(root, model, path+".messages")
	if err != nil {
		return ChatHistory{}, err
	}
	history := ChatHistory{Messages: make([]ChatMessage, len(items))}
	for index, item := range items {
		itemPath := fmt.Sprintf("%s.messages[%d]", path, index)
		messageMap, ok := item.(map[string]any)
		if !ok || messageMap == nil {
			return ChatHistory{}, fieldError(model, itemPath, "expected map")
		}
		holder := map[string]any{lastPathSegment(itemPath): messageMap}
		history.Messages[index], err = requiredMessage(holder, model, itemPath)
		if err != nil {
			return ChatHistory{}, err
		}
	}
	return history, nil
}
