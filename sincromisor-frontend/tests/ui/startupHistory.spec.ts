import { expect, test } from "@playwright/test";

test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5173" });

test("機器取得失敗・体験再開始でも架空の会話を作らない", async ({ page }) => {
    await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException("Fixture denial", "NotAllowedError");
        };
    });
    await page.goto("/simple-vrm/");
    await page.getByRole("checkbox", { name: "カメラを使う", exact: true }).uncheck();
    await page.getByRole("button", { name: "開始する", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    for (let attempt = 0; attempt < 2; attempt++) {
        await expect(page.getByRole("alert", { name: "重要な通知" })).toContainText(
            "マイクの使用が許可されていません",
        );
        await page.locator("#debugMenuButton").click();
        await page.getByRole("menuitem", { name: "基本設定" }).click();
        await expect(page.getByRole("status", { name: "機器の使用状態" })).toContainText(
            "マイク 未使用",
        );
        const messages = await page.evaluate(async () => {
            const path = "/app/controller/index.ts";
            const { SincroAppController } = await import(path);
            return SincroAppController.getCurrent()
                .chat.getSnapshot()
                .messages.map((record: { message: { message: string } }) => record.message.message);
        });
        expect(messages).not.toContain("こんにちは!");
        expect(messages).not.toContain("こんにちは～!");
        expect(messages.join(" ")).not.toContain("四国めたん");
        await page.getByRole("button", { name: "基本設定を閉じる" }).click();
        if (attempt === 0) {
            await page.locator("#debugMenuButton").click();
            await page.getByRole("menuitem", { name: "体験を終了", exact: true }).click();
            await expect(page.getByRole("alert", { name: "重要な通知" })).not.toContainText(
                "マイクの使用が許可されていません",
            );
            await expect(page.getByRole("button", { name: "マイクを再試行" })).toBeHidden();
            await expect(page.locator("#debugMenuButton")).toBeFocused();
            await page.locator("#debugMenuButton").click();
            await page.getByRole("menuitem", { name: "体験を開始", exact: true }).click();
        }
    }
});
