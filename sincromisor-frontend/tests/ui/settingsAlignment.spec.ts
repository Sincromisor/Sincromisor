import { expect, type Page, test } from "@playwright/test";
import {
    expectSettingsAlignment,
    expectStartupActions,
    selectSettingsCategory,
} from "./settingsLayoutAssertions";

test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5173" });

test.beforeEach(async ({ page }) => {
    // 配置確認は実機と接続先を起動せず、機器不在を一定条件で再現する。
    await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException("Layout fixture denial", "NotAllowedError");
        };
        navigator.mediaDevices.enumerateDevices = async () => [];
    });
    await page.route("**/api/v1/RTCSignalingServer/config.json", (route) =>
        route.fulfill({
            json: { iceServers: [], offerURL: "/fixture/rtc", candidateURL: "/fixture/candidate" },
        }),
    );
});

const categories = ["experience", "character", "audio", "camera", "screen"];

for (const route of ["simple-vrm", "vrm360", "looking-glass-vrm"]) {
    for (const width of [1300, 390]) {
        test(`${route} ${width}px: 概要・全カテゴリ・基本設定の整列を保つ`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`/${route}/`);
            const startup = page.locator("#configurationDialog .settingsShell");
            await expect(startup.getByRole("heading", { name: "開始前の確認" })).toBeVisible();
            await expectSettingsAlignment(startup);
            await expectStartupActions(startup);
            const overviewFooter = await startup.locator(".settingsShell__footer").boundingBox();
            await startup.getByRole("button", { name: "詳しい設定", exact: true }).click();
            const first = await expectSettingsAlignment(startup);
            expect(first.footer.top).toBe(overviewFooter?.y);
            for (const id of categories) {
                await selectSettingsCategory(startup, id);
                const current = await expectSettingsAlignment(startup);
                expect(current.footer.top).toBe(first.footer.top);
                expect(current.header.top).toBe(first.header.top);
                expect(current.body.top).toBe(first.body.top);
                await expectStartupActions(startup);
            }
            const reset = startup.getByRole("button", { name: "全て初期設定に戻す" });
            await reset.scrollIntoViewIfNeeded();
            await expect(reset).toBeInViewport();
            await openBasicSettings(page);
            const basic = page.locator(".sincroControlPanel .settingsShell");
            const initial = await expectSettingsAlignment(basic);
            const ids =
                route === "looking-glass-vrm" ? [...categories, "looking-glass"] : categories;
            for (const id of ids) {
                await selectSettingsCategory(basic, id);
                const current = await expectSettingsAlignment(basic);
                expect(current.footer.top, `基本設定 ${id} の固定操作`).toBe(initial.footer.top);
                expect(current.header.top).toBe(initial.header.top);
                expect(current.body.top).toBe(initial.body.top);
            }
        });
    }
}

for (const width of [1300, 555, 554, 553, 320]) {
    test(`${width}px: 長い開始不可案内と復帰でも操作を揃える`, async ({ page }) => {
        await page.setViewportSize({ width, height: 740 });
        await page.goto("/simple-vrm/");
        const shell = page.locator("#configurationDialog .settingsShell");
        await expect(shell.getByRole("button", { name: "開始する", exact: true })).toBeEnabled();
        await expectStartupActions(shell);
        await setMissingDevices(page, true);
        await expect(
            shell.getByRole("button", { name: "開始できません", exact: true }),
        ).toBeDisabled();
        await expect(
            shell.locator(".configurationDialogReactSettingsPanel__hintText"),
        ).toContainText("追跡用カメラ");
        await expectSettingsAlignment(shell);
        await expectStartupActions(shell);
        await shell.getByRole("button", { name: "詳しい設定", exact: true }).click();
        await expectStartupActions(shell);
        await expectSettingsAlignment(shell);
        await setMissingDevices(page, false);
        await expect(shell.getByRole("button", { name: "開始する", exact: true })).toBeEnabled();
        await expect(shell.locator(".configurationDialogReactSettingsPanel__hintText")).toHaveCount(
            0,
        );
        await expectStartupActions(shell);
        await expectSettingsAlignment(shell);
        await shell.getByRole("link", { name: "トップへ戻る" }).click();
        await expect(page).toHaveURL("/");
    });
}

test("基本設定の接続状態が長くなっても本文と操作欄の整列を保つ", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto("/simple-vrm/");
    await expect(page.getByRole("button", { name: "詳しい設定", exact: true })).toBeVisible();
    await openBasicSettings(page);
    // 実通信は行わず、パネルが購読する通知経路へ表示状態だけを与える。
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        const app = SincroAppController.getCurrent();
        app.emitEvent({ type: "lifecycle", state: "running" });
        app.emitEvent({ type: "connection_state", value: "connected", detail: "ice:connected" });
    });
    const basic = page.locator(".sincroControlPanel .settingsShell");
    await expect(basic.getByText("接続済み", { exact: true })).toBeVisible();
    await expectSettingsAlignment(basic);
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        SincroAppController.getCurrent().emitEvent({
            type: "connection_state",
            value: "input_failed",
            detail: "マイクの利用が許可されていません。ブラウザーの権限設定を確認してから再試行してください。",
        });
    });
    await expect(basic.getByRole("button", { name: "マイクを再試行" })).toBeVisible();
    await expectSettingsAlignment(basic);
    await selectSettingsCategory(basic, "camera");
    const scroll = basic.locator(".settingsShell__detailScroll");
    expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
    });
    expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expectSettingsAlignment(basic);
    await expect(basic.getByRole("button", { name: "マイクを再試行" })).toBeInViewport();
});

async function openBasicSettings(page: Page) {
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        SincroAppController.getCurrent().dialog.close();
    });
    await page.locator("#debugMenuButton").click();
    await page.getByRole("menuitem", { name: "基本設定", exact: true }).click();
}

async function setMissingDevices(page: Page, missing: boolean) {
    await page.evaluate(async (missing) => {
        const path = "/app/settings/sincroAppSettingsModel.ts";
        const { SincroAppSettingsModel } = await import(path);
        SincroAppSettingsModel.getShared().updateSettings({
            audioInputDeviceId: missing ? "missing-microphone" : undefined,
            videoInputDeviceId: missing ? "missing-camera" : undefined,
            enableCharacterGaze: true,
        });
    }, missing);
}
