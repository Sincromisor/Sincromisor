/*
    RTCのTextChannelから送られてくるメッセージ
    TextProcesssorのChatMessageと同様
 */
export type ChatMessage = {
    message_id: string; // ULID
    message_type: string; // system, error, reset, user
    speaker_id: string; // @systemのsystem部分(@は無し)
    speaker_name: string; // Glorious AI
    speech_id: number;
    expression_code?: number; // 応答先頭の ^N から抽出した感情コード（0-5）
    message: string;
    created_at: number;
};

export type ChatHistory = {
    messages: ChatMessage[];
};

/*
    RTCのTelopChannelから送られてくるメッセージ
    VoiceSynthesizerResultFrameとほぼ同様
    (音声データフレームは含まない)
 */
export type TelopChannelMessage = {
    speech_id: number;
    timestamp: number;
    message: string;
    vowel: string;
    text: string;
    length: number;
    new_text: boolean;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null;
}

function parseJsonObject(payload: string, channelName: string): UnknownRecord {
    const parsed: unknown = JSON.parse(payload);
    if (!isRecord(parsed)) {
        throw new Error(`${channelName} payload must be an object.`);
    }
    return parsed;
}

function requireString(record: UnknownRecord, key: string, channelName: string): string {
    const value = record[key];
    if (typeof value !== "string") {
        throw new Error(`${channelName}.${key} must be a string.`);
    }
    return value;
}

function requireNumber(record: UnknownRecord, key: string, channelName: string): number {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${channelName}.${key} must be a finite number.`);
    }
    return value;
}

function requireBoolean(record: UnknownRecord, key: string, channelName: string): boolean {
    const value = record[key];
    if (typeof value !== "boolean") {
        throw new Error(`${channelName}.${key} must be a boolean.`);
    }
    return value;
}

export function parseChatMessagePayload(payload: string): ChatMessage {
    const record = parseJsonObject(payload, "text_ch");
    const expressionCode =
        typeof record.expression_code === "number" && Number.isFinite(record.expression_code)
            ? record.expression_code
            : undefined;
    return {
        message_id: requireString(record, "message_id", "text_ch"),
        message_type: requireString(record, "message_type", "text_ch"),
        speaker_id: requireString(record, "speaker_id", "text_ch"),
        speaker_name: requireString(record, "speaker_name", "text_ch"),
        speech_id: requireNumber(record, "speech_id", "text_ch"),
        expression_code: expressionCode,
        message: requireString(record, "message", "text_ch"),
        created_at: requireNumber(record, "created_at", "text_ch"),
    };
}

export function parseTelopChannelPayload(payload: string): TelopChannelMessage {
    const record = parseJsonObject(payload, "telop_ch");
    return {
        speech_id: requireNumber(record, "speech_id", "telop_ch"),
        timestamp: requireNumber(record, "timestamp", "telop_ch"),
        message: requireString(record, "message", "telop_ch"),
        vowel: requireString(record, "vowel", "telop_ch"),
        text: requireString(record, "text", "telop_ch"),
        length: requireNumber(record, "length", "telop_ch"),
        new_text: requireBoolean(record, "new_text", "telop_ch"),
    };
}

export class ChatMessageBuilder implements ChatMessage {
    private static serial_no: number = 0;
    message_id: string;
    message_type: string;
    speaker_id: string;
    speaker_name: string;
    speech_id: number;
    message: string;
    created_at: number;

    constructor(
        message_type: string,
        speaker_id: string,
        speaker_name: string,
        speech_id: number,
        message: string,
    ) {
        this.message_id = this.get_message_id();
        this.message_type = message_type;
        this.speaker_id = speaker_id;
        this.speaker_name = speaker_name;
        this.speech_id = speech_id;
        this.message = message;
        this.created_at = Date.now();
    }

    private get_message_id(): string {
        ChatMessageBuilder.serial_no += 1;
        return ChatMessageBuilder.serial_no.toString();
    }
}
