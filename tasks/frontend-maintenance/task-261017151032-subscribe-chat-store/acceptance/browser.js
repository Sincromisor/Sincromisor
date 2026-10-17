async (page) => {
    await page.goto("http://127.0.0.1:5173/simple-vrm/");
    await page.locator("#debugConsole").waitFor({ state: "attached" });
    return page.evaluate(async () => {
        const source = name => performance.getEntriesByType("resource").find(entry => entry.name.split("?")[0].endsWith(`/${name}`)).name;
        const { default: { createElement } } = await import(source("react.js"));
        const { default: { createRoot } } = await import(source("react-dom_client.js"));
        const { SincroChatView } = await import(source("sincroChatView.tsx"));
        const { SincroAppController: App } = await import(source("sincroAppController.ts"));
        const { ChatMessageService } = await import(source("chatMessageService.ts"));
        const service = ChatMessageService.getService();
        const originalGet = App.getCurrent, originalSubscribe = App.subscribeCurrent;
        const callbacks = new Set();
        let registered = 0, removed = 0;
        const chat = {
            getSnapshot: () => service.getSnapshot(),
            subscribeSnapshot: listener => {
                registered++;
                const stop = service.subscribeSnapshot(listener);
                return () => { removed++; stop(); };
            }
        };
        let current;
        App.getCurrent = () => current;
        App.subscribeCurrent = listener => { callbacks.add(listener); listener(current); return () => callbacks.delete(listener); };
        const change = value => { current = value; for (const cb of callbacks) cb(value); };
        const host = document.createElement("div"); document.body.append(host);
        const root = createRoot(host);
        const tick = () => new Promise(resolve => setTimeout(resolve, 200));
        try {
            service.writeSystemMessage("取り付け前の履歴");
            root.render(createElement(SincroChatView)); await tick();
            if (host.textContent !== "") throw Error("Missing controller should be empty");
            change({ chat }); await tick();
            if (!host.textContent.includes("取り付け前の履歴")) throw Error("Initial history missing");
            service.writeSystemMessage("更新確認"); service.setSystemIcon("/images/icon-user.webp"); await tick();
            if (!host.textContent.includes("更新確認") || host.querySelector("img").getAttribute("src") !== "/images/icon-user.webp") throw Error("Update missing");
            change({ chat }); await tick();
            if (registered !== 2 || removed !== 1) throw Error("Replacement leaked subscription");
            service.writeSystemMessage("共有サービスの更新"); await tick();
            if (!host.textContent.includes("共有サービスの更新")) throw Error("Shared service disconnected");
            change(undefined); await tick();
            service.writeSystemMessage("解除中"); await tick();
            if (host.textContent !== "" || removed !== 2) throw Error("Cleared controller still renders");
            change({ chat }); await tick();
            root.unmount();
            if (registered !== 3 || removed !== 3 || callbacks.size !== 0) throw Error("Unmount leaked");
            return { registered, removed, controllerListeners: callbacks.size };
        } finally {
            App.getCurrent = originalGet; App.subscribeCurrent = originalSubscribe;
            host.remove();
        }
    });
}
