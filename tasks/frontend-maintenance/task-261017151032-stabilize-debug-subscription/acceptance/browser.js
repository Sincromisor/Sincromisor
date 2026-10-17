async (page) => {
    await page.goto("http://127.0.0.1:5173/simple-vrm/");
    await page.locator("#debugConsole").waitFor({ state: "attached" });
    return page.evaluate(async () => {
        const resource = (name) => performance.getEntriesByType("resource").find((entry) => entry.name.includes(`/deps/${name}.js`)).name;
        const { default: { createElement } } = await import(resource("react"));
        const { default: { createRoot } } = await import(resource("react-dom_client"));
        const { DebugConsole } = await import(performance.getEntriesByType("resource").find(entry => /\/debugConsole\.tsx(?:\?|$)/.test(entry.name)).name);
        const { DebugConsoleManager } = await import(performance.getEntriesByType("resource").find(entry => /\/debugConsoleManager\.ts(?:\?|$)/.test(entry.name)).name);
        const manager = DebugConsoleManager.getManager();
        const subscribe = manager.subscribeSnapshot;
        let registered = 0;
        let removed = 0;
        manager.subscribeSnapshot = function (listener) {
            registered++;
            const stop = subscribe.call(this, listener);
            return () => { removed++; stop(); };
        };
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        const tick = () => new Promise(resolve => setTimeout(resolve, 1000));
        try {
            root.render(createElement(DebugConsole));
            await tick();
            if (registered !== 1) throw Error(`Initial subscriptions: ${registered}; DOM: ${host.innerHTML.slice(0,200)}`);
            host.querySelector('[role="tab"][id$="audio"]').click();
            manager.setLocalVadRmsThreshold(0.03);
            await tick();
            root.render(createElement(DebugConsole));
            await tick();
            if (registered !== 1 || removed !== 0) throw Error("Resubscribed on render");
            if (host.querySelector("#localVadRmsThreshold").value !== "0.03") throw Error("Update missing");
            root.unmount();
            if (removed !== 1) throw Error("Subscription leaked");
            return { registered, removed };
        } finally {
            manager.subscribeSnapshot = subscribe;
            host.remove();
        }
    });
}
