import { frontendLogger } from "../../../shared/logging/appLogger";
import { DebugConsoleManager } from "../../debug/model/debugConsoleManager";
import type { ChatMessage, TelopChannelMessage } from "../../rtc/rtcMessage";
import { ChatMessageService } from "../chat/model/chatMessageService";
import { TalkLegacyTelopRenderer } from "../telop/model/talkLegacyTelopRenderer";
import type { CurrentMora, TalkManagerEvent, TelopTextSegment } from "./talkManagerTypes";
import { TalkTelopSegmentBuffer } from "./talkTelopSegmentBuffer";

export type { CurrentMora, TalkManagerEvent, TelopTextSegment } from "./talkManagerTypes";

/** text_ch / telop_ch の受信結果を既存DOM描画とReact購読へ橋渡しする。 */
export class TalkManager {
    private static instance: TalkManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly telopSegmentBuffer = new TalkTelopSegmentBuffer();
    private readonly legacyTelopRenderer = new TalkLegacyTelopRenderer();
    private currentTelopChannelMessage: CurrentMora | undefined;
    private moraID: number = 0;
    private readonly listeners = new Set<(event: TalkManagerEvent) => void>();
    private telopDomRenderingEnabled: boolean = true;

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

    // React/AppController 向けの購読口。text/telop を分けて通知する。
    subscribe(listener: (event: TalkManagerEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // Reactテロップ描画に切り替える際、既存 footer DOM の更新を止める。
    // 併存期間の二重描画防止用フラグ。
    setTelopDomRenderingEnabled(enabled: boolean): void {
        this.telopDomRenderingEnabled = enabled;
        if (!enabled) {
            this.legacyTelopRenderer.clear();
            return;
        }
        this.legacyTelopRenderer.renderSnapshot(this.telopSegmentBuffer.snapshot());
    }

    // React初期描画用の簡易スナップショット（件数制限あり）。
    // DOM版の横幅切り詰めとは異なり、移行期間中は speech 単位の履歴として保持する。
    getTelopTextSegmentsSnapshot(): TelopTextSegment[] {
        return this.telopSegmentBuffer.snapshot();
    }

    // text_ch は既存 chat manager へ委譲しつつ、React購読向けイベントも発火する。
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

    // 既存 footer DOM 向けの文字単位描画。
    // React移行後も fallback として残し、telopDomRenderingEnabled=false で停止できる。
    private addTelopChar(speech_id: number, char: string): void {
        const normalizedChar = char === "" ? " " : char;
        this.telopSegmentBuffer.appendChar(speech_id, normalizedChar);
        if (!this.telopDomRenderingEnabled) {
            return;
        }
        this.legacyTelopRenderer.appendChar(speech_id, normalizedChar);
    }

    // AppController が購読し、Control Panel / Telop React UI へ再配信するための通知。
    private emitEvent(event: TalkManagerEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
