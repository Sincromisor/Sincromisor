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
