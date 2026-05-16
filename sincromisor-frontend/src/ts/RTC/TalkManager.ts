import { ChatMessageService } from "../UI/ChatMessageService";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";
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

// text_ch / telop_ch の受信結果を、既存DOM描画と React購読の両方へ橋渡しする管理クラス。
// ChatMessageService と同様、移行期間中は DOM とイベントの二重経路を持つ。
export class TalkManager {
    private static instance: TalkManager;
    // React footerテロップは幅ベースtrimを行わないため、保持件数を抑えて更新コストを安定させる。
    private static readonly MAX_TELOP_SEGMENT_COUNT = 6;
    // 長時間稼働時の保険として、React表示用の総文字数を単純上限で制御する。
    private static readonly MAX_TELOP_TOTAL_CHARS = 240;
    private readonly chatMessageService: ChatMessageService;
    private readonly debugConsoleManager: DebugConsoleManager;
    private telopChannelMessage: Array<TelopChannelMessage> = [];
    private currentTelopChannelMessage: CurrentMora | null = null;
    private moraID: number = 0;
    private readonly listeners = new Set<(event: TalkManagerEvent) => void>();
    private telopDomRenderingEnabled: boolean = true;
    private telopTextSegments: TelopTextSegment[] = [];

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
            this.clearLegacyTelopSpans();
            return;
        }
        this.renderLegacyTelopSnapshot();
    }

    // React初期描画用の簡易スナップショット（件数制限あり）。
    // DOM版の横幅切り詰めとは異なり、移行期間中は speech 単位の履歴として保持する。
    getTelopTextSegmentsSnapshot(): TelopTextSegment[] {
        return [...this.telopTextSegments];
    }

    // text_ch は既存 chat manager へ委譲しつつ、React購読向けイベントも発火する。
    addTextChannelMessage(msg: ChatMessage): void {
        console.dir(msg);
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
            console.dir(msg);
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

    currentMora(): CurrentMora | null {
        if (!this.currentTelopChannelMessage) {
            return null;
        }
        if (this.currentTelopChannelMessage.endTime < performance.now()) {
            this.currentTelopChannelMessage = null;
            return null;
        }
        return this.currentTelopChannelMessage;
    }

    // 既存 footer DOM 向けの文字単位描画。
    // React移行後も fallback として残し、telopDomRenderingEnabled=false で停止できる。
    private addTelopChar(speech_id: number, char: string): void {
        const normalizedChar = char || " ";
        this.upsertTelopTextSegment(speech_id, normalizedChar);
        if (!this.telopDomRenderingEnabled) {
            return;
        }
        const telopText: HTMLDivElement | null = document.querySelector("div#sincroFooterBox");
        if (!telopText) return;

        // speech_idに対応するspanを探す
        let span: HTMLSpanElement | null = telopText.querySelector<HTMLSpanElement>(
            `span[data-speech-id="${speech_id}"]`,
        );
        if (!span) {
            span = document.createElement("span");
            span.classList.add("sincroFooterBox__telopText");
            span.setAttribute("data-speech-id", String(speech_id));
            telopText.appendChild(span);
        }
        span.textContent += normalizedChar;

        this.trimLegacyTelopOverflow(telopText);
    }

    // React island を外したあとでも直前のテロップを見返せるよう、保持済み snapshot を再描画する。
    private renderLegacyTelopSnapshot(): void {
        const telopText: HTMLDivElement | null = document.querySelector("div#sincroFooterBox");
        if (!telopText) {
            return;
        }
        this.clearLegacyTelopSpans(telopText);
        for (const segment of this.telopTextSegments) {
            const span = document.createElement("span");
            span.classList.add("sincroFooterBox__telopText");
            span.setAttribute("data-speech-id", String(segment.speechId));
            span.textContent = segment.text;
            telopText.appendChild(span);
        }
        this.trimLegacyTelopOverflow(telopText);
    }

    // Reactや日時表示など他要素を巻き込まないよう、旧DOMテロップspanのみ掃除する。
    private clearLegacyTelopSpans(telopBox?: Element): void {
        const target = telopBox ?? document.querySelector("div#sincroFooterBox");
        if (!target) {
            return;
        }
        const legacyTelopSpans = target.querySelectorAll("span.sincroFooterBox__telopText");
        legacyTelopSpans.forEach((node) => {
            node.remove();
        });
    }

    // footer内の日時など別要素を残したまま、旧DOMテロップだけを幅内へ切り詰める。
    private trimLegacyTelopOverflow(telopText: HTMLDivElement): void {
        if (telopText.clientWidth === 0) {
            return;
        }
        const paddingLeftPx = parseInt(window.getComputedStyle(telopText).paddingLeft) || 0;
        const paddingRightPx = parseInt(window.getComputedStyle(telopText).paddingRight) || 0;
        // 1文字単位で先頭から削除。
        // footer内に日時など別要素がある構成では、その幅を差し引いた残りをテロップ用の幅とみなす。
        const telopClass = "sincroFooterBox__telopText";
        const getChildren = (): HTMLElement[] => Array.from(telopText.children) as HTMLElement[];
        const getTelopSpans = (): HTMLSpanElement[] =>
            getChildren().filter(
                (child): child is HTMLSpanElement =>
                    child instanceof HTMLSpanElement && child.classList.contains(telopClass),
            );
        const getReservedWidth = (): number =>
            getChildren()
                .filter((child) => !child.classList.contains(telopClass))
                .reduce((acc, child) => acc + child.offsetWidth, 0);
        const getTelopTotalWidth = (): number =>
            getTelopSpans().reduce((acc, currentSpan) => acc + currentSpan.offsetWidth, 0);

        const availableWidth = Math.max(
            0,
            telopText.clientWidth - paddingLeftPx - paddingRightPx - getReservedWidth(),
        );
        let totalWidth: number = getTelopTotalWidth();

        while (totalWidth > availableWidth) {
            const firstSpan = getTelopSpans()[0];
            if (!firstSpan) {
                break;
            }
            if (firstSpan.textContent && firstSpan.textContent.length > 0) {
                // 先頭spanの1文字目を削除
                firstSpan.textContent = firstSpan.textContent.slice(1);
                // spanが空になったら要素ごと削除
                if (firstSpan.textContent.length === 0) {
                    telopText.removeChild(firstSpan);
                }
            } else {
                telopText.removeChild(firstSpan);
            }
            totalWidth = getTelopTotalWidth();
        }
    }

    // React描画向けスナップショットを speech 単位で更新する。
    private upsertTelopTextSegment(speechId: number, char: string): void {
        const index = this.telopTextSegments.findIndex((segment) => segment.speechId === speechId);
        if (index >= 0) {
            const target = this.telopTextSegments[index];
            this.telopTextSegments[index] = { ...target, text: target.text + char };
        } else {
            this.telopTextSegments.push({ speechId, text: char });
        }
        // React footerテロップ用の保持データは、描画を壊しにくい単純ルールだけでtrimする。
        // 幅計算はReact側で行わず、ここでは件数と総文字数の上限だけを管理する。
        if (this.telopTextSegments.length > TalkManager.MAX_TELOP_SEGMENT_COUNT) {
            this.telopTextSegments = this.telopTextSegments.slice(
                -TalkManager.MAX_TELOP_SEGMENT_COUNT,
            );
        }
        // 長時間稼働時に表示用文字列が肥大化しすぎないよう、保険として総文字数も上限制御する。
        this.trimTelopSegmentsByTotalChars(TalkManager.MAX_TELOP_TOTAL_CHARS);
        // 先頭の空白だけになった segment は詰める。
        this.telopTextSegments = this.telopTextSegments.filter(
            (segment) => segment.text.length > 0,
        );
    }

    // 先頭（古いテロップ）から文字を落として、表示用バッファの総文字数を抑える。
    private trimTelopSegmentsByTotalChars(maxTotalChars: number): void {
        let totalChars = this.telopTextSegments.reduce(
            (acc, segment) => acc + segment.text.length,
            0,
        );
        if (totalChars <= maxTotalChars) {
            return;
        }

        const nextSegments: TelopTextSegment[] = this.telopTextSegments.map((segment) => ({
            ...segment,
        }));
        while (totalChars > maxTotalChars && nextSegments.length > 0) {
            const first = nextSegments[0];
            if (first.text.length <= 0) {
                nextSegments.shift();
                continue;
            }
            first.text = first.text.slice(1);
            totalChars -= 1;
            if (first.text.length === 0) {
                nextSegments.shift();
            }
        }
        this.telopTextSegments = nextSegments;
    }

    // AppController が購読し、Control Panel / Telop React UI へ再配信するための通知。
    private emitEvent(event: TalkManagerEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}

/*
    {"session_id": "01J6TV07AMY0WCJTEVWMZXBTXP", "speech_id": 0, "sequence_id": 1, "start_at": 1725330115.214178, "confirmed": false, "recognizedResult": [["今日", 0.72412109375], ["。", 0.9111328125], ["</s>", 1.0]], "resultText": "今日。"}
    {"session_id": "01J6TV07AMY0WCJTEVWMZXBTXP", "speech_id": 0, "sequence_id": 2, "start_at": 1725330115.633875, "confirmed": false, "recognizedResult": [["今日", 0.95654296875], ["は", 0.9990234375], ["加賀", 0.2113037109375], ["。", 0.97802734375], ["</s>", 1.0]], "resultText": "今日は加賀。"}
    {"session_id": "01J6TV07AMY0WCJTEVWMZXBTXP", "speech_id": 0, "sequence_id": 3, "start_at": 1725330116.3743184, "confirmed": false, "recognizedResult": [["今日", 0.93115234375], ["は", 0.99853515625], ["9", 0.99951171875], ["月", 1.0], ["3", 0.9990234375], ["日", 1.0], ["です", 1.0], ["。", 0.998046875], ["</s>", 1.0]], "resultText": "今日は9月3日です。"}
    {"session_id": "01J6TV07AMY0WCJTEVWMZXBTXP", "speech_id": 0, "sequence_id": 4, "start_at": 1725330116.3743184, "confirmed": true, "recognizedResult": [["今日", 0.888671875], ["は", 0.998046875], ["9", 0.9990234375], ["月", 1.0], ["3", 0.9990234375], ["日", 1.0], ["です", 1.0], ["。", 1.0], ["</s>", 1.0]], "resultText": "今日は9月3日です。"}
    {"timestamp": 0.0, "message": "今日は", "vowel": null, "text": null, "length": 0.1, "new_text": true}
    {"timestamp": 0.1, "message": "今日は", "vowel": "o", "text": "キョ", "length": 0.19575100392103195, "new_text": true}
    {"timestamp": 0.3, "message": "今日は", "vowel": "o", "text": "オ", "length": 0.088856041431427, "new_text": true}
    {"timestamp": 0.4000000000000001, "message": "今日は", "vowel": "a", "text": "ワ", "length": 0.20088905841112137, "new_text": true}
    {"timestamp": 0.0, "message": "9月3日です。", "vowel": null, "text": null, "length": 0.1, "new_text": true}
    {"timestamp": 0.1, "message": "9月3日です。", "vowel": "u", "text": "ク", "length": 0.12869085371494293, "new_text": true}
    {"timestamp": 0.23999999999999996, "message": "9月3日です。", "vowel": "a", "text": "ガ", "length": 0.1680881530046463, "new_text": true}
    {"timestamp": 0.4000000000000001, "message": "9月3日です。", "vowel": "u", "text": "ツ", "length": 0.12010888755321503, "new_text": true}
    {"timestamp": 0.5200000000000001, "message": "9月3日です。", "vowel": "i", "text": "ミ", "length": 0.14170382171869278, "new_text": true}
    {"timestamp": 0.6600000000000003, "message": "9月3日です。", "vowel": "cl", "text": "ッ", "length": 0.06285825371742249, "new_text": true}
    {"timestamp": 0.7400000000000003, "message": "9月3日です。", "vowel": "a", "text": "カ", "length": 0.11659930646419525, "new_text": true}
    {"timestamp": 0.8400000000000004, "message": "9月3日です。", "vowel": "e", "text": "デ", "length": 0.1379501298069954, "new_text": true}
    {"timestamp": 0.9800000000000005, "message": "9月3日です。", "vowel": "U", "text": "ス", "length": 0.18402959406375885, "new_text": true}
 */
