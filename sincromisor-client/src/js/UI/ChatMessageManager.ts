interface ChatMessage {
    name: string,
    message: string,
    time: number
}

export class ChatMessageManager {
    private static instance: ChatMessageManager;
    chatBox: HTMLDivElement;
    messageID: number = 0;
    systemUserName: string = "GloriousAI";
    systemDisplayName: string = "Glorious AI";
    /* 同じエラーメッセージが何度も表示されないようにするために使用 */
    lastErrorMessage: string = '';

    static getManager() {
        if (!ChatMessageManager.instance) {
            const e: HTMLDivElement | null = document.querySelector("div#obsMessageBox");
            if (!e) {
                throw 'div#obsMessageBox is not found.';
            }
            ChatMessageManager.instance = new ChatMessageManager(e);
        }
        return ChatMessageManager.instance;
    }

    private constructor(chatBoxID: HTMLDivElement) {
        this.chatBox = chatBoxID;
    }

    /*
        システムの返信としてメッセージを出力する。
        生成したメッセージのdiv要素を返す。
     */
    writeSystemMessage(message: string): HTMLDivElement {
        const response = { "name": "システム", "message": message, "time": Date.now() }
        return this.writeComment(response, "user", this.systemUserName, this.systemDisplayName, true);
    }

    /*
        システムの返信内容を更新する。
        メッセージのdiv要素のIDを返す。
    */
    updateSystemMessage(eMesg: HTMLDivElement, message: string): HTMLDivElement {
        const ePara: HTMLParagraphElement | null = eMesg.querySelector('p.message');

        if (ePara) {
            ePara.innerHTML = message;
        }
        //this.autoScroll();
        return eMesg;
    }

    writeSystemMessageText(message: string): HTMLDivElement {
        const response = { "name": "システム", "message": message, "time": Date.now() }
        return this.writeComment(response, "user", this.systemUserName, this.systemDisplayName, false);
    }

    updateSystemMessageText(eMesg: HTMLDivElement, message: string): HTMLDivElement {
        const ePara: HTMLParagraphElement | null = eMesg.querySelector('p.message');

        if (ePara) {
            ePara.innerText = message;
        }
        //this.autoScroll();
        return eMesg;
    }

    /*
        システムのエラーメッセージとしてメッセージを出力する。
        メッセージのdiv要素のIDを返す。
    */
    writeErrorMessage(message: string): HTMLDivElement | null {
        /* 同じエラーメッセージが何度も繰り返されないようにする。 */
        if (this.lastErrorMessage == message) {
            return null;
        }
        this.lastErrorMessage = message;
        const response = { "name": "システム", "message": message, "time": Date.now() }
        return this.writeComment(response, "error", this.systemUserName, this.systemDisplayName);
    }

    /*
        システムのリセットメッセージとしてメッセージを出力する。
        メッセージのdiv要素のIDを返す。
    */
    writeResetMessage(message: string): HTMLDivElement {
        const response = { "name": "システム", "message": message, "time": Date.now() }
        return this.writeComment(response, "reset", this.systemUserName, this.systemDisplayName);
    }

    /* 投稿時と返信受信時に、要素の末尾にスクロールする。 */
    autoScroll(): void {
        //const element = document.documentElement;
        //this.chatBox.scrollTo(0, this.chatBox.clientHeight);
        this.chatBox.scrollTo({
            top: this.chatBox.scrollHeight,
            left: 0,
            behavior: "smooth"
        });
    }

    /*
      <div id="chatBox"></div>の末尾に、下記のような要素を追記する。
      追記したdiv要素のIDをテキストで返す。
    
      <div class="systemMessage">
        <div class="icon"><img src="/icon-system.png"></div>
        <p class="message">てきとうなメッセージ</p>
      </div>

      messageObj: メッセージ本体(text or html)。htmlの時はisHTMLをtrueにする。
      className: user, system, error, resetのいずれか。
      username: ユーザ名(例: Glorious AI)
      display_name: ユーザID(例: @GloriousAI)
      isHTML: messageObjがhtmlの時はtrue、textの時はfalseを渡す。
    */
    writeComment(messageObj: ChatMessage, className: string, username: string, display_name: string, isHTML = false): HTMLDivElement {
        const eDisplayName = document.createElement("span");
        eDisplayName.className = "display_name";
        eDisplayName.innerText = display_name;

        const eUserName = document.createElement("span");
        eUserName.className = "username";
        eUserName.innerText = " @" + username;

        const eIcon = document.createElement("img");
        eIcon.className = "icon";
        eIcon.src = `images/icon-${className}.webp`;

        const eMesg = document.createElement("p");
        eMesg.className = "message";
        if (isHTML) {
            eMesg.innerHTML = messageObj.message;
        } else {
            eMesg.innerText = messageObj.message;
        }

        const e = document.createElement("div");
        e.id = `msg${this.messageID}`;
        this.messageID += 1;
        e.className = className + "Message obsMessage";
        e.appendChild(eIcon);
        e.appendChild(eMesg);

        this.chatBox.prepend(e);
        setTimeout(() => { e.style.opacity = '1'; }, 100);
        //this.autoScroll();
        return e;
    }

    removeOldMessage(count: number) {
        while (this.chatBox.childNodes.length >= count) {
            this.chatBox.childNodes[this.chatBox.childNodes.length - 1].remove();
        }
    }
}
