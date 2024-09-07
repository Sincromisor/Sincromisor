export class ChatMessage {
    constructor(chatBoxID) {
        this.chatBox = chatBoxID;
        this.messageID = 0;
        this.systemUserName = "GloriousAI";
        this.systemDisplayName = "Glorious AI";

        /* 同じエラーメッセージが何度も表示されないようにするために使用 */
        this.lastErrorMessage = null;
    }

    writeAisatsu() {
        this.writeUserMessage("こんにちは～");
        this.writeSystemMessage(`私は　${this.systemDisplayName}　です!<br>なんでも　質問してください!`);
        document.querySelector("title").innerText = `${this.systemDisplayName} Chat`;
    }

    /*
        ユーザーの問い合わせとしてメッセージを出力する。
        メッセージのdiv要素のIDを返す。
    */
    writeUserMessage(message, time = Date.now()) {
        const request = { "name": "ユーザー", "message": message, "time": time }
        return this.writeComment(request, "user",
            document.querySelector("div#profile input#username").value,
            document.querySelector("div#profile input#display_name").value);
    }

    /*
        システムの返信としてメッセージを出力する。
        メッセージのdiv要素のIDを返す。
     */
    writeSystemMessage(message) {
        const response = { "name": "システム", "message": message, "time": Date.now() }
        return this.writeComment(response, "user", this.systemUserName, this.systemDisplayName, true);
    }

    /*
        システムの返信内容を更新する。
        メッセージのdiv要素のIDを返す。
    */
    updateSystemMessage(msgID, message) {
        const eMesg = document.querySelector(`#${msgID} p.message`);
        eMesg.innerHTML = message;
        //this.autoScroll();
        return msgID;
    }

    writeSystemMessageText(message) {
        const response = { "name": "システム", "message": message, "time": Date.now() }
        return this.writeComment(response, "user", this.systemUserName, this.systemDisplayName, false);
    }

    updateSystemMessageText(msgID, message) {
        const eMesg = document.querySelector(`#${msgID} p.message`);
        eMesg.innerText = message;
        //this.autoScroll();
        return msgID;
    }

    /*
        システムのエラーメッセージとしてメッセージを出力する。
        メッセージのdiv要素のIDを返す。
    */
    writeErrorMessage(message) {
        /* 同じエラーメッセージが何度も繰り返されないようにする。 */
        if (this.lastErrorMessage == message) {
            return;
        }
        this.lastErrorMessage = message;
        const response = { "name": "システム", "message": message, "time": Date.now() }
        return this.writeComment(response, "error", this.systemUserName, this.systemDisplayName);
    }

    /*
        システムのリセットメッセージとしてメッセージを出力する。
        メッセージのdiv要素のIDを返す。
    */
    writeResetMessage(message) {
        const response = { "name": "システム", "message": message, "time": Date.now() }
        return this.writeComment(response, "reset", this.systemUserName, this.systemDisplayName);
    }

    /* 投稿時と返信受信時に、要素の末尾にスクロールする。 */
    autoScroll() {
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
    writeComment(messageObj, className, username, display_name, isHTML = false) {
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
            eMesg.innerHTML = messageObj["message"];
        } else {
            eMesg.innerText = messageObj["message"];
        }

        const e = document.createElement("div");
        e.id = `msg${this.messageID}`;
        this.messageID += 1;
        e.className = className + "Message obsMessage";
        e.appendChild(eIcon);
        e.appendChild(eMesg);

        this.chatBox.prepend(e);
        setTimeout(() => { e.style.opacity = 1; }, 100);
        //this.autoScroll();
        return e.id;
    }

    removeOldMessage(count) {
        while (this.chatBox.childNodes.length >= count) {
            this.chatBox.childNodes[this.chatBox.childNodes.length - 1].remove();
        }
    }
}
