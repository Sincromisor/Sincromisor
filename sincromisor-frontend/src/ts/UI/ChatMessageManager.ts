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

// チャット欄の既存DOM描画を維持しつつ、React側へ同じ内容をイベント配信する移行期の管理クラス。
// 既存コードは write* API を変更せず利用でき、React UI は subscribe + snapshot API で同期する。
export class ChatMessageManager {
    private static instance: ChatMessageManager;
    private chatBox: HTMLDivElement | null;
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
            const chatBox: HTMLDivElement | null = document.querySelector("div#sincroChatBox");
            ChatMessageManager.instance = new ChatMessageManager(chatBox);
        }
        return ChatMessageManager.instance;
    }

    private constructor(chatBox: HTMLDivElement | null) {
        this.chatBox = chatBox;
    }

    // React移行で追加した購読口。DOM描画の有無に関係なくイベントを受け取れる。
    subscribe(listener: (event: ChatMessageManagerEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // React UI へ移行中のため、既存DOM描画を止めてイベント配信だけを使うモードを用意する。
    setDomRenderingEnabled(enabled: boolean): void {
        this.domRenderingEnabled = enabled;
        const chatBox = this.ensureChatBoxBound();
        if (!chatBox) {
            return;
        }
        if (!enabled) {
            chatBox.innerHTML = "";
            return;
        }
        this.renderDomSnapshot();
    }

    // React 側の初期描画用に、現時点のチャット履歴（新しい順）を返す。
    // renderModeを使わない利用箇所向けの互換APIとして残している。
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
        return this.ensureChatBoxBound()?.querySelector('#msg' + messageID) ?? null;
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
        const chatBox = this.ensureChatBoxBound();
        if (this.domRenderingEnabled && chatBox) {
            const systemIcons = chatBox.querySelectorAll<HTMLImageElement>('div.sincroSystemMessage img.sincroMessage__icon');
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
        const e = this.createMessageBoxElement(cMessage, isHTML);
        const chatBox = this.ensureChatBoxBound();
        if (this.domRenderingEnabled && chatBox) {
            chatBox.prepend(e);
            setTimeout(() => { e.style.opacity = '1'; }, 200);
            //this.autoScroll();
            this.removeOldMessage();
        }
        return e;
    }

    // legacy DOM fallback を再有効化したとき、保持済み snapshot から一覧を復元する。
    private renderDomSnapshot(): void {
        const chatBox = this.ensureChatBoxBound();
        if (!chatBox) {
            return;
        }
        chatBox.innerHTML = "";
        for (const record of this.messages) {
            const messageBox = this.createMessageBoxElement(record.message, record.renderMode === "trusted_html");
            // React描画時と違い CSS 初期opacity=0 を使わないため、即座に表示状態へそろえる。
            messageBox.style.opacity = "1";
            chatBox.appendChild(messageBox);
        }
    }

    private createMessageBoxElement(cMessage: ChatMessage, isHTML: boolean): HTMLDivElement {
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
        return e;
    }

    private messageTypeToMessageClassName(message_type: string): string {
        const name = message_type.charAt(0).toUpperCase() + message_type.slice(1);
        return `sincro${name}Message`;
    }

    /* メッセージ数がmaxMessageCountを超えた場合、古いメッセージを削除する。 */
    private removeOldMessage() {
        const chatBox = this.ensureChatBoxBound();
        if (!chatBox) {
            return;
        }
        while (chatBox.childNodes.length >= this.maxMessageCount) {
            chatBox.childNodes[chatBox.childNodes.length - 1].remove();
        }
    }

    // React shell が後から mount される構成でも、旧 DOM fallback を安全に再接続する。
    private ensureChatBoxBound(): HTMLDivElement | null {
        if (this.chatBox?.isConnected) {
            return this.chatBox;
        }
        const nextChatBox: HTMLDivElement | null = document.querySelector("div#sincroChatBox");
        if (!nextChatBox) {
            return this.chatBox;
        }
        const shouldHydrateDom = this.chatBox !== nextChatBox && this.domRenderingEnabled;
        this.chatBox = nextChatBox;
        if (shouldHydrateDom) {
            this.renderDomSnapshot();
        }
        return this.chatBox;
    }

    // React描画向けの履歴正本。message_id ベースで更新/新規挿入を行う。
    private upsertMessageSnapshot(message: ChatMessage, isHTML: boolean): void {
        const renderMode: ChatMessageRenderMode = isHTML ? "trusted_html" : "text";
        const existingIndex = this.messages.findIndex((m) => m.message.message_id === message.message_id);
        if (existingIndex >= 0) {
            this.messages[existingIndex] = { message, renderMode };
            return;
        }
        this.messages = [{ message, renderMode }, ...this.messages].slice(0, this.maxMessageCount);
    }

    // DOM描画を止めていても React UI が再構築できるよう、renderMode を含めて通知する。
    private emitMessage(message: ChatMessage, isHTML: boolean): void {
        const renderMode: ChatMessageRenderMode = isHTML ? "trusted_html" : "text";
        const event: ChatMessageManagerEvent = { type: "message", message, viewRecord: { message, renderMode } };
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    // systemアイコン差し替え（VRMサムネイル反映）を React UI にも伝える。
    private emitSystemIconChanged(): void {
        const event: ChatMessageManagerEvent = { type: "system_icon_changed", systemIconUrl: this.systemIconUrl };
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}

declare global {
    var chatMessageManager: ChatMessageManager | undefined;
}
