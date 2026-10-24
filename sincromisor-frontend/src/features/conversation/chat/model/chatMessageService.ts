import { frontendLogger } from "../../../../shared/logging/appLogger";
import { type ChatMessage, ChatMessageBuilder } from "../../../rtc/rtcMessage";

/** 本文と明示的なHTML許可を組にして、履歴と通知で共有する。 */
export type ChatMessageViewRecord = {
    readonly message: Readonly<ChatMessage>;
    readonly renderMode: ChatMessageRenderMode;
};

/** 履歴とアイコンを同じ更新単位で公開し、更新がない間は参照を維持する。 */
export type ChatMessageSnapshot = {
    readonly messages: readonly ChatMessageViewRecord[];
    readonly systemIconUrl: string;
    /** 通常会話の保持上限で消えない、利用者の確認待ちエラー。 */
    readonly importantNotice?: ChatMessageViewRecord;
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
    private snapshot: ChatMessageSnapshot = {
        messages: [],
        systemIconUrl: "../images/icon-system.webp",
    };
    /* 画面上に表示される最大メッセージ数 */
    private readonly maxMessageCount: number = 30;
    private readonly listeners = new Set<(event: ChatMessageServiceEvent) => void>();
    private readonly snapshotListeners = new Set<() => void>();

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

    /** 外部ストア購読向けの読み取り専用値。後続の更新で過去の値を変更しない。 */
    getSnapshot(): ChatMessageSnapshot {
        return this.snapshot;
    }

    /** 状態更新後だけ通知する。購読者は返された関数で自分の購読を解除する。 */
    subscribeSnapshot(listener: () => void): () => void {
        this.snapshotListeners.add(listener);
        return () => {
            this.snapshotListeners.delete(listener);
        };
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
        if (this.snapshot.systemIconUrl === iconUrl) return;
        this.snapshot = { ...this.snapshot, systemIconUrl: iconUrl };
        this.notifySnapshot();
        this.emitSystemIconChanged();
    }

    /** 明示的な確認だけで通知を閉じ、同じ失敗の再発を通知可能に戻す。 */
    dismissImportantNotice(): void {
        if (!this.snapshot.importantNotice) return;
        this.snapshot = { ...this.snapshot, importantNotice: undefined };
        this.lastErrorMessage = "";
        this.notifySnapshot();
    }

    // React描画向けの履歴正本。message_id ベースで更新/新規挿入を行う。
    private upsertMessageSnapshot(message: ChatMessage, isHTML: boolean): void {
        const renderMode: ChatMessageRenderMode = isHTML ? "trusted_html" : "text";
        const messages = this.snapshot.messages;
        const existingIndex = messages.findIndex(
            (m) => m.message.message_id === message.message_id,
        );
        // 呼び出し元による入力の再利用も、発行済み履歴へ波及させない。
        const record = { message: { ...message }, renderMode };
        this.snapshot = {
            ...this.snapshot,
            ...(message.message_type === "error" ? { importantNotice: record } : {}),
            messages:
                existingIndex >= 0
                    ? messages.map((previous, index) =>
                          index === existingIndex ? record : previous,
                      )
                    : [record, ...messages].slice(0, this.maxMessageCount),
        };
        this.notifySnapshot();
    }

    private notifySnapshot(): void {
        for (const listener of this.snapshotListeners) listener();
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
            systemIconUrl: this.snapshot.systemIconUrl,
        };
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}

declare global {
    var chatMessageService: ChatMessageService | undefined;
}
