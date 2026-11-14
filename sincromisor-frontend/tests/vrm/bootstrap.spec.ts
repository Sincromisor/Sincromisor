import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// 起動済み開発サーバーを使い、機器・RTCだけを置換してReactとページ初期化は本番経路を通す。
test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5173" });

async function replaceDeviceStart(page: Page) {
    await page.route("**/app/controller/sincroController.ts*", async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        expect(source).toContain("start(onTrackingStopped) {");
        await route.fulfill({
            response,
            body: source.replace(
                "start(onTrackingStopped) {",
                `start(onTrackingStopped) {
            document.body.dataset.startCount = String(Number(document.body.dataset.startCount ?? 0) + 1);
            document.body.dataset.startedSettings = JSON.stringify(this.settingsModel.getSettings());
            return;`,
            ),
        });
    });
}

async function currentSettings(page: Page) {
    return page.evaluate(async () => {
        const path = "/app/controller";
        const { SincroAppController } = await import(path);
        return SincroAppController.getCurrent()?.getSettingsSnapshot();
    });
}

async function startAgain(page: Page) {
    await page.evaluate(async () => {
        const path = "/app/controller";
        const { SincroAppController } = await import(path);
        SincroAppController.getCurrent().start();
    });
}

test("3ページの配置と既定設定を維持し、通常ページを手動で一度開始する", async ({ page }) => {
    await replaceDeviceStart(page);
    for (const [url, gaze] of [
        ["/vrm360/", false],
        ["/looking-glass-vrm/", true],
        ["/simple-vrm/?talkMode=sincro", true],
    ] as const) {
        await page.goto(url);
        await expect.poll(() => currentSettings(page)).toMatchObject({ enableCharacterGaze: gaze });
        await expect(page.locator("#sincroCharacterBox")).toHaveCount(1);
        await expect(page.locator("#sincroCharacterControlLayer")).toHaveCount(1);
        await expect(page.locator("#sincroCharacterBox canvas")).toHaveCount(1);
        expect(await page.locator("body").getAttribute("data-start-count")).toBeNull();
    }
    expect(await currentSettings(page)).toMatchObject({ talkMode: "sincro" });
    await startAgain(page);
    await startAgain(page);
    await expect(page.locator("body")).toHaveAttribute("data-start-count", "1");
    await expect(page.locator("#sincroCharacterBox canvas")).toHaveCount(2);
    await expect(page.getByText("こんにちは～!", { exact: true })).toHaveCount(0);
});

test("パネル遅延中は開始せず、実Reactの配置通知を再実行してもOBS開始は一度だけ", async ({
    page,
}) => {
    await replaceDeviceStart(page);
    await page.addInitScript(() => {
        Object.assign(window, { obsstudio: {} });
    });
    await page.route("**/app/shell/sincroPageAppShell.tsx*", async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        expect(source).toContain("onMounted({");
        await route.fulfill({
            response,
            body: source.replace(
                "onMounted({",
                "for (let repeat = 0; repeat < 2; repeat++) onMounted({",
            ),
        });
    });
    let releasePanel = () => {};
    const panelReady = new Promise<void>((resolve) => {
        releasePanel = resolve;
    });
    let panelRequested = false;
    await page.route("**/app/settings/react/sincroControlPanel.tsx*", async (route) => {
        panelRequested = true;
        await panelReady;
        await route.continue();
    });
    await page.goto("/simple-vrm/?talkMode=sincro", { waitUntil: "domcontentloaded" });
    await expect.poll(() => panelRequested).toBe(true);
    await expect(page.locator("#sincroCharacterBox")).toHaveCount(0);
    expect(await currentSettings(page)).toBeUndefined();
    releasePanel();
    await expect(page.locator("body")).toHaveAttribute("data-start-count", "1");
    const settings = await page.locator("body").getAttribute("data-started-settings");
    expect(JSON.parse(settings ?? "{}")).toMatchObject({ talkMode: "sincro" });
    await startAgain(page);
    await expect(page.locator("body")).toHaveAttribute("data-start-count", "1");
    await expect(page.locator("#sincroCharacterBox canvas")).toHaveCount(2);
    await expect(page.getByText("こんにちは～!", { exact: true })).toHaveCount(0);
});

