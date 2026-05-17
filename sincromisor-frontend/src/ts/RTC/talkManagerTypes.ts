import type { ChatMessage, TelopChannelMessage } from "./RTCMessage";

export type CurrentMora = {
    moraID: number;
    mora: TelopChannelMessage;
    msec: number;
    endTime: number;
};

export type TalkManagerEvent =
    | { type: "text_channel_message"; message: ChatMessage }
    | { type: "telop_channel_message"; message: TelopChannelMessage };

export type TelopTextSegment = {
    speechId: number;
    text: string;
};
