import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

// 起動済みサーバーに対して、トップの配信素材と画面幅ごとの選択操作を確認する。
test("画像を読み込み、画面幅を変えても体験選択と会話例が一致する", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto("http://127.0.0.1:5173/");
    const portrait = page.locator(".character-image");
    await expect(portrait).toHaveAttribute("src", "/images/main/character.png");
    expect(await portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1024);
    await expect(page.locator(".avatar-crop")).toHaveCSS(
        "background-image",
        /\/images\/main\/character\.png/,
    );
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
        await expect(page.locator("dialog")).toHaveCount(0);
        await expect(page.getByText("01 / 02", { exact: true })).toHaveCount(0);
        await page.locator('[data-choose="chat"]').click();
        await expect(talk).toBeChecked();
        await page.locator('[data-choose="sincro"]').click();
        await expect(sincro).toBeChecked();
    }
    await page.getByText("このページで実際に会話できますか？", { exact: true }).click();
    await expect(
        page.getByText("「はじめる」から会話ページへ進み、", { exact: false }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    ).toBe("auto");
    expect(errors).toEqual([]);
});

test("正式トップの両開始ボタンから選んだ体験へ直接進む", async ({ page }) => {
    for (const selector of [".header-start", ".hero-actions button"]) {
        for (const mode of ["sincro", "chat"]) {
            await page.goto("http://127.0.0.1:5173/index.html");
            await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
            await expect(page.getByRole("link", { name: "360度カメラ（実験的）" })).toHaveAttribute(
                "href",
                "/vrm360/",
            );
            await expect(
                page.getByRole("link", { name: "Looking Glass（専用機器が必要）" }),
            ).toHaveAttribute("href", "/looking-glass-vrm/");
            await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
                "href",
                "https://github.com/Sincromisor/Sincromisor",
            );
            await page.locator(`input[value="${mode}"]`).check();
            await expect(page.locator("dialog")).toHaveCount(0);
            await page.locator(selector).focus();
            await page.keyboard.press("Enter");
            await expect(page).toHaveURL(`http://127.0.0.1:5173/simple-vrm/?talkMode=${mode}`);
            const setting = page
                .getByRole("dialog")
                .getByRole("combobox")
                .filter({ has: page.locator('option[value="sincro"]') });
            await expect(setting).toHaveValue(mode);
            await setting.selectOption(mode === "chat" ? "sincro" : "chat");
            await expect(setting).toHaveValue(mode === "chat" ? "sincro" : "chat");
        }
    }
    for (const query of ["", "?talkMode=invalid"]) {
        await page.goto(`http://127.0.0.1:5173/simple-vrm/${query}`);
        await expect(
            page
                .getByRole("dialog")
                .getByRole("combobox")
                .filter({ has: page.locator('option[value="sincro"]') }),
        ).toHaveValue("chat");
    }
});
