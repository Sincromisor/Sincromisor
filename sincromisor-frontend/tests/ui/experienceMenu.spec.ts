import { expect, test } from "@playwright/test";

declare global {
    interface Window {
        experienceFixture: {
            audioRequests: number;
            videoRequests: number;
            tracks: MediaStreamTrack[];
            failAudio: boolean;
            failSave: boolean;
            holdAudio: boolean;
            releaseAudio: () => void;
        };
    }
}

test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5173", hasTouch: true });

test("模擬トラックで失敗回復とメニュー終了・再開始を確認する", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 320, height: 900 });
    // 実機を使わず、ブラウザー自身のトラックで使用状態とstop後のreadyStateを照合する。
    await page.addInitScript(() => {
        const fixture: Window["experienceFixture"] = {
            audioRequests: 0,
            videoRequests: 0,
            tracks: [],
            failAudio: true,
            failSave: false,
            holdAudio: false,
            releaseAudio: () => {},
        };
        window.experienceFixture = fixture;
        const save = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (fixture.failSave) throw new DOMException("Fixture full", "QuotaExceededError");
            save.call(this, key, value);
        };
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            if (constraints?.audio) {
                fixture.audioRequests++;
                if (fixture.failAudio) throw new DOMException("Fixture denial", "NotAllowedError");
                if (fixture.holdAudio)
                    await new Promise<void>((resolve) => {
                        fixture.releaseAudio = resolve;
                    });
                const context = new AudioContext();
                const destination = context.createMediaStreamDestination();
                const oscillator = context.createOscillator();
                oscillator.connect(destination);
                oscillator.start();
                fixture.tracks.push(...destination.stream.getTracks());
                return destination.stream;
            }
            fixture.videoRequests++;
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 240;
            canvas.getContext("2d")?.fillRect(0, 0, 320, 240);
            const stream = canvas.captureStream(1);
            fixture.tracks.push(...stream.getTracks());
            return stream;
        };
    });
    // 失敗回復の対象は機器取得だけに絞り、RTCの外部接続は成立させない。
    await page.route("**/api/v1/RTCSignalingServer/config.json", (route) =>
        route.fulfill({
            json: { iceServers: [], offerURL: "/fixture/rtc", candidateURL: "/fixture/candidate" },
        }),
    );
    await page.route("**/fixture/**", (route) => route.fulfill({ status: 503, body: "fixture" }));
    await page.goto("/simple-vrm/");
    await page.getByRole("button", { name: "開始する", exact: true }).click();
    const notice = page.getByRole("alert", { name: "重要な通知" });
    const gear = page.locator("#debugMenuButton");
    const usage = page.getByRole("status", { name: "機器の使用状態" });
    await expect(notice).toContainText("マイクの使用が許可されていません");
    await expect(notice).toHaveCount(1);
    await expect(page.locator(".sincroExperienceControls")).toHaveCount(0);
    await expect(usage).toBeHidden();
    await gear.tap();
    await page.getByRole("menuitem", { name: "基本設定" }).tap();
    await expect(usage).toContainText("カメラ 使用中");
    await expect(usage).toContainText("マイク 未使用");
    // 別の重要通知があっても音声回復で消さず、同じ失敗通知を二重に作らない。
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        window.experienceFixture.failSave = true;
        SincroAppController.getCurrent().applySettings({ titleText: "保持する設定" });
        window.experienceFixture.failAudio = false;
        window.experienceFixture.holdAudio = true;
    });
    await notice.getByRole("button", { name: "マイクを再試行" }).tap();
    await expect(notice).not.toContainText("マイクの使用が許可されていません");
    await expect(notice).toContainText("設定が未保存です");
    await expect(usage).toContainText("マイク 取得中");
    await page.getByRole("button", { name: "基本設定を閉じる" }).tap();
    await page.evaluate(() => window.experienceFixture.releaseAudio());
    await expect
        .poll(() =>
            page.evaluate(() =>
                window.experienceFixture.tracks.some(
                    (track) => track.kind === "audio" && track.readyState === "live",
                ),
            ),
        )
        .toBe(true);
    await gear.tap();
    await page.getByRole("menuitem", { name: "基本設定" }).tap();
    await expect(usage).toContainText("マイク 使用中");
    expect(await page.evaluate(() => window.experienceFixture.videoRequests)).toBe(1);
    await page.getByRole("combobox", { name: "基本設定 カテゴリ" }).selectOption("screen");
    await expect(usage).toBeInViewport();
    await page.getByRole("button", { name: "接続を停止", exact: true }).tap();
    await expect(usage).toContainText("マイク 使用中");
    await expect(usage).toContainText("カメラ 使用中");
    // パネル表示中でも終了でき、非表示にしたメニュー項目へフォーカスを残さない。
    await gear.tap();
    await page.getByRole("menuitem", { name: "体験を終了" }).tap();
    await expect(gear).toBeFocused();
    await expect(usage).toContainText("マイク 未使用");
    await expect(usage).toContainText("カメラ 未使用");
    expect(
        await page.evaluate(() =>
            window.experienceFixture.tracks.every((track) => track.readyState === "ended"),
        ),
    ).toBe(true);
    await page.evaluate(() => {
        window.experienceFixture.holdAudio = false;
    });
    await gear.tap();
    await page.getByRole("menuitem", { name: "体験を開始" }).tap();
    await expect(usage).toContainText("マイク 使用中");
    await expect(usage).toContainText("カメラ 使用中");
    expect(await page.evaluate(() => window.experienceFixture.audioRequests)).toBe(3);
    expect(await page.evaluate(() => window.experienceFixture.videoRequests)).toBe(2);
    await gear.tap();
    await page.getByRole("menuitem", { name: "体験を終了" }).tap();
    await expect(usage).toContainText("マイク 未使用");
});
