import { expect, type Page, test } from "@playwright/test";
import { selectSettingsCategory } from "./settingsLayoutAssertions";

test.use({ baseURL: "http://127.0.0.1:5173", hasTouch: true });

test.beforeEach(async ({ page }) => {
    // 操作部品の確認では機器を取得せず、一覧は空からの回復を再現する。
    await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException("UI fixture", "NotAllowedError");
        };
        navigator.mediaDevices.enumerateDevices = async () => [];
    });
    await page.route("**/api/v1/RTCSignalingServer/config.json", (route) =>
        route.fulfill({
            json: { iceServers: [], offerURL: "/fixture/rtc", candidateURL: "/fixture/candidate" },
        }),
    );
});

async function openBasicSettings(page: Page) {
    await expect(page.getByRole("button", { name: "開始する", exact: true })).toBeVisible();
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        SincroAppController.getCurrent().dialog.close();
    });
    await page.locator("#debugMenuButton").click();
    await page.getByRole("menuitem", { name: "基本設定", exact: true }).click();
}

test("数値を打ち替え・取消し・確定でき、プリセットも反映する", async ({ page }) => {
    await page.goto("/looking-glass-vrm/");
    await openBasicSettings(page);
    await page.getByRole("combobox", { name: "基本設定 カテゴリ" }).selectOption("looking-glass");
    const height = page.getByRole("spinbutton", { name: "タイルの高さ", exact: true });
    await height.fill("");
    await expect(height).toHaveValue("");
    await height.pressSequentially("512");
    await expect(height).toHaveValue("512");
    await height.press("Enter");
    await expect(height).toHaveValue("512");
    await height.fill("999");
    await height.press("Escape");
    await expect(height).toHaveValue("512");
    await expect(page.getByRole("dialog", { name: "基本設定", exact: true })).toBeVisible();
    await height.fill("");
    await height.press("Tab");
    await expect(height).toHaveValue("512");
    await height.fill("9000");
    await height.press("Enter");
    await expect(height).toHaveValue("2048");
    const target = page.getByRole("spinbutton", { name: "注視する高さ", exact: true });
    await target.fill("");
    await target.pressSequentially("-0.5");
    await target.press("Enter");
    await expect(target).toHaveValue("-0.5");
    await page.getByRole("button", { name: "縦長", exact: true }).click();
    await expect(height).toHaveValue("640");
    await expect(target).toHaveValue("1.35");
});

test("説明は最初のクリック・タッチで開き、ホバーとEscapeでも操作できる", async ({ page }) => {
    await page.goto("/simple-vrm/");
    const help = page.getByRole("button", { name: "マイク入力の説明を表示" });
    const tooltip = page.getByRole("tooltip");
    await help.click();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await help.tap();
    await expect(tooltip).toBeVisible();
    await page.getByRole("heading", { name: "開始前の確認" }).click();
    await expect(tooltip).toHaveCount(0);
    await help.hover();
    await expect(tooltip).toBeVisible();
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await help.focus();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
});

test("分類の表示切り替えでフォーカスを引き継ぎ、本文入力からは奪わない", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/simple-vrm/");
    await page.getByRole("button", { name: "詳しい設定", exact: true }).click();
    const tab = page.getByRole("tab", { name: "画面・保存", exact: true });
    await tab.click();
    await page.setViewportSize({ width: 320, height: 900 });
    const category = page.getByRole("combobox", { name: "詳しい設定 カテゴリ" });
    await expect(category).toBeFocused();
    await expect(category).toHaveValue("screen");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(tab).toBeFocused();
    const title = page.getByRole("textbox", { name: "タイトル", exact: true });
    await title.fill("入力を保持");
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(title).toBeFocused();
    await expect(title).toHaveValue("入力を保持");
});

test("不在の選択機器を表示し、既定選択と一覧更新から回復する", async ({ page }) => {
    await page.goto("/simple-vrm/");
    await expect(page.getByRole("button", { name: "開始する", exact: true })).toBeVisible();
    await page.evaluate(async () => {
        const path = "/app/settings/sincroAppSettingsModel.ts";
        const { SincroAppSettingsModel } = await import(path);
        SincroAppSettingsModel.getShared().updateSettings({
            audioInputDeviceId: "missing-audio",
            videoInputDeviceId: "missing-video",
        });
    });
    for (const [name, id] of [
        ["マイク入力", "missing-audio"],
        ["追跡用カメラ", "missing-video"],
    ]) {
        const field = page.getByRole("combobox", { name, exact: true });
        await expect(field).toHaveValue(id);
        await expect(field.locator("option:checked")).toContainText("一覧にありません");
        await expect(field).toHaveAccessibleDescription(/選択中の/);
        await field.selectOption("");
        await expect(field).toHaveValue("");
    }
    await expect(page.getByRole("button", { name: "開始する", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "マイクの機器一覧を更新" }).click();
    await expect(
        page.getByRole("status").filter({ hasText: "デバイス一覧を更新しました。" }),
    ).toBeVisible();
    // 実機の再接続に相当する列挙結果を返して、更新操作から選択肢へ反映する。
    await page.evaluate(() => {
        navigator.mediaDevices.enumerateDevices = async () => [
            {
                deviceId: "fixture-mic",
                kind: "audioinput",
                label: "確認用マイク",
                groupId: "fixture",
                toJSON: () => ({}),
            },
        ];
    });
    await page.getByRole("button", { name: "マイクの機器一覧を更新" }).click();
    await page
        .getByRole("combobox", { name: "マイク入力", exact: true })
        .selectOption("fixture-mic");
    await expect(page.getByRole("combobox", { name: "マイク入力", exact: true })).toHaveValue(
        "fixture-mic",
    );
});

test("空の履歴とスライダーの表示単位を伝え、ファイル選択の入口を重複させない", async ({ page }) => {
    await page.goto("/simple-vrm/");
    await expect(page.getByRole("button", { name: "VRMファイルを選択" })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeHidden();
    await openBasicSettings(page);
    await selectSettingsCategory(page.locator(".sincroControlPanel"), "camera");
    await expect(page.getByRole("slider", { name: "姿勢の反映量", exact: true })).toHaveAttribute(
        "aria-valuetext",
        /%$/,
    );
    await page.getByRole("button", { name: "基本設定を閉じる" }).click();
    await page.locator("#debugMenuButton").click();
    await page.getByRole("menuitem", { name: "会話履歴", exact: true }).click();
    await expect(page.getByText("会話履歴はまだありません。", { exact: true })).toBeVisible();
});
