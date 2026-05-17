import { frontendLogger } from "../logging/appLogger";
import { ChatMessageService } from "../UI/ChatMessageService";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";
import type { ChatMessage, TelopChannelMessage } from "./RTCMessage";
import { TalkLegacyTelopRenderer } from "./talkLegacyTelopRenderer";
import type { CurrentMora, TalkManagerEvent, TelopTextSegment } from "./talkManagerTypes";
import { TalkTelopSegmentBuffer } from "./talkTelopSegmentBuffer";

export type { CurrentMora, TalkManagerEvent, TelopTextSegment } from "./talkManagerTypes";

// text_ch / telop_ch の受信結果を、既存DOM描画と React購読の両方へ橋渡しする管理クラス。
// ChatMessageService と同様、移行期間中は DOM とイベントの二重経路を持つ。
export class TalkManager {
    private static instance: TalkManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly telopSegmentBuffer = new TalkTelopSegmentBuffer();
    private readonly legacyTelopRenderer = new TalkLegacyTelopRenderer();
    private telopChannelMessage: Array<TelopChannelMessage> = [];
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

    // telop_ch の 1 mora 分を内部状態へ反映し、必要に応じて DOM/React 両方へ通知する。
    addTelopChannelMessage(msg: TelopChannelMessage): void {
        this.telopChannelMessage.push(msg);
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
