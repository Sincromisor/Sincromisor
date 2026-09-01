package observability

// normalize は未知のlabel値をmetricごとの固定代替値へ縮退させる。
func normalize(value string, allowed map[string]struct{}, fallback string) string {
	if _, ok := allowed[value]; ok {
		return value
	}
	return fallback
}

// normalizePipelineService は内部WebSocket service名とrollout文書の短い公開labelを対応付ける。
// 短いlabel自体も受理するため、既存のRecorder呼び出し側と固定label集合は変更しない。
func normalizePipelineService(service string) string {
	switch service {
	case "SpeechExtractor", "extractor":
		return "extractor"
	case "SpeechRecognizer", "recognizer":
		return "recognizer"
	case "TextProcessor", "processor":
		return "processor"
	case "VoiceSynthesizer", "synthesizer":
		return "synthesizer"
	default:
		return "extractor"
	}
}

// set はlabel値の有限集合を作る。下記の固定語彙以外をcollectorへ渡さないために使う。
func set(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

// 各集合はmetric公開契約のlabel種類数を固定する。未知値は記録処理ごとの代替値へ縮退する。
var (
	closeReasons     = set("normal", "process_shutdown", "offer_failed", "pre_connect_timeout", "media_readiness_timeout", "duplicate_media", "pipeline_start_error", "codec_error", "media_read_error", "media_write_error", "invalid_data_channel", "data_channel_error", "output_backpressure", "ice_failed", "ice_disconnected_timeout", "restart_timeout", "panic", "unknown")
	sessionOutcomes  = set("closed", "failed")
	endpoints        = set("config", "offer", "candidate", "statuses")
	statusClasses    = set("2xx", "4xx", "5xx")
	iceStates        = set("New", "Checking", "Connected", "Completed", "Failed", "Disconnected", "Closed", "Unknown")
	deadlineStages   = set("gather", "pre_connect", "media_readiness", "disconnect_grace", "restart", "close")
	directions       = set("in", "out")
	audioOutcomes    = set("accepted", "sent", "dropped")
	rtpReasons       = set("duplicate", "late", "missing", "reorder_flush")
	rtcpTypes        = set("sr", "rr", "nack", "other")
	pacingReasons    = set("lag", "generation", "codec")
	codecDirections  = set("decode_in", "decode_synth", "encode_out")
	services         = set("extractor", "recognizer", "processor", "synthesizer")
	reconnectResults = set("start", "success", "failure")
	queues           = set("input", "speech", "text", "telop")
	overflowActions  = set("drop_oldest", "reject_close")
	channels         = set("text", "telop")
	closeOutcomes    = set("success", "timeout")
)
