import type { ChatMessage } from "./rtcBoundarySchema";

export type {
    ChatHistory,
    ChatMessage,
    TelopChannelMessage,
} from "./rtcBoundarySchema";
export {
    parseChatMessagePayload,
    parseTelopChannelPayload,
} from "./rtcBoundarySchema";

export type ChatMessageBuilderOptions = {
    messageType: string;
    speakerId: string;
    speakerName: string;
    speechId: number;
    message: string;
};

export class ChatMessageBuilder implements ChatMessage {
    private static serial_no: number = 0;
    message_id: string;
    message_type: string;
    speaker_id: string;
    speaker_name: string;
    speech_id: number;
    message: string;
    created_at: number;

    constructor(options: ChatMessageBuilderOptions) {
        this.message_id = this.get_message_id();
        this.message_type = options.messageType;
        this.speaker_id = options.speakerId;
        this.speaker_name = options.speakerName;
        this.speech_id = options.speechId;
        this.message = options.message;
        this.created_at = Date.now();
    }

    private get_message_id(): string {
        ChatMessageBuilder.serial_no += 1;
        return ChatMessageBuilder.serial_no.toString();
    }
}
