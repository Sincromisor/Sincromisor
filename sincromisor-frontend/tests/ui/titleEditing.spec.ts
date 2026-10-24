import { expect, test } from "@playwright/test";

test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5173" });

test("題名の空欄・変換中の文字・選択置換を起動前後と再読込で維持する", async ({ page }) => {
    await page.goto("/simple-vrm/");
    await page.getByRole("button", { name: "詳しい設定", exact: true }).click();
    await page.getByRole("tab", { name: "画面・保存" }).click();
    const title = page.getByRole("textbox", { name: "タイトル", exact: true });
    await title.fill("");
    await expect(title).toHaveValue("");
    await title.pressSequentially("new");
    await title.press("ControlOrMeta+A");
    await page.keyboard.insertText("新しい題名");
    await expect(title).toHaveValue("新しい題名");
    await title.fill("");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
        text: "にほんご",
        selectionStart: 4,
        selectionEnd: 4,
    });
    await expect(title).toHaveValue("にほんご");
    await cdp.send("Input.insertText", { text: "日本語" });
    await expect(title).toHaveValue("日本語");
    await title.fill("");
    await page.getByRole("tab", { name: "マイク・音声" }).click();
    await page.getByRole("tab", { name: "画面・保存" }).click();
    await expect(title).toHaveValue("");
    // 機器取得と無関係に、同じ設定を開始後のパネルで編集する。
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        SincroAppController.getCurrent().dialog.close();
    });
    await expect(page.locator("#sincroHeaderBox__text")).toHaveText("Sincromisor");
    await page.locator("#debugMenuButton").click();
    await page.getByRole("menuitem", { name: "基本設定" }).click();
    await page.getByRole("tab", { name: "画面・保存" }).click();
    await expect(title).toHaveValue("");
    await title.fill("置換前");
    await title.press("ControlOrMeta+A");
    await page.keyboard.insertText("置換後");
    await expect(title).toHaveValue("置換後");
    await title.fill("");
    await page.reload();
    await page.getByRole("button", { name: "詳しい設定", exact: true }).click();
    await page.getByRole("tab", { name: "画面・保存" }).click();
    await expect(title).toHaveValue("");
});
