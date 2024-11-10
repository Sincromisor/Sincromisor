export interface ChatMessage {
    message_id: string, // ULID
    message_type: string, // system, error, reset, user
    speaker_id: string, // @systemのsystem部分(@は無し)
    speaker_name: string, // Glorious AI
    message: string,
    created_at: number
}

export interface ChatHistory {
    messages: ChatMessage[],
}

/*
export interface TextChannelMessage {
    session_id: string,
    speech_id: number,
    sequence_id: number,
    start_at: number,
    confirmed: boolean,
    recognizedText: [string, number][],
    resultText: string
}*/

export interface TelopChannelMessage {
    timestamp: number,
    message: string,
    vowel: string,
    text: string,
    length: number,
    new_text: boolean
}

export interface TextProcessorResult {
    session_id: string,
    speech_id: number,
    sequence_id: number,
    confirmed: boolean,
    history: ChatHistory,
    request_message: ChatMessage,
    response_message: ChatMessage,
    end_of_response: boolean,
    voice_text: string | null
}

export class ChatMessageBuilder implements ChatMessage {
    private static serial_no: number = 0;
    message_id: string;
    message_type: string;
    speaker_id: string;
    speaker_name: string;
    message: string;
    created_at: number;

    constructor(message_type: string, speaker_id: string, speaker_name: string, message: string) {
        this.message_id = this.get_message_id();
        this.message_type = message_type;
        this.speaker_id = speaker_id;
        this.speaker_name = speaker_name;
        this.message = message;
        this.created_at = Date.now();
    }

    private get_message_id(): string {
        ChatMessageBuilder.serial_no += 1;
        return ChatMessageBuilder.serial_no.toString()
    }
}
