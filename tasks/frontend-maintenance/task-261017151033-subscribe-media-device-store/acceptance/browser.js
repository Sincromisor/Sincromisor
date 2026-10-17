async (page) => {
    await page.goto("http://127.0.0.1:5173/simple-vrm/");
    await page.locator("#debugConsole").waitFor({ state: "attached" });
    const result = await page.evaluate(async () => {
        const source = name => performance.getEntriesByType("resource").find(entry => entry.name.split("?")[0].endsWith(`/${name}`)).name;
        const { default: { createElement } } = await import(source("react.js"));
        const { default: { createRoot } } = await import(source("react-dom_client.js"));
        const { useSincroMediaDeviceState } = await import(source("useSincroMediaDeviceState.ts"));
        const { SincroMediaDeviceService } = await import(source("sincroMediaDeviceService.ts"));
        const service = SincroMediaDeviceService.getInstance();
        const subscribe = service.subscribe, stop = service.stop, enumerate = navigator.mediaDevices.enumerateDevices;
        let registered = 0, removed = 0, stopped = 0, enumerated = 0, fail = false;
        const device = { kind: "audioinput", deviceId: "test-mic", groupId: "test", label: "確認用マイク" };
        navigator.mediaDevices.enumerateDevices = async () => { enumerated++; if (fail) throw Error("確認用の取得失敗"); return [device]; };
        service.subscribe = function (listener) { registered++; const off = subscribe.call(this, listener); return () => { removed++; off(); }; };
        service.stop = () => { stopped++; };
        const host = document.createElement("div"); document.body.append(host);
        const root = createRoot(host);
        function Probe({ id }) {
            const state = useSincroMediaDeviceState({ audioInputDeviceId: "test-mic" });
            return createElement("output", { id }, JSON.stringify({ label: state.snapshot.audioInputs[0]?.label, error: state.snapshot.refreshError, available: state.audioInputSelection.isAvailable }));
        }
        const render = second => root.render(createElement("div", null, createElement(Probe, { id: "probe-a", key: "a" }), second && createElement(Probe, { id: "probe-b", key: "b" })));
        const tick = () => new Promise(resolve => setTimeout(resolve, 300));
        try {
            render(true); await tick();
            if (registered !== 2 || !host.textContent.includes("確認用マイク")) throw Error("Initial snapshot missing");
            const initialCalls = enumerated;
            render(true); await tick();
            if (registered !== 2 || enumerated !== initialCalls) throw Error("Render resubscribed/refreshed");
            render(false); await tick();
            if (removed !== 1 || stopped !== 0) throw Error("Shared watcher stopped");
            fail = true; await service.refresh(); await tick();
            if (!host.textContent.includes("確認用の取得失敗") || !host.textContent.includes("確認用マイク")) throw Error("Failure state missing");
            fail = false; device.label = "再取得したマイク"; await service.refresh(); await tick();
            if (!host.textContent.includes("再取得したマイク")) throw Error("Remaining subscriber stale");
            root.unmount();
            if (removed !== 2 || stopped !== 0) throw Error("Subscription leak");
            return { registered, removed, stopped, enumerated };
        } finally { service.subscribe = subscribe; service.stop = stop; navigator.mediaDevices.enumerateDevices = enumerate; host.remove(); }
    });
    await page.getByRole("combobox", { name: "マイク入力", exact: true }).getByRole("option", { name: "再取得したマイク" }).waitFor({ state: "attached" });
    await page.getByRole("button", { name: "機器一覧を更新", exact: true }).first().click();
    await page.evaluate(async () => {
        const source = performance.getEntriesByType("resource").find(entry => /\/sincroAppController\.ts(?:\?|$)/.test(entry.name)).name;
        const { SincroAppController } = await import(source);
        const app = SincroAppController.getCurrent();
        app.applySettings({ enableTalk: false, enableCharacterGaze: false, enableInspector: false });
        app.start();
        app.debug.showRightToolSettingsPanel();
    });
    await page.locator("#sincroReactSettingsPanelContainer").getByRole("tab", { name: "マイク・音声", exact: true }).click();
    await page.locator("#sincroReactSettingsPanelContainer").getByRole("button", { name: "機器一覧を更新", exact: true }).first().click();
    return result;
}
