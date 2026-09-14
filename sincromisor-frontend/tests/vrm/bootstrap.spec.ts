import { expect, type Page, test } from "@playwright/test";

// 起動済み開発サーバーを使い、機器・RTCだけを置換してReactとページ初期化は本番経路を通す。
test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5176" });

async function replaceDeviceStart(page: Page) {
    await page.route("**/app/controller/sincroController.ts*", async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        expect(source).toContain("start() {");
        await route.fulfill({
            response,
            body: source.replace(
                "start() {",
                `start() {
            document.body.dataset.startCount = String(Number(document.body.dataset.startCount ?? 0) + 1);
            document.body.dataset.startedSettings = JSON.stringify(this.dialogManager.getSettings());
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
    await expect(page.getByText("こんにちは～!", { exact: true })).toHaveCount(1);
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
    await page.route("**/pages/simpleVrm/react/simpleVrmControlPanel.tsx*", async (route) => {
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
    await expect(page.getByText("こんにちは～!", { exact: true })).toHaveCount(1);
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
        'export function SimpleVrmControlPanel() { throw new Error("panel render rejected"); }',
    ]) {
        errors.length = 0;
        await page.route("**/pages/simpleVrm/react/simpleVrmControlPanel.tsx*", (route) =>
            route.fulfill({ contentType: "text/javascript", body }),
        );
        await page.goto("/simple-vrm/");
        await expect
            .poll(() => errors.some((message) => message.includes("Failed to bootstrap VRM page.")))
            .toBe(true);
        expect(await currentSettings(page)).toBeUndefined();
        expect(await page.locator("body").getAttribute("data-start-count")).toBeNull();
        await expect(page.locator("#sincroCharacterBox")).toHaveCount(0);
        await page.unroute("**/pages/simpleVrm/react/simpleVrmControlPanel.tsx*");
    }
});
