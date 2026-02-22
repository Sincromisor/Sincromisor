import { ChatMessage, ChatMessageBuilder } from "../RTC/RTCMessage";

export type ChatMessageViewRecord = {
    message: ChatMessage;
    renderMode: ChatMessageRenderMode;
};

export type ChatMessageRenderMode = "text" | "trusted_html";

export type ChatMessageManagerEvent = {
    type: "message" | "system_icon_changed";
    message?: ChatMessage;
    viewRecord?: ChatMessageViewRecord;
    systemIconUrl?: string;
};

export class ChatMessageManager {
    private static instance: ChatMessageManager;
    private readonly chatBox: HTMLDivElement;
    private readonly systemUserID: string = "GloriousAI";
    private readonly systemUserName: string = "Glorious AI";
    // systemメッセージだけは、VRMのthumbnailImageに動的に差し替え可能にする。
    // 取得前/未設定VRM向けに既存アイコンをデフォルト値として保持する。
    private systemIconUrl: string = "../images/icon-system.webp";
    /*
        メッセージのID。メッセージを一意に識別するために使用
        メッセージのIDは、メッセージが追加されるたびにインクリメントされる。
    */
    private messageID: number = 0;

    /* 画面上に表示される最大メッセージ数 */
    private readonly maxMessageCount: number = 30;
    private readonly listeners = new Set<(event: ChatMessageManagerEvent) => void>();
    private domRenderingEnabled: boolean = true;
    private messages: ChatMessageViewRecord[] = [];

    /* 同じエラーメッセージが何度も表示されないようにするために使用 */
    lastErrorMessage: string = '';

    static getManager(): ChatMessageManager {
        if (!ChatMessageManager.instance) {
            const e: HTMLDivElement | null = document.querySelector("div#sincroChatBox");
            if (!e) {
                throw 'div#sincroChatBox is not found.';
            }
            ChatMessageManager.instance = new ChatMessageManager(e);
        }
        return ChatMessageManager.instance;
    }

    private constructor(chatBoxID: HTMLDivElement) {
        this.chatBox = chatBoxID;
    }

