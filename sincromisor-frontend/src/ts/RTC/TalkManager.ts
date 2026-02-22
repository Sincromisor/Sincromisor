import { TelopChannelMessage, ChatMessage } from "./RTCMessage";
import { ChatMessageManager } from "../UI/ChatMessageManager";

export type CurrentMora = {
    'moraID': number,
    'mora': TelopChannelMessage,
    'msec': number,
    'endTime': number
}

export type TalkManagerEvent =
    | { type: "text_channel_message"; message: ChatMessage }
    | { type: "telop_channel_message"; message: TelopChannelMessage };

export type TelopTextSegment = {
    speechId: number;
    text: string;
};

// text_ch / telop_ch の受信結果を、既存DOM描画と React購読の両方へ橋渡しする管理クラス。
// ChatMessageManager と同様、移行期間中は DOM とイベントの二重経路を持つ。
export class TalkManager {
    private static instance: TalkManager;
    private readonly chatMessageManager: ChatMessageManager;
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
        this.chatMessageManager = ChatMessageManager.getManager();
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
            const telopBox = document.querySelector("div#sincroFooterBox");
            if (telopBox) {
                telopBox.innerHTML = "";
            }
        }
    }

    // React初期描画用の簡易スナップショット（件数制限あり）。
    // DOM版の横幅切り詰めとは異なり、移行期間中は speech 単位の履歴として保持する。
    getTelopTextSegmentsSnapshot(): TelopTextSegment[] {
        return [...this.telopTextSegments];
    }

    // text_ch は既存 chat manager へ委譲しつつ、React購読向けイベントも発火する。
    addTextChannelMessage(msg: ChatMessage): void {
        console.dir(msg);
        this.chatMessageManager.writeMessage(msg);
        this.emitEvent({ type: "text_channel_message", message: msg });
    }

    // telop_ch の 1 mora 分を内部状態へ反映し、必要に応じて DOM/React 両方へ通知する。
    addTelopChannelMessage(msg: TelopChannelMessage): void {
        this.telopChannelMessage.push(msg);
        if (msg.new_text) {
            console.dir(msg);
            this.currentTelopChannelMessage = {
                'moraID': this.moraID,
                'mora': msg,
                'msec': msg.length * 1000,
                'endTime': performance.now() + msg.length * 1000
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
        this.upsertTelopTextSegment(speech_id, char || " ");
        if (!this.telopDomRenderingEnabled) {
            return;
        }
        const telopText: HTMLParagraphElement | null = document.querySelector("div#sincroFooterBox");
        if (!telopText) return;
        if (telopText.clientWidth === 0) return;

        const paddingLeftPx = parseInt(window.getComputedStyle(telopText).paddingLeft) || 0;
        const paddingRightPx = parseInt(window.getComputedStyle(telopText).paddingRight) || 0;

        // speech_idに対応するspanを探す
        let span: HTMLSpanElement | null = telopText.querySelector<HTMLSpanElement>(`span[data-speech-id="${speech_id}"]`);
        if (!span) {
            span = document.createElement("span");
            span.classList.add("sincroFooterBox__telopText");
            span.setAttribute("data-speech-id", String(speech_id));
            telopText.appendChild(span);
        }
        span.textContent += char || ' ';

        // 1文字単位で先頭から削除
        let totalWidth: number = 0;
        const spans: HTMLSpanElement[] = Array.from(telopText.children) as HTMLSpanElement[];
        totalWidth = spans.reduce((acc, s) => acc + s.offsetWidth, 0);

        while (totalWidth > telopText.clientWidth - paddingLeftPx - paddingRightPx && telopText.firstChild) {
            const firstSpan = telopText.firstChild as HTMLSpanElement;
            if (firstSpan.textContent && firstSpan.textContent.length > 0) {
                // 先頭spanの1文字目を削除
                firstSpan.textContent = firstSpan.textContent.slice(1);
                // 幅を再計算
                totalWidth = spans.reduce((acc, s) => acc + s.offsetWidth, 0);
                // spanが空になったら要素ごと削除
                if (firstSpan.textContent.length === 0) {
                    telopText.removeChild(firstSpan);
                }
            } else {
                telopText.removeChild(firstSpan);
            }
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
        // フッターテロップは表示幅制御の代替として件数で切り詰める（React描画移行期間の簡易実装）。
        if (this.telopTextSegments.length > 6) {
            this.telopTextSegments = this.telopTextSegments.slice(-6);
        }
        // 先頭の空白だけになった segment は詰める。
        this.telopTextSegments = this.telopTextSegments.filter((segment) => segment.text.length > 0);
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
