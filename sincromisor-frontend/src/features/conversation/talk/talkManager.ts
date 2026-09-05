import { frontendLogger } from "../../../shared/logging/appLogger";
import { DebugConsoleManager } from "../../debug/model/debugConsoleManager";
import type { ChatMessage, TelopChannelMessage } from "../../rtc/rtcMessage";
import { ChatMessageService } from "../chat/model/chatMessageService";
import type { CurrentMora, TalkManagerEvent, TelopTextSegment } from "./talkManagerTypes";
import { TalkTelopSegmentBuffer } from "./talkTelopSegmentBuffer";

export type { CurrentMora, TalkManagerEvent, TelopTextSegment } from "./talkManagerTypes";

/** text_ch / telop_ch の受信結果を履歴・口形同期とReact購読へ橋渡しする。 */
export class TalkManager {
    private static instance: TalkManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly telopSegmentBuffer = new TalkTelopSegmentBuffer();
    private currentTelopChannelMessage: CurrentMora | undefined;
    private moraID: number = 0;
    private readonly listeners = new Set<(event: TalkManagerEvent) => void>();

    /** 受信側と画面側で共有する会話状態を返す。 */
    static getManager(): TalkManager {
        if (!TalkManager.instance) {
            TalkManager.instance = new TalkManager();
        }
        return TalkManager.instance;
    }

    private constructor() {
        this.chatMessageService = ChatMessageService.getService();
        this.debugConsoleManager = DebugConsoleManager.getManager();
    }

    /** 受信後の通知を購読し、返された関数で解除する。 */
    subscribe(listener: (event: TalkManagerEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** React取り付け前の文字列も含め、発話単位の件数制限付き履歴を返す。 */
    getTelopTextSegmentsSnapshot(): TelopTextSegment[] {
        return this.telopSegmentBuffer.snapshot();
    }

    /** text_chをチャット履歴へ反映し、受信イベントを診断画面へ通知する。 */
    addTextChannelMessage(msg: ChatMessage): void {
        frontendLogger.debug("Text channel message received.", {
            messageId: msg.message_id,
            messageType: msg.message_type,
            speechId: msg.speech_id,
            textLength: msg.message.length,
        });
        if (msg.message_type === "system") {
            // text_chの生JSONと別に、表情ヒントの有無だけを見やすく出す。
            // 現場で「Difyは^Nを返しているのに表情が変わらない」事象の切り分け用。
            this.debugConsoleManager.addTextChannelLog(
                `[emotion] recv message_id=${msg.message_id} speech_id=${msg.speech_id} expression_code=${msg.expression_code ?? "none"} text_len=${msg.message.length}\n`,
            );
        }
        this.chatMessageService.writeMessage(msg);
        this.emitEvent({ type: "text_channel_message", message: msg });
    }

    /** telop_chの受信から口形同期と件数制限付き文字列を更新し、全文保持せず購読者へ通知する。 */
    addTelopChannelMessage(msg: TelopChannelMessage): void {
        if (msg.new_text) {
            frontendLogger.debug("Telop channel segment received.", {
                speechId: msg.speech_id,
                textLength: msg.text.length,
                durationMs: msg.length * 1000,
            });
            this.currentTelopChannelMessage = {
                moraID: this.moraID,
                mora: msg,
                msec: msg.length * 1000,
                endTime: performance.now() + msg.length * 1000,
            };
            this.moraID += 1;
            this.addTelopChar(msg.speech_id, msg.text);
        }
        this.emitEvent({ type: "telop_channel_message", message: msg });
    }

    /** 再生期限内の口形情報を返す。期限はperformance.now()と同じミリ秒基準で判定する。 */
    currentMora(): CurrentMora | undefined {
        if (!this.currentTelopChannelMessage) {
            return undefined;
        }
        if (this.currentTelopChannelMessage.endTime < performance.now()) {
            this.currentTelopChannelMessage = undefined;
            return undefined;
        }
        return this.currentTelopChannelMessage;
    }

    // 空文字のモーラは空白として残し、React表示用の発話単位履歴へ加える。
    private addTelopChar(speech_id: number, char: string): void {
        const normalizedChar = char === "" ? " " : char;
        this.telopSegmentBuffer.appendChar(speech_id, normalizedChar);
    }

    // AppController が購読し、Control Panel / Telop React UI へ再配信するための通知。
    private emitEvent(event: TalkManagerEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
