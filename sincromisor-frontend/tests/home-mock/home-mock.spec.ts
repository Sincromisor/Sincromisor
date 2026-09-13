import { expect, test } from "@playwright/test";

test.use({ channel: "chrome" });

// 起動済みサーバーに対して、正式トップと独立モックの選択・案内を確認する。
for (const route of ["/", "/home-mock/"]) {
    test(`${route} 画面幅を変えても体験選択・開始案内・キーボード操作が一致する`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => {
            if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
        });
        await page.goto(`http://127.0.0.1:5173${route}`);
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
            if (route === "/home-mock/")
                await expect(page.locator("#mode-hint")).toHaveText("sincro");
            await expect(page.getByRole("link", { name: "会話ページの設定へ" })).toHaveAttribute(
                "href",
                route === "/" ? "/simple-vrm/?talkMode=sincro" : "/simple-vrm/",
            );
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).toBeHidden();
            await expect(start).toBeFocused();
            await page.locator('[data-choose="chat"]').click();
            await expect(talk).toBeChecked();
            await start.click();
            await expect(page.getByRole("link", { name: "会話ページの設定へ" })).toHaveAttribute(
                "href",
                route === "/" ? "/simple-vrm/?talkMode=chat" : "/simple-vrm/",
            );
            await page.getByRole("button", { name: "閉じる", exact: true }).click();
            await expect(page.getByRole("dialog")).toBeHidden();
            await page.locator('[data-choose="sincro"]').click();
            await expect(sincro).toBeChecked();
        }
        await page.getByText("このページで実際に会話できますか？", { exact: true }).click();
        await expect(
            page.getByText(
                route === "/"
                    ? "画像・会話はプレビューです。"
                    : "このページはデザインと操作を確認するUIモックです。",
                { exact: false },
            ),
        ).toBeVisible();
        await page.emulateMedia({ reducedMotion: "reduce" });
        expect(
            await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
        ).toBe("auto");
        expect(errors).toEqual([]);
    });
}

test("正式トップから選んだ体験を起動前設定へ引き継ぐ", async ({ page }) => {
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
        await page.getByRole("button", { name: "はじめる", exact: false }).first().click();
        await page.getByRole("link", { name: "会話ページの設定へ" }).click();
        await expect(page).toHaveURL(`http://127.0.0.1:5173/simple-vrm/?talkMode=${mode}`);
        const setting = page
            .getByRole("dialog")
            .getByRole("combobox")
            .filter({ has: page.locator('option[value="sincro"]') });
        await expect(setting).toHaveValue(mode);
        await setting.selectOption(mode === "chat" ? "sincro" : "chat");
        await expect(setting).toHaveValue(mode === "chat" ? "sincro" : "chat");
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