test("パネル読込と描画の失敗は観測可能なエラーを残して開始しない", async ({ page }) => {
    await replaceDeviceStart(page);
    await page.addInitScript(() => {
        Object.assign(window, { obsstudio: {} });
    });
    const errors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    for (const body of [
        'throw new Error("panel import rejected");',
        'export function SincroControlPanel() { throw new Error("panel render rejected"); }',
    ]) {
        errors.length = 0;
        await page.route("**/app/settings/react/sincroControlPanel.tsx*", (route) =>
            route.fulfill({ contentType: "text/javascript", body }),
        );
        await page.goto("/simple-vrm/");
        await expect
            .poll(() => errors.some((message) => message.includes("Failed to bootstrap VRM page.")))
            .toBe(true);
        expect(await currentSettings(page)).toBeUndefined();
        expect(await page.locator("body").getAttribute("data-start-count")).toBeNull();
        await expect(page.locator("#sincroCharacterBox")).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "起動に失敗しました" })).toBeVisible();
        await expect(page.locator("main")).not.toContainText("rejected");
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "再読み込み" })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "トップへ戻る" })).toBeFocused();
        await page.unroute("**/app/settings/react/sincroControlPanel.tsx*");
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Enter");
        await expect(page.locator("body")).toHaveAttribute("data-start-count", "1");
        await expect(page.getByRole("heading", { name: "起動に失敗しました" })).toHaveCount(0);
    }
});

test("Cache Storageの復元待ちを表示し、保存モデルを最初の要求へ渡す", async ({ page }) => {
    await replaceDeviceStart(page);
    // 配布済み固定素材をキャッシュへ用意し、以後のモデル要求だけを観測する。
    await page.goto("/");
    await page.evaluate(async () => {
        const cache = await caches.open("file-cache");
        await cache.put("/simple-vrm/sincroVrmFile", await fetch("/characters/default.vrm"));
    });
    await page.addInitScript(() => {
        Object.assign(window, { obsstudio: {} });
        const ready = new Promise<void>((resolve) => {
            window.addEventListener("vrm-test-ready", () => resolve(), { once: true });
        });
        const match = Cache.prototype.match;
        Cache.prototype.match = async function (request, options) {
            if (String(request).endsWith("sincroVrmFile")) await ready;
            return match.call(this, request, options);
        };
    });
    await page.addInitScript(() => {
        // Blob URLはPlaywrightの通信イベントに現れないため、GLTFLoaderのfetch境界で観測する。
        const fetchModel = window.fetch;
        const requested: string[] = [];
        window.fetch = (input, init) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.startsWith("blob:") || url.includes("default.vrm")) {
                requested.push(url);
                document.documentElement.dataset.modelRequests = JSON.stringify(requested);
            }
            return fetchModel(input, init);
        };
    });
    await page.goto("/simple-vrm/?talkMode=sincro");
    await expect(page.getByRole("button", { name: "開始準備中…", exact: true })).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "VRMファイルを選択", exact: true }),
    ).toBeDisabled();
    await startAgain(page);
    expect(await page.locator("html").getAttribute("data-model-requests")).toBeNull();
    expect(await page.locator("body").getAttribute("data-start-count")).toBeNull();
    await page.evaluate(() => window.dispatchEvent(new Event("vrm-test-ready")));
    await expect(page.locator("body")).toHaveAttribute("data-start-count", "1");
    await expect(page.locator("html")).toHaveAttribute("data-model-requests", /blob:/);
    const modelRequests: string[] = JSON.parse(
        (await page.locator("html").getAttribute("data-model-requests")) ?? "[]",
    );
    expect(modelRequests[0]).toMatch(/^blob:/);
    expect(modelRequests.some((url) => url.includes("default.vrm"))).toBe(false);
});

test("OBSの復元失敗は開始後も通常画面で通知する", async ({ page }) => {
    await replaceDeviceStart(page);
    await page.addInitScript(() => {
        Object.assign(window, { obsstudio: {} });
        const match = Cache.prototype.match;
        Cache.prototype.match = async function (request, options) {
            if (String(request).endsWith("sincroVrmFile"))
                throw new Error("cache restoration failed");
            return match.call(this, request, options);
        };
    });
    await page.goto("/simple-vrm/");
    await expect(page.locator("body")).toHaveAttribute("data-start-count", "1");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator("#sincroPopBox")).toContainText(
        "VRMの復元に失敗しました。既定のモデルで開始できます",
    );
    await expect(page.locator("#sincroPopBox .popError")).toBeVisible();
});

