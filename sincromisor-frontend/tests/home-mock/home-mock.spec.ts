import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

// 起動済みの開発サーバーに対して、モック内の選択と案内の整合を確認する。
test("画面幅を変えても体験選択・開始案内・キーボード操作が一致する", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto("http://127.0.0.1:5173/home-mock/");
    for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        const talk = page.getByRole("radio", { name: /^キャラクターと話す/ });
        const sincro = page.getByRole("radio", { name: /^キャラクターになる/ });
        await talk.check();
        await expect(page.locator(".chat-copy")).toBeVisible();
        await talk.focus();
        await page.keyboard.press("ArrowDown");
        await expect(sincro).toBeChecked();
        await expect(page.locator(".sincro-copy")).toBeVisible();
        await expect(page.locator(".chat-copy")).toBeHidden();
        const start = page.getByRole("button", { name: "この体験をはじめる" });
        await start.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.locator("#dialog-title")).toHaveText("キャラクターになる");
        await expect(page.locator("#mode-hint")).toHaveText("sincro");
        await expect(page.getByRole("link", { name: "会話ページの設定へ" })).toHaveAttribute(
            "href",
            "/simple-vrm/",
        );
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(start).toBeFocused();
        await page.locator('[data-choose="chat"]').click();
        await expect(talk).toBeChecked();
        await start.click();
        await expect(page.locator("#mode-hint")).toHaveText("chat");
        await page.getByRole("button", { name: "閉じる", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
        await page.locator('[data-choose="sincro"]').click();
        await expect(sincro).toBeChecked();
    }
    await page.getByText("このページで実際に会話できますか？", { exact: true }).click();
    await expect(
        page.getByText("このページはデザインと操作を確認するUIモックです。", { exact: false }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    ).toBe("auto");
    expect(errors).toEqual([]);
});
