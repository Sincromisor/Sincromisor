async (page) => {
    await page.goto("http://127.0.0.1:5173/simple-vrm/");
    await page.locator("#debugConsole").waitFor({ state: "attached" });
    return page.evaluate(async () => {
        const { VRMScene } = await import(performance.getEntriesByType("resource").find(entry => /\/vrmScene\.ts(?:\?|$)/.test(entry.name)).name);
        document.querySelector("dialog")?.close();
        const host = document.createElement("div");
        host.style = "position:fixed;inset:0;z-index:1000;background:white";
        document.body.append(host);
        const scene = new VRMScene({ canvasRoot: host, characterControlLayer: host, vrmUrl: "/characters/default.vrm" });
        let frames = 0;
        scene.updateScene = () => { frames++; };
        scene.start();
        if (frames !== 1) throw Error("Immediate frame missing");
        const tick = () => new Promise(resolve => setTimeout(resolve, 500));
        await tick();
        if (frames < 2) throw Error("Normal loop stopped");
        // 実機の代替ではなく、実レンダラーのXRイベントによる通常予約停止・復帰だけを確認する。
        scene.renderer.xr.isPresenting = true;
        scene.renderer.xr.dispatchEvent({ type: "sessionstart" });
        const paused = frames;
        await tick();
        if (frames !== paused) throw Error("Normal loop continued in XR");
        scene.renderer.xr.isPresenting = false;
        scene.renderer.xr.dispatchEvent({ type: "sessionend" });
        await tick();
        if (frames <= paused) throw Error("Normal loop did not recover");
        scene.renderer.setAnimationLoop(null);
        return { framesBeforeXR: paused, framesAfterXR: frames, realXRSession: false };
    });
}
