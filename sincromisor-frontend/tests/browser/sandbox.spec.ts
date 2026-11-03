import { expect, test } from "@playwright/test";

test("Chromeをサンドボックス付きで起動する", async ({ page }) => {
    // 実際の起動引数を確認し、設定値だけが有効で実プロセスには届かない退行も検出する。
    await page.goto("chrome://version");
    const commandLine = await page.locator("#command_line").innerText();
    expect(commandLine).not.toContain("--no-sandbox");
    expect(commandLine).not.toContain("--disable-setuid-sandbox");
    if (process.platform === "linux") {
        await page.goto("chrome://sandbox");
        await expect(page.locator("body")).toContainText("You are adequately sandboxed.");
        await expect(
            page.getByRole("row", { name: "Seccomp-BPF sandbox Yes", exact: true }),
        ).toBeVisible();
    }
});
