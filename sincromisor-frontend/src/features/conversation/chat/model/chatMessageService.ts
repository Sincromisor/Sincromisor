import { frontendLogger } from "../../../../shared/logging/appLogger";
import { type ChatMessage, ChatMessageBuilder } from "../../../rtc/rtcMessage";

/** 本文と明示的なHTML許可を組にして、履歴と通知で共有する。 */
export type ChatMessageViewRecord = {
    message: ChatMessage;
    renderMode: ChatMessageRenderMode;
};

/** 通常文字列と、既存の信頼済みHTMLを区別する。 */
export type ChatMessageRenderMode = "text" | "trusted_html";

/** 履歴更新またはVRM読込後のアイコン変更を画面へ通知する。 */
export type ChatMessageServiceEvent = {
    type: "message" | "system_icon_changed";
    message?: ChatMessage;
    viewRecord?: ChatMessageViewRecord;
    systemIconUrl?: string;
};

/** チャット履歴と通知を保持する。DOM描画はSincroChatViewが担う。 */
export class ChatMessageService {
    private static instance: ChatMessageService;
    private readonly systemUserID: string = "GloriousAI";
    private readonly systemUserName: string = "Glorious AI";
    // systemメッセージだけは、VRMのthumbnailImageに動的に差し替え可能にする。
    // 取得前/未設定VRM向けに既存アイコンをデフォルト値として保持する。
    private systemIconUrl: string = "../images/icon-system.webp";
    /* 画面上に表示される最大メッセージ数 */
    private readonly maxMessageCount: number = 30;
    private readonly listeners = new Set<(event: ChatMessageServiceEvent) => void>();
    private messages: ChatMessageViewRecord[] = [];

    /* 同じエラーメッセージが何度も表示されないようにするために使用 */
    lastErrorMessage: string = "";

    /** ページ内で共有する履歴を、React取り付け前から利用できるようにする。 */
    static getService(): ChatMessageService {
        if (!ChatMessageService.instance) {
            ChatMessageService.instance = new ChatMessageService();
        }
        return ChatMessageService.instance;
    }

    private constructor() {}

    /** 以後の変更を購読する。画面の取り外し時に返された関数で解除する。 */
    subscribe(listener: (event: ChatMessageServiceEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** React初期描画用に、描画方式を含む件数制限付き履歴を新しい順で返す。 */
    getMessageViewSnapshot(): ChatMessageViewRecord[] {
        return [...this.messages];
    }

    /** 初期表示用に、現在のシステムアイコンを返す。 */
    getSystemIconUrl(): string {
        return this.systemIconUrl;
    }

    /** 同じIDはその位置で更新し、新規IDは履歴の先頭へ追加して通知する。 */
    writeMessage(cMessage: ChatMessage, isHTML: boolean = false): void {
        this.upsertMessageSnapshot(cMessage, isHTML);
        frontendLogger.debug("Chat message render requested.", {
            messageId: cMessage.message_id,
            messageType: cMessage.message_type,
            renderMode: isHTML ? "trusted_html" : "text",
        });
        this.emitMessage(cMessage, isHTML);
    }

    /** 誰かわからないユーザーのメッセージを出力する。主にデバッグ用。 */
    writeUnknownUserMessage(message: string, isHTML: boolean = false): void {
        const chatMessage: ChatMessage = new ChatMessageBuilder({
            messageType: "user",
            speakerId: "UnknownUser",
            speakerName: "Unknown User",
            speechId: -1,
            message,
        });
        this.writeMessage(chatMessage, isHTML);
    }

    /** システムの返信としてメッセージを出力する。 */
    writeSystemMessage(message: string, isHTML: boolean = false): void {
        const chatMessage: ChatMessage = new ChatMessageBuilder({
            messageType: "system",
            speakerId: this.systemUserID,
            speakerName: this.systemUserName,
            speechId: -1,
            message,
        });
        this.writeMessage(chatMessage, isHTML);
    }

    /** システムのエラーメッセージとしてメッセージを出力する。 */
    writeErrorMessage(message: string, force: boolean = false): void {
        /* 同じエラーメッセージが何度も繰り返されないようにする。 */
        if (!force && this.lastErrorMessage === message) {
            return;
        }
        this.lastErrorMessage = message;
        const chatMessage: ChatMessage = new ChatMessageBuilder({
            messageType: "error",
            speakerId: this.systemUserID,
            speakerName: this.systemUserName,
            speechId: -1,
            message,
        });
        this.writeMessage(chatMessage);
    }

    /** システムのリセットメッセージとしてメッセージを出力する。 */
    writeResetMessage(message: string): void {
        const chatMessage: ChatMessage = new ChatMessageBuilder({
            messageType: "reset",
            speakerId: this.systemUserID,
            speakerName: this.systemUserName,
            speechId: -1,
            message,
        });
        this.writeMessage(chatMessage);
    }

    /** VRM読込後のアイコンを通知し、表示済みのシステムメッセージにも反映する。 */
    setSystemIcon(iconUrl: string): void {
        this.systemIconUrl = iconUrl;
        this.emitSystemIconChanged();
    }

    // React描画向けの履歴正本。message_id ベースで更新/新規挿入を行う。
    private upsertMessageSnapshot(message: ChatMessage, isHTML: boolean): void {
        const renderMode: ChatMessageRenderMode = isHTML ? "trusted_html" : "text";
        const existingIndex = this.messages.findIndex(
            (m) => m.message.message_id === message.message_id,
        );
        if (existingIndex >= 0) {
            this.messages[existingIndex] = { message, renderMode };
            return;
        }
        this.messages = [{ message, renderMode }, ...this.messages].slice(0, this.maxMessageCount);
    }

    // 本文と描画方式を一緒に通知し、履歴からの初期表示と追加更新を一致させる。
    private emitMessage(message: ChatMessage, isHTML: boolean): void {
        const renderMode: ChatMessageRenderMode = isHTML ? "trusted_html" : "text";
        const event: ChatMessageServiceEvent = {
            type: "message",
            message,
            viewRecord: { message, renderMode },
        };
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    // systemアイコン差し替え（VRMサムネイル反映）を React UI にも伝える。
    private emitSystemIconChanged(): void {
        const event: ChatMessageServiceEvent = {
            type: "system_icon_changed",
            systemIconUrl: this.systemIconUrl,
        };
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}

declare global {
    var chatMessageService: ChatMessageService | undefined;
}
