import { ChatMessage, ChatMessageBuilder } from "../RTC/RTCMessage";

export class ChatMessageManager {
    private static instance: ChatMessageManager;
    private readonly chatBox: HTMLDivElement;
    private readonly systemUserID: string = "GloriousAI";
    private readonly systemUserName: string = "Glorious AI";
    /*
        メッセージのID。メッセージを一意に識別するために使用
        メッセージのIDは、メッセージが追加されるたびにインクリメントされる。
    */
    private messageID: number = 0;

    /* 画面上に表示される最大メッセージ数 */
    private readonly maxMessageCount: number = 30;

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


    private getMessageBox(messageID: string): HTMLDivElement | null {
        return this.chatBox.querySelector('#msg' + messageID);
    }

    // Chat欄にメッセージを追加、もしくはメッセージを更新する。
    // 新たにメッセージが追加された場合(ChatMessageのIDを持つMessageBoxがない)は新規にMessageBoxを作成、
    // 既存のものがある場合はp.message要素の中身を直接書き換える。
    writeMessage(cMessage: ChatMessage, isHTML: boolean = false): void {
        const box: HTMLDivElement | null = this.getMessageBox(cMessage.message_id);
        console.dir(["writeMessage", box, cMessage]);
        if (box) {
            const ePara: HTMLParagraphElement | null = box.querySelector('p.sincroMessage__text');
            if (ePara) {
                if (isHTML) {
                    ePara.innerHTML = cMessage.message;
                } else {
                    ePara.innerText = cMessage.message;

                }
            }
        } else {
            this.createNewMessageBox(cMessage);
        }
    }

    /*
        誰かわからないユーザーのメッセージを出力する。主にデバッグ用。
        生成したメッセージのdiv要素を返す。
    */
    writeUnknownUserMessage(message: string, isHTML: boolean = false): HTMLDivElement {
        const chatMessage: ChatMessage = new ChatMessageBuilder('user', 'UnknownUser', 'Unknown User', message);
        return this.createNewMessageBox(chatMessage, isHTML);
    }

    /*
        システムの返信としてメッセージを出力する。
        生成したメッセージのdiv要素を返す。
    */
    writeSystemMessage(message: string, isHTML: boolean = false): HTMLDivElement {
        const chatMessage: ChatMessage = new ChatMessageBuilder('system', this.systemUserID, this.systemUserName, message);
        return this.createNewMessageBox(chatMessage, isHTML);
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
        const chatMessage: ChatMessage = new ChatMessageBuilder('error', this.systemUserID, this.systemUserName, message);
        return this.createNewMessageBox(chatMessage);
    }

    /*
        システムのリセットメッセージとしてメッセージを出力する。
        メッセージのdiv要素を返す。
    */
    writeResetMessage(message: string): HTMLDivElement {
        const chatMessage: ChatMessage = new ChatMessageBuilder('reset', this.systemUserID, this.systemUserName, message);
        return this.createNewMessageBox(chatMessage);
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
        eIcon.src = `../images/icon-${cMessage.message_type}.webp`;
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

        this.chatBox.prepend(e);
        setTimeout(() => { e.style.opacity = '1'; }, 200);
        //this.autoScroll();
        this.removeOldMessage();
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
}

declare global {
    var chatMessageManager: ChatMessageManager;
}

window.chatMessageManager = ChatMessageManager.getManager();
