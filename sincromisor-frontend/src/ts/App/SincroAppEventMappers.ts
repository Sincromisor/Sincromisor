import type { DebugConsoleManagerEvent } from "../UI/DebugConsoleManager";
import type { TalkManagerEvent } from "../RTC/TalkManager";
import type { ChatMessage } from "../RTC/RTCMessage";
import type { SincroAppEvent } from "./SincroAppTypes";

export type DebugEventMapResult =
    | { kind: "none" }
    | { kind: "event"; event: SincroAppEvent }
    | { kind: "ice_state"; value: string }
    | { kind: "signaling_state"; value: string };

// singleton manager のイベント型を AppController 向けのイベントへ変換する pure mapper 群。
// AppController 本体は状態更新と emit 順序に集中させる。
export function mapChatMessageToAppEvent(message: ChatMessage): SincroAppEvent {
    let eventType: SincroAppEvent["type"] = "chat_message";
    if (message.message_type === "system") {
        eventType = "system_message";
    } else if (message.message_type === "error") {
        eventType = "error_message";
    }
    return { type: eventType, message } as SincroAppEvent;
}

export function mapTalkManagerEventToAppEvent(event: TalkManagerEvent): SincroAppEvent | null {
    if (event.type === "telop_channel_message") {
        return { type: "telop_message", message: event.message };
    }
    return null;
}

export function mapDebugConsoleEvent(event: DebugConsoleManagerEvent): DebugEventMapResult {
    switch (event.type) {
        case "local_vad_state":
            return { kind: "event", event: { type: "local_vad_state", isSpeech: event.isSpeech } };
        case "face_x":
            return { kind: "event", event: { type: "gaze_status", faceX: event.value } };
        case "face_y":
            return { kind: "event", event: { type: "gaze_status", faceY: event.value } };
        case "facing":
            return { kind: "event", event: { type: "gaze_status", facing: event.value } };
        case "character_eye_status":
            return { kind: "event", event: { type: "gaze_status", watching: event.watching } };
        case "rtc_event_log":
            return { kind: "event", event: { type: "rtc_event_log", message: event.message } };
        case "ice_connection_state":
            return { kind: "ice_state", value: event.value };
        case "signaling_state":
            return { kind: "signaling_state", value: event.value };
        case "learned_vad_state":
            return {
                kind: "event",
                event: {
                    type: "learned_vad_state",
                    status: event.report.status,
                    probability: event.report.probability,
                },
            };
        default:
            return { kind: "none" };
    }
}
