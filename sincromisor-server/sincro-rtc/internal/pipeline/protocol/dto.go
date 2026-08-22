package protocol

// ExtractorInitialize は Go から SpeechExtractor へ送る接続初期化 payload である。
type ExtractorInitialize struct {
	// SessionID は接続中に変わらない session 識別子である。空文字も wire 表現として許可する。
	SessionID string `msgpack:"session_id"`
	// StartAt は session 開始時刻を Unix time の秒で表す。
	StartAt float64 `msgpack:"start_at"`
	// VoiceSamplingRate は raw PCM の 1 秒あたりの sample 数である。
	VoiceSamplingRate int64 `msgpack:"voice_sampling_rate"`
	// VoiceSampleBytes は raw PCM の 1 sample、1 channel あたりの byte 数である。
	VoiceSampleBytes int64 `msgpack:"voice_sample_bytes"`
	// VoiceChannels は raw PCM の channel 数である。
	VoiceChannels int64 `msgpack:"voice_channels"`
}

// ExtractorResult は SpeechExtractor 境界を双方向に通る発話区間 payload である。
type ExtractorResult struct {
	// SessionID は接続中に変わらない session 識別子である。
	SessionID string `msgpack:"session_id"`
	// SpeechID は同じ発話の partial/confirmed result を関連付ける識別子である。
	SpeechID int64 `msgpack:"speech_id"`
	// SequenceID は extractor が result を送るたびに割り当てる順序識別子である。
	SequenceID int64 `msgpack:"sequence_id"`
	// StartAt は発話開始時刻を Unix time の秒で表す。
	StartAt float64 `msgpack:"start_at"`
	// Confirmed は発話区間が確定済みかを表す。
	Confirmed bool `msgpack:"confirmed"`
	// Voice は VoiceDType と各 voice 単位で解釈する raw PCM である。
	// encode の入力 slice は参照するだけで、返却 payload は独立する。decode 結果は DTO が所有し、empty binary は許可する。
	Voice []byte `msgpack:"voice"`
	// VoiceDType は Voice の sample 型名である。空文字も codec 層では許可する。
	VoiceDType string `msgpack:"voice_dtype"`
	// VoiceSamplingRate は Voice の 1 秒あたりの sample 数である。
	VoiceSamplingRate int64 `msgpack:"voice_sampling_rate"`
	// VoiceSampleBytes は Voice の 1 sample、1 channel あたりの byte 数である。
	VoiceSampleBytes int64 `msgpack:"voice_sample_bytes"`
	// VoiceChannels は Voice の channel 数である。
	VoiceChannels int64 `msgpack:"voice_channels"`
}

// RecognizerResult は SpeechRecognizer から受け取る認識結果 payload である。
// この方向には production encode API を提供せず、認識結果から ProcessorRequest を別途組み立てる。
type RecognizerResult struct {
	// SessionID は接続中に変わらない session 識別子である。
	SessionID string
	// SpeechID は認識元となった発話の識別子である。
	SpeechID int64
	// SequenceID は認識元 extractor result の順序識別子である。
	SequenceID int64
	// StartAt は発話開始時刻を Unix time の秒で表す。
	StartAt float64
	// Confirmed は認識元の発話区間が確定済みかを表す。
	Confirmed bool
	// Result は wire 上の [text, score] 配列を順序どおり保持する。nil list は拒否し、empty list は許可する。
	Result []RecognitionToken
}

// RecognitionToken は認識文字列と score の組である。
// wire 表現は map ではなく、常に string と float の 2 要素配列である。
type RecognitionToken struct {
	// Text は認識された UTF-8 text である。
	Text string
	// Score は recognizer が返す信頼度である。codec は domain 上の範囲を制限しない。
	Score float64
}

