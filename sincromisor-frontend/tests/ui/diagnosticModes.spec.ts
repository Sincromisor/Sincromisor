import { expect, test } from "@playwright/test";

test.use({
    channel: "chrome",
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 320, height: 900 },
});

test("診断の補助導線をキーボードで開き、起動前後と保存復元で選択を保つ", async ({ page }) => {
    await page.goto("/simple-vrm/");
    const startup = page.getByRole("dialog");
    const summary = startup.locator(".talkModeField__diagnostics summary");
    await expect(startup.getByRole("radio", { name: "入力音声を折り返す" })).toBeHidden();
    await summary.focus();
    await page.keyboard.press("Enter");
    const echo = startup.getByRole("radio", { name: "入力音声を折り返す" });
    await expect(echo).toBeVisible();
    // 同じラジオ群の選択は標準の矢印キーで移動する。
    await startup.getByRole("radio", { name: "キャラクターと話す" }).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(echo).toBeChecked();
    await expect(startup.getByRole("radio", { name: "キャラクターと話す" })).not.toBeChecked();
    await summary.click();
    await expect(summary).toContainText("入力音声を折り返す");
    await page.getByRole("button", { name: "詳しい設定", exact: true }).click();
    await expect(startup.getByRole("radio", { name: "入力音声を折り返す" })).toBeChecked();
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        SincroAppController.getCurrent().dialog.close();
    });
    await page.locator("#debugMenuButton").click();
    await page.getByRole("menuitem", { name: "基本設定" }).click();
    await expect(page.getByRole("radio", { name: "入力音声を折り返す" })).toBeChecked();
    await page.getByRole("radio", { name: "サンプル音声を繰り返す" }).check();
    await expect(page.getByText(/既定音声: VOICEVOX:ずんだもん/)).toBeVisible();
    await page.goto("/simple-vrm/");
    await expect(startup.getByRole("radio", { name: "サンプル音声を繰り返す" })).toBeChecked();
    await expect(startup.getByRole("radio", { name: "サンプル音声を繰り返す" })).toBeVisible();
});