test("初期化失敗は部分アプリを解除・終了し、再開始と重複起動を拒否する", async ({ page }) => {
    await replaceDeviceStart(page);
    await page.addInitScript(() => {
        Object.assign(window, { obsstudio: {} });
    });
    await page.route("**/pages/simpleVrm/mainVrm.ts*", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body: `
            import { SincroVRMInitializer } from "/app/bootstrap/sincroVrmInitializer.ts";
            import { SincroAppController } from "/app/controller/sincroAppController.ts";
            export function initializeSimpleVrmPage(roots) {
                const initializer = new SincroVRMInitializer(roots);
                initializer.initialize();
                const app = SincroAppController.getCurrent();
                for (const [method, key] of [["releaseEventSubscriptions", "releaseCount"], ["endExperience", "endCount"]]) {
                    const original = app[method].bind(app);
                    app[method] = () => {
                        document.body.dataset[key] = String(Number(document.body.dataset[key] ?? 0) + 1);
                        return original();
                    };
                }
                initializer.startAutomatically();
                throw new Error("private initialization detail");
            }
        `,
        }),
    );
    await page.goto("/simple-vrm/");
    await expect(page.getByRole("heading", { name: "起動に失敗しました" })).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute("data-release-count", "1");
    await expect(page.locator("body")).toHaveAttribute("data-end-count", "1");
    await expect(page.locator("main")).not.toContainText("private initialization detail");
    await startAgain(page);
    await page.evaluate(async () => {
        const path = "/app/shell/bootstrapSincroPageAppShell.tsx";
        const { bootstrapSincroPageAppShell } = await import(path);
        bootstrapSincroPageAppShell(
            () => {
                document.body.dataset.duplicateStart = "true";
                return Promise.resolve({});
            },
            () => null,
            () => {},
        );
    });
    expect(await page.locator("body").getAttribute("data-start-count")).toBeNull();
    expect(await page.locator("body").getAttribute("data-duplicate-start")).toBeNull();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("http://127.0.0.1:5173/");
});

test("キャラクター選び直しは既存レンダラーでモデルを交換し、同じモデルの再開始でも閉じる", async ({
    page,
}) => {
    // 固定素材の転送と2回のVRM読込・描画準備を実行する。
    test.slow();
    await replaceDeviceStart(page);
    await page.goto("/simple-vrm/");
    await page.getByRole("button", { name: "開始する", exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-start-count", "1");
    await expect(page.locator("#configurationDialog")).not.toBeVisible();
    const renderer = page.locator("#sincroCharacterBox canvas").last();
    await renderer.evaluate((canvas) => {
        canvas.setAttribute("data-original-renderer", "true");
    });
    await page.locator("#debugMenuButton").click();
    await page.getByRole("menuitem", { name: "基本設定", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "基本設定", exact: true });
    const characterCategory = settings.getByRole("tab", { name: "キャラクター", exact: true });
    if (await characterCategory.isVisible()) await characterCategory.click();
    else
        await settings
            .getByRole("combobox", { name: "基本設定 カテゴリ" })
            .selectOption("character");
    await settings.getByRole("button", { name: "キャラクターを選び直す", exact: true }).click();
    await expect(page.locator("#configurationDialog")).toBeVisible();
    await page.locator("#configurationDialog input[type=file]").setInputFiles({
        name: "replacement.vrm",
        mimeType: "application/octet-stream",
        buffer: readFileSync("sincromisor-frontend/public/characters/default.vrm"),
    });
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        await SincroAppController.getCurrent().dialog.waitForVrmSelection();
    });
    await expect(page.getByRole("button", { name: "開始する", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "開始する", exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-start-count", "2");
    await expect(page.locator("#configurationDialog")).not.toBeVisible();
    await expect(
        page.locator("#sincroCharacterBox canvas[data-original-renderer=true]"),
    ).toHaveCount(1);
    await expect(settings).toContainText("選択したモデルを表示中");
    await settings.getByRole("button", { name: "キャラクターを選び直す", exact: true }).click();
    await page.getByRole("button", { name: "開始する", exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-start-count", "3");
    await expect(page.locator("#configurationDialog")).not.toBeVisible();
    await expect(
        page.locator("#sincroCharacterBox canvas[data-original-renderer=true]"),
    ).toHaveCount(1);
});