// ChatMessage は processor payload 内で request/response/history を表す最小 chat message である。
type ChatMessage struct {
	// SpeechID は元の発話を chat message と関連付ける識別子である。
	SpeechID int64 `msgpack:"speech_id"`
	// MessageID は message ごとの ULID 文字列である。codec は形式を検証しない。
	MessageID string `msgpack:"message_id"`
	// MessageType は frontend 表示種別である。
	MessageType string `msgpack:"message_type"`
	// SpeakerID は @ を含まない speaker 識別子である。
	SpeakerID string `msgpack:"speaker_id"`
	// SpeakerName は表示用 speaker 名である。
	SpeakerName string `msgpack:"speaker_name"`
	// ExpressionCode は表情 hint であり、nil は未指定を意味する。zero は有効な code として保持する。
	ExpressionCode *int64 `msgpack:"expression_code"`
	// Message は chat 本文であり、empty string も有効である。
	Message string `msgpack:"message"`
	// CreatedAt は message 作成時刻を Unix time の秒で表す。
	CreatedAt float64 `msgpack:"created_at"`
}

// ChatHistory は processor が引き継ぐ確定済み会話履歴である。
type ChatHistory struct {
	// Messages は時系列順の message である。nil list は拒否し、empty list は履歴なしを意味する。
	Messages []ChatMessage `msgpack:"messages"`
}

// ProcessorRequest は Go から TextProcessor へ送る認識済み発話と会話履歴である。
type ProcessorRequest struct {
	// SessionID は接続中に変わらない session 識別子である。
	SessionID string `msgpack:"session_id"`
	// SequenceID は元の認識結果の順序識別子である。
	SequenceID int64 `msgpack:"sequence_id"`
	// Confirmed は request message の元発話が確定済みかを表す。
	Confirmed bool `msgpack:"confirmed"`
	// History は request を処理する前の確定済み会話履歴である。
	History ChatHistory `msgpack:"history"`
	// RequestMessage は今回 TextProcessor が処理する user message である。
	RequestMessage ChatMessage `msgpack:"request_message"`
}

// ProcessorResult は TextProcessor から受け取る routing 用 field と元 payload である。
// VoiceSynthesizer へは再 encode せず Raw をそのまま転送し、Python の query model を Go 側で二重所有しない。
type ProcessorResult struct {
	// SessionID は接続中に変わらない session 識別子である。
	SessionID string
	// SequenceID は元の processor request の順序識別子である。
	SequenceID int64
	// Confirmed は元の request message が確定済みかを表す。
	Confirmed bool
	// History は result 時点の確定済み会話履歴である。
	History ChatHistory
	// RequestMessage は応答対象の user message である。
	RequestMessage ChatMessage
	// ResponseMessage は TextProcessor が生成中または生成済みの response message である。
	ResponseMessage ChatMessage
	// EndOfResponse は streaming 応答が終了したかを表す。
	EndOfResponse bool
	// VoiceText は今回 TTS へ渡す増分 text であり、nil は送る text がないことを意味する。
	VoiceText *string
	// Raw は受信 MessagePack object 全体の防御的 copy である。
	// DTO が slice を所有し、decode 後に caller が入力 payload を変更しても転送 byte 列は変わらない。
	Raw []byte
}

// SynthesizerMora は synthesized voice と同期する mora の最小 timing 情報である。
type SynthesizerMora struct {
	// Vowel は母音表現であり、nil は producer が値を持たないことを意味する。empty string は有効である。
	Vowel *string
	// Length は mora の再生時間を秒で表す。
	Length float64
	// Text は mora の表示 text であり、nil は producer が値を持たないことを意味する。empty string は有効である。
	Text *string
}

// SynthesizerResult は VoiceSynthesizer から受け取る音声同期用の限定 DTO である。
// Python の query map は required object として検証するが、routing と再生に不要なため保持しない。
type SynthesizerResult struct {
	// SpeechID は synthesized voice の元となった発話識別子である。
	SpeechID int64
	// Message は synthesized voice の元 text である。
	Message string
	// MoraQueue は再生順の timing 情報である。nil list は拒否し、empty list は許可する。
	MoraQueue []SynthesizerMora
	// SpeakingTime は voice 全体の再生時間を秒で表す。
	SpeakingTime float64
	// Voice は AudioFormat で符号化済みの音声 byte 列である。DTO が slice を所有し、empty binary は許可する。
	Voice []byte
	// AudioFormat は Voice の MIME type である。codec は対応 format の domain validation を行わない。
	AudioFormat string
}
