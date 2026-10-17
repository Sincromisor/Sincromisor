async (page) => {
    await page.goto("http://127.0.0.1:5173/simple-vrm/");
    await page.locator("#debugConsole").waitFor({ state: "attached" });
    return page.evaluate(async () => {
        const source = name => performance.getEntriesByType("resource").find(entry => entry.name.split("?")[0].endsWith(`/${name}`)).name;
        const { DebugConsoleManager } = await import(source("debugConsoleManager.ts"));
        const { SincroAppController } = await import(source("sincroAppController.ts"));
        const manager = DebugConsoleManager.getManager(), app = SincroAppController.getCurrent();
        const subscribe = manager.subscribeSnapshot;
        const baseline = manager.eventHub.snapshotListeners.size;
        let registered = 0, removed = 0;
        manager.subscribeSnapshot = function (listener) { registered++; const off = subscribe.call(this, listener); return () => { removed++; off(); }; };
        const tick = () => new Promise(resolve => setTimeout(resolve, 300));
        try {
            manager.setLocalVadRmsThreshold(0.02); await tick();
            if (registered !== 0) throw Error("Initially hidden view subscribed");
            app.debug.showRightToolDebugPanel(); await tick();
            document.querySelector('#debug-console-tab-audio').click(); await tick();
            const input = document.getElementById("localVadRmsThreshold");
            const details = input.closest("details"); details.open = true;
            if (input.value !== "0.02" || registered !== 1) throw Error("Initial snapshot missing");
            app.debug.hideRightToolDebugPanel(); await tick();
            if (removed !== 1) throw Error("Hidden subscription retained");
            manager.setLocalVadRmsThreshold(0.04); manager.setLocalVadRmsThreshold(0.05); await tick();
            if (input.value !== "0.02" || registered !== 1) throw Error("Hidden update accumulated in React");
            app.debug.showRightToolDebugPanel(); await tick();
            if (registered !== 2 || input.value !== "0.05") throw Error("Latest snapshot missing");
            if (document.querySelector('#debug-console-tab-audio').getAttribute("aria-selected") !== "true" || !details.open) throw Error("Selection/input state lost");
            document.querySelector('#debug-console-tab-gaze').click(); await tick();
            document.querySelector('#debug-console-tab-audio').click(); await tick();
            if (!details.open || input !== document.getElementById("localVadRmsThreshold") || registered !== 2) throw Error("Tab state/subscription changed");
            app.debug.hideRightToolDebugPanel(); await tick();
            if (removed !== 2 || manager.eventHub.snapshotListeners.size !== baseline) throw Error("Display subscription leaked");
            return { registered, removed, backgroundSubscriptions: baseline, latestValue: input.value, detailsOpen: details.open };
        } finally { manager.subscribeSnapshot = subscribe; }
    });
}