    subscribe(listener: (event: ChatMessageManagerEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // React UI へ移行中のため、既存DOM描画を止めてイベント配信だけを使うモードを用意する。
    setDomRenderingEnabled(enabled: boolean): void {
        this.domRenderingEnabled = enabled;
        if (!enabled) {
            this.chatBox.innerHTML = "";
        }
    }

    // React 側の初期描画用に、現時点のチャット履歴（新しい順）を返す。
    getMessagesSnapshot(): ChatMessage[] {
        return this.messages.map((record) => record.message);
    }

    // React描画では HTMLフラグを参照して表示方針を切り替えるため、描画メタデータを返す。
    getMessageViewSnapshot(): ChatMessageViewRecord[] {
        return [...this.messages];
    }

    getSystemIconUrl(): string {
        return this.systemIconUrl;
    }


    private getMessageBox(messageID: string): HTMLDivElement | null {
        return this.chatBox.querySelector('#msg' + messageID);
    }

    // Chat欄にメッセージを追加、もしくはメッセージを更新する。
    // 新たにメッセージが追加された場合(ChatMessageのIDを持つMessageBoxがない)は新規にMessageBoxを作成、
    // 既存のものがある場合はp.message要素の中身を直接書き換える。
    writeMessage(cMessage: ChatMessage, isHTML: boolean = false): void {
        this.upsertMessageSnapshot(cMessage, isHTML);
        const box: HTMLDivElement | null = this.getMessageBox(cMessage.message_id);
        console.dir(["writeMessage", box, cMessage]);
        if (this.domRenderingEnabled && box) {
            const ePara: HTMLParagraphElement | null = box.querySelector('p.sincroMessage__text');
            if (ePara) {
                if (isHTML) {
                    ePara.innerHTML = cMessage.message;
                } else {
                    ePara.innerText = cMessage.message;

                }
            }
        } else if (this.domRenderingEnabled) {
            this.createNewMessageBox(cMessage, isHTML);
        }
        this.emitMessage(cMessage, isHTML);
    }

    /*
        誰かわからないユーザーのメッセージを出力する。主にデバッグ用。
        生成したメッセージのdiv要素を返す。
    */
    writeUnknownUserMessage(message: string, isHTML: boolean = false): HTMLDivElement {
        const chatMessage: ChatMessage = new ChatMessageBuilder('user', 'UnknownUser', 'Unknown User', -1, message);
        const box = this.createNewMessageBox(chatMessage, isHTML);
        this.emitMessage(chatMessage, isHTML);
        return box;
    }

    /*
        システムの返信としてメッセージを出力する。
        生成したメッセージのdiv要素を返す。
    */
    writeSystemMessage(message: string, isHTML: boolean = false): HTMLDivElement {
        const chatMessage: ChatMessage = new ChatMessageBuilder('system', this.systemUserID, this.systemUserName, -1, message);
        const box = this.createNewMessageBox(chatMessage, isHTML);
        this.emitMessage(chatMessage, isHTML);
        return box;
    }

    /*
        システムのエラーメッセージとしてメッセージを出力する。
        メッセージのdiv要素を返す。
    */
    writeErrorMessage(message: string, force: boolean = false): HTMLDivElement | null {
        /* 同じエラーメッセージが何度も繰り返されないようにする。 */
        if (!force && this.lastErrorMessage == message) {
            return null;
        }
        this.lastErrorMessage = message;
        const chatMessage: ChatMessage = new ChatMessageBuilder('error', this.systemUserID, this.systemUserName, -1, message);
        const box = this.createNewMessageBox(chatMessage);
        this.emitMessage(chatMessage, false);
        return box;
    }

    /*
        システムのリセットメッセージとしてメッセージを出力する。
        メッセージのdiv要素を返す。
    */
    writeResetMessage(message: string): HTMLDivElement {
        const chatMessage: ChatMessage = new ChatMessageBuilder('reset', this.systemUserID, this.systemUserName, -1, message);
        const box = this.createNewMessageBox(chatMessage);
        this.emitMessage(chatMessage, false);
        return box;
    }

    // 既存表示済みのsystemメッセージも含めてアイコンを一括更新する。
    // (VRMロード完了が初回メッセージ表示より後になるため、後追い更新が必要)
    setSystemIcon(iconUrl: string): void {
        this.systemIconUrl = iconUrl;
        if (this.domRenderingEnabled) {
            const systemIcons = this.chatBox.querySelectorAll<HTMLImageElement>('div.sincroSystemMessage img.sincroMessage__icon');
            systemIcons.forEach((icon) => {
                icon.src = this.systemIconUrl;
            });
        }
        this.emitSystemIconChanged();
    }

    /*
        <div id="chatBox"></div>の末尾に、下記のような要素を追記する。
        追記したdiv要素を返す。
    
        <div class="sincroMessage__systemMessage">
            <div class="sincroMessage__icon"><img src="/icon-system.png"></div>
            <p class="sincroMessage__text">てきとうなメッセージ</p>
        </div>

        cMessage: メッセージ本体(text or html)。htmlの時はisHTMLをtrueにする。
        isHTML: messageObjがhtmlの時はtrue、textの時はfalseを渡す。
    */
    private createNewMessageBox(cMessage: ChatMessage, isHTML = false): HTMLDivElement {
        this.upsertMessageSnapshot(cMessage, isHTML);
        const eDisplayName = document.createElement("span");
        eDisplayName.className = "display_name";
        eDisplayName.innerText = cMessage.speaker_name;

        const eUserName = document.createElement("span");
        eUserName.className = "username";
        eUserName.innerText = "@" + cMessage.speaker_id;

        const eIconBox = document.createElement("div");
        eIconBox.className = "sincroMessage__iconBox";

        const eIcon = document.createElement("img");
        eIcon.className = "sincroMessage__icon";
        // systemのみ動的アイコン、それ以外(message_type別)は従来の静的アイコンを使う。
        if (cMessage.message_type === 'system') {
            eIcon.src = this.systemIconUrl;
        } else {
            eIcon.src = `../images/icon-${cMessage.message_type}.webp`;
        }
        eIconBox.appendChild(eIcon);

        const eMesg = document.createElement("p");
        eMesg.className = "sincroMessage__text";
        if (isHTML) {
            eMesg.innerHTML = cMessage.message;
        } else {
            eMesg.innerText = cMessage.message;
        }

        const e = document.createElement("div");
        e.id = `msg${cMessage.message_id}`;
        this.messageID += 1;
        /* message_typeはsystem, user, error, resetのいずれか */
        e.className = `${this.messageTypeToMessageClassName(cMessage.message_type)} sincroMessage`;
        e.appendChild(eIconBox);
        e.appendChild(eMesg);

        if (this.domRenderingEnabled) {
            this.chatBox.prepend(e);
            setTimeout(() => { e.style.opacity = '1'; }, 200);
            //this.autoScroll();
            this.removeOldMessage();
        }
        return e;
    }

    private messageTypeToMessageClassName(message_type: string): string {
        const name = message_type.charAt(0).toUpperCase() + message_type.slice(1);
        return `sincro${name}Message`;
    }

    /* メッセージ数がmaxMessageCountを超えた場合、古いメッセージを削除する。 */
    private removeOldMessage() {
        while (this.chatBox.childNodes.length >= this.maxMessageCount) {
            this.chatBox.childNodes[this.chatBox.childNodes.length - 1].remove();
        }
    }

    private upsertMessageSnapshot(message: ChatMessage, isHTML: boolean): void {
        const renderMode: ChatMessageRenderMode = isHTML ? "trusted_html" : "text";
        const existingIndex = this.messages.findIndex((m) => m.message.message_id === message.message_id);
        if (existingIndex >= 0) {
            this.messages[existingIndex] = { message, renderMode };
            return;
        }
        this.messages = [{ message, renderMode }, ...this.messages].slice(0, this.maxMessageCount);
    }

    private emitMessage(message: ChatMessage, isHTML: boolean): void {
        const renderMode: ChatMessageRenderMode = isHTML ? "trusted_html" : "text";
        const event: ChatMessageManagerEvent = { type: "message", message, viewRecord: { message, renderMode } };
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    private emitSystemIconChanged(): void {
        const event: ChatMessageManagerEvent = { type: "system_icon_changed", systemIconUrl: this.systemIconUrl };
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}

declare global {
    var chatMessageManager: ChatMessageManager;
}

window.chatMessageManager = ChatMessageManager.getManager();
